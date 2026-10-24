import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
function env(fn) {
 return async ()=>{
  const dir=mkdtempSync(join(tmpdir(),'paypal-contract-')), filename=join(dir,'state.db');
  let db;
  try {
   db=createSqliteLedger({filename});
   await db.insertQuote({id:'quote1',ownerId:'seller',merchantId:'merchant',version:3});
   await db.approve({id:'quote1',actorId:'seller',expectedVersion:3,amountMinor:1500});
   await fn({db,filename,reopen:()=>createSqliteLedger({filename})});
  } finally {db?.close();rmSync(dir,{recursive:true,force:true});}
 };
}
const draft=()=>({id:'ct1',quoteId:'quote1',actorId:'seller',merchantId:'merchant',
 reviewerId:'buyer',expectedVersion:3,eventId:'contract-created-1',
 milestones:[{id:'ms1',step:1,amountMinor:1000},{id:'ms2',step:2,amountMinor:500}]});
const read=()=>({contractId:'ct1',actorId:'seller',merchantId:'merchant'});
const move=(expectedVersion,expectedState,nextState,actorId,eventId,detail=null)=>({
 contractId:'ct1',milestoneId:'ms1',merchantId:'merchant',actorId,
 expectedVersion,expectedState,nextState,eventId,detail
});
test('approved quote creates immutable amount snapshot, ordered milestones, separate payment state',env(async ({db})=>{
 const c=await db.createContract(draft());
 assert.equal(c.amountMinor,1500);
 assert.equal(c.quoteVersion,3);
 assert.equal(c.paymentState,'NOT_CAPTURED');
 assert.deepEqual(c.milestones.map(m=>m.state),['PENDING','PENDING']);
 assert.deepEqual(c.milestones.map(m=>m.step),[1,2]);
 assert.equal((await db.listContractEvents(read())).length,1);
}));
test('contract must exactly equal approved snapshot; no partial inserts',env(async ({db})=>{
 await assert.rejects(db.createContract({...draft(),milestones:[{id:'a',step:1,amountMinor:1499}]}),{code:'CONTRACT_AMOUNT_MISMATCH'});
 await assert.rejects(db.getContract(read()),{code:'CONTRACT_NOT_FOUND'});
 const c=await db.createContract(draft());assert.equal(c.amountMinor,1500);
}));
test('quote stale version and wrong merchant or owner are blocked',env(async ({db})=>{
 for(const patch of [{expectedVersion:2},{actorId:'intruder'},{merchantId:'other'}]){
  await assert.rejects(db.createContract({...draft(),...patch}));
 }
 await db.createContract(draft());
 await assert.rejects(db.getContract({...read(),actorId:'intruder'}),{code:'CONTRACT_NOT_FOUND'});
 await assert.rejects(db.getContract({...read(),merchantId:'wrong'}),{code:'CONTRACT_NOT_FOUND'});
}));
test('invalid id, duplicate step, duplicate milestone, and amount overflow rejected',env(async ({db})=>{
 for(const milestones of [
  [{id:'x',step:2,amountMinor:1500}],
  [{id:'x',step:1,amountMinor:1000},{id:'x',step:2,amountMinor:500}],
  [{id:'x',step:1,amountMinor:100000000000000000}],
  [],
 ]) await assert.rejects(db.createContract({...draft(),milestones}));
 await db.createContract(draft());
 await assert.rejects(db.createContract({...draft(),id:'different',eventId:'different'}),{code:'CONTRACT_ALREADY_EXISTS'});
}));
test('contract prevents quote revision even before payment attempt exists',env(async ({db})=>{
 await db.createContract(draft());
 await assert.rejects(db.revise({id:'quote1',actorId:'seller',expectedVersion:3,
  scope:'revise this contract scope',suggestedMinor:1500,suggestionSource:'OFFLINE_MOCK'}),
  {code:'CONTRACT_EXISTS'});
 assert.equal((await db.get('quote1')).version,3);
}));
test('seller submits; distinct reviewer accepts; payment remains not captured',env(async ({db})=>{
 await db.createContract(draft());
 await assert.rejects(db.transitionMilestone(move(1,'PENDING','ACCEPTED','seller','bad')),
  {code:'INVALID_MILESTONE_TRANSITION'});
 let c=await db.transitionMilestone(move(1,'PENDING','SUBMITTED','seller','submit-1','Evidence package 1'));
 assert.equal(c.version,2); assert.equal(c.paymentState,'NOT_CAPTURED');
 await assert.rejects(db.transitionMilestone(move(2,'SUBMITTED','ACCEPTED','seller','bad2')),
  {code:'CONTRACT_ROLE_FORBIDDEN'});
 c=await db.transitionMilestone(move(2,'SUBMITTED','ACCEPTED','buyer','accept-1'));
 assert.equal(c.version,3);assert.equal(c.milestones[0].state,'ACCEPTED');
 assert.equal(c.milestones[1].state,'PENDING');
 assert.equal(c.paymentState,'NOT_CAPTURED');
 assert.deepEqual((await db.listContractEvents(read())).map(e=>e.eventType),
  ['CREATED','SUBMITTED','ACCEPTED']);
}));
test('buyer can reject, seller resubmits, buyer explicitly accepts',env(async ({db})=>{
 await db.createContract(draft());
 await db.transitionMilestone(move(1,'PENDING','SUBMITTED','seller','submit1','Initial files'));
 await db.transitionMilestone(move(2,'SUBMITTED','REJECTED','buyer','reject1','Needs revision'));
 await db.transitionMilestone(move(3,'REJECTED','SUBMITTED','seller','submit2','Revised files'));
 const c=await db.transitionMilestone(move(4,'SUBMITTED','ACCEPTED','buyer','accept1'));
 assert.equal(c.version,5);
 assert.equal(c.milestones[0].deliveryNote,'Revised files');
}));
test('wrong reviewer, wrong merchant, stale version/state and duplicate event never alter history',env(async ({db})=>{
 await db.createContract(draft());
 const send=move(1,'PENDING','SUBMITTED','seller','send1','Package for buyer');
 await db.transitionMilestone(send);
 const attempts=[
  move(1,'PENDING','SUBMITTED','seller','send2','other package'),
  move(2,'PENDING','SUBMITTED','seller','send3','other package'),
  move(2,'SUBMITTED','ACCEPTED','other','send4'),
  {...move(2,'SUBMITTED','ACCEPTED','buyer','send5'),merchantId:'other'},
  send,
 ];
 for(const item of attempts) await assert.rejects(db.transitionMilestone(item));
 const c=await db.getContract(read());
 assert.equal(c.version,2);
 assert.equal((await db.listContractEvents(read())).length,2);
}));
test('two database connections serialize competing version updates',env(async ({db,reopen})=>{
 const other=reopen();
 try {
  await db.createContract(draft());
  const results=await Promise.allSettled([
    db.transitionMilestone(move(1,'PENDING','SUBMITTED','seller','race-a','Proof number one')),
    other.transitionMilestone(move(1,'PENDING','SUBMITTED','seller','race-b','Proof number two'))
  ]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected').length,1);
  assert.equal((await db.getContract(read())).version,2);
 } finally {other.close();}
}));
test('old SQLite schema upgrades without losing approved quote/payment, survives restart',env(async ({db,reopen})=>{
 await db.claimOperation({quoteId:'quote1',actorId:'seller',merchantId:'merchant',operation:'create'});
 const c=await db.createContract(draft());
 assert.equal(c.paymentState,'NOT_CAPTURED');
 const next=reopen();
 try {
  assert.equal((await next.getContract(read())).version,1);
  assert.equal((await next.listContractEvents(read())).length,1);
  assert.equal((await next.get('quote1')).status,'APPROVED');
  assert.equal((await next.listAttempts('quote1')).length,1);
 } finally {next.close();}
}));
test('SQL audit history forbids update/delete and rejects event id reuse',env(async ({db,filename})=>{
 await db.createContract(draft());
 await assert.rejects(db.transitionMilestone(move(1,'PENDING','SUBMITTED','seller','contract-created-1','Valid evidence')),
 {code:'DUPLICATE_EVENT_ID'});
 const raw=new DatabaseSync(filename);
 try {
  assert.throws(()=>raw.exec("UPDATE contract_events SET detail='forged' WHERE seq=1"),/IMMUTABLE_EVENT/);
  assert.throws(()=>raw.exec("DELETE FROM contract_events WHERE seq=1"),/IMMUTABLE_EVENT/);
 } finally {raw.close();}
 assert.equal((await db.listContractEvents(read())).length,1);
}));
test('GET contract and history are strictly read-only',env(async ({db})=>{
 await db.createContract(draft());
 for(let i=0;i<5;i++){
  await db.getContract(read());await db.listContractEvents(read());
 }
 assert.equal((await db.listContractEvents(read())).length,1);
 assert.equal((await db.getContract(read())).version,1);
}));
