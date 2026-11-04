import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createWorkerD1PaymentBoundary} from '../src/worker_d1_payment_boundary.mjs';

const sql=readFileSync(new URL('../migrations/d1/0001_payment_claims.sql',import.meta.url),'utf8');
const args={request:{body:{verified:true,actorId:'attacker',merchantId:'attacker'}},
 quoteId:'q1',quoteVersion:2,operation:'create',requestId:'create_key'};
function setup(){
 const dir=mkdtempSync(join(tmpdir(),'paypal-worker-d1-'));
 const filename=join(dir,'db.sqlite');
 const seed=new DatabaseSync(filename);seed.exec('PRAGMA foreign_keys=ON');seed.exec(sql);
 seed.exec("INSERT INTO quotes(id,owner_id,merchant_id,version,currency,status,approval_actor,approval_version,approval_amount_minor) VALUES('q1','owner','merchant',2,'USD','APPROVED','owner',2,1500)");
 seed.close();
 const handles=[],modes=[],counters={run:0,first:0};
 const db={withSession(mode){
   modes.push(mode);
   if(mode!=='first-primary')throw Error('WRONG_CONSISTENCY');
   const raw=new DatabaseSync(filename);
   raw.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=2000');
   handles.push(raw);
   return {prepare(statement){return {bind(...parameters){return {
     async run(){counters.run++;const result=raw.prepare(statement).run(...parameters);
       return {success:true,meta:{changes:Number(result.changes)}};},
     async first(){counters.first++;return raw.prepare(statement).get(...parameters)??null;}
   };}};}};
 }};
 const boundary=resolver=>createWorkerD1PaymentBoundary({db,resolveVerifiedPrincipal:resolver});
 return {db,boundary,modes,counters,close(){for(const h of handles)h.close();rmSync(dir,{recursive:true,force:true});}};
}
const withDb=fn=>async()=>{const f=setup();try{await fn(f);}finally{f.close();}};
const verified=async()=>({verified:true,actorId:'owner',merchantId:'merchant'});

test('private D1 first-primary session claims once; concurrent calls cannot double claim',withDb(async f=>{
 const api=f.boundary(verified);
 const results=await Promise.all([api.claimOnce(args),api.claimOnce(args)]);
 assert.deepEqual(results.map(r=>r.action).sort(),
  ['FIRST_CLAIM_ONLY_NO_PROVIDER_CALL','RECONCILE_GET_FIRST']);
 assert.deepEqual(f.modes,['first-primary','first-primary']);
 assert.equal(f.counters.run,2);
}));

test('caller-supplied forged actor/merchant and body cannot grant identity',withDb(async f=>{
 const api=f.boundary(verified);
 assert.equal((await api.claimOnce({...args,actorId:'attacker',merchantId:'attacker'}))
   .action,'FIRST_CLAIM_ONLY_NO_PROVIDER_CALL');
 const outsider=f.boundary(async()=>({verified:true,actorId:'attacker',merchantId:'attacker'}));
 await assert.rejects(outsider.claimOnce({...args,requestId:'second'}),
  {code:'D1_CLAIM_PRECONDITION_OR_CONFLICT'});
 assert.equal(f.counters.run,2);
}));

test('unverified session is denied before any D1 session/query',withDb(async f=>{
 for(const principal of [null,{verified:false,actorId:'owner',merchantId:'merchant'},
  {verified:true,actorId:'bad|id',merchantId:'merchant'}]){
  await assert.rejects(f.boundary(async()=>principal).claimOnce(args),{code:'UNAUTHENTICATED'});
 }
 await assert.rejects(f.boundary(async()=>{throw Error('secret error')}).inspect(args),
  {code:'UNAUTHENTICATED'});
 assert.equal(f.modes.length,0);
}));

test('inspect is read-only and returns local-only proof, never payment permission',withDb(async f=>{
 const api=f.boundary(verified);
 await api.claimOnce(args);
 const before=f.counters.run;
 const state=await api.inspect(args);
 assert.equal(state.state,'IN_FLIGHT');
 assert.equal(state.action,'RECONCILE_GET_FIRST');
 assert.equal(state.allowProviderPost,false);
 assert.equal(state.verifiedPayPalGet,false);
 assert.equal(f.counters.run,before);
 assert.deepEqual(f.modes,['first-primary','first-primary']);
 assert.equal(typeof api.recoverStale,'undefined');
}));

test('restart and replay remain occupied, new request key cannot create a second claim',withDb(async f=>{
 const first=f.boundary(verified);
 await first.claimOnce(args);
 const restarted=f.boundary(verified);
 assert.equal((await restarted.claimOnce(args)).action,'RECONCILE_GET_FIRST');
 await assert.rejects(restarted.claimOnce({...args,requestId:'different_key'}),
  {code:'D1_CLAIM_PRECONDITION_OR_CONFLICT'});
}));

test('missing D1 session API or resolver fails closed',async()=>{
 assert.throws(()=>createWorkerD1PaymentBoundary({db:{prepare(){}} ,resolveVerifiedPrincipal:verified}),
  {code:'D1_SESSION_BINDING_REQUIRED'});
 assert.throws(()=>createWorkerD1PaymentBoundary({db:{withSession(){}}}),
  {code:'VERIFIED_IDENTITY_RESOLVER_REQUIRED'});
 const api=createWorkerD1PaymentBoundary({db:{withSession(){throw Error('db offline');}},
  resolveVerifiedPrincipal:verified});
 await assert.rejects(api.claimOnce(args),{code:'D1_PRIMARY_SESSION_UNAVAILABLE'});
});

test('invalid quote revision is denied and a read of a nonexistent attempt cannot mutate',withDb(async f=>{
 const api=f.boundary(verified);
 await assert.rejects(api.claimOnce({...args,quoteVersion:3}),
  {code:'D1_CLAIM_PRECONDITION_OR_CONFLICT'});
 const count=f.counters.run;
 await assert.rejects(api.inspect(args),{code:'ATTEMPT_NOT_FOUND'});
 assert.equal(f.counters.run,count);
}));

test('UNKNOWN result after a new session never authorizes another create',withDb(async f=>{
 const api=f.boundary(verified);
 await api.claimOnce(args);
 await f.db.withSession('first-primary')
   .prepare("UPDATE payment_attempts SET state='UNKNOWN' WHERE request_id='create_key'")
   .bind().run();
 const next=f.boundary(verified);
 const result=await next.claimOnce(args);
 assert.equal(result.action,'RECONCILE_GET_FIRST');
 assert.equal(result.attempt.state,'UNKNOWN');
 await assert.rejects(next.claimOnce({...args,requestId:'another_key'}),
   {code:'D1_CLAIM_PRECONDITION_OR_CONFLICT'});
}));

test('capture claim remains blocked until separate approved create is recorded',withDb(async f=>{
 const api=f.boundary(verified);
 const capture={...args,operation:'capture',requestId:'capture_key'};
 await assert.rejects(api.claimOnce(capture),
  {code:'D1_CLAIM_PRECONDITION_OR_CONFLICT'});
 await api.claimOnce(args);
 await assert.rejects(api.claimOnce(capture),
  {code:'D1_CLAIM_PRECONDITION_OR_CONFLICT'});
 await f.db.withSession('first-primary')
  .prepare("UPDATE payment_attempts SET state='APPROVED',remote_id='fictional_order' WHERE request_id='create_key'")
  .bind().run();
 assert.equal((await api.claimOnce(capture)).action,'FIRST_CLAIM_ONLY_NO_PROVIDER_CALL');
 assert.equal((await api.claimOnce(capture)).action,'RECONCILE_GET_FIRST');
}));
