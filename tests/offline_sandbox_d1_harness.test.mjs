import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {claimD1OperationOnce} from '../src/d1_claim.mjs';
import {createOfflineSandboxD1ReadHarness} from '../src/offline_sandbox_d1_harness.mjs';

const migration=readFileSync(new URL('../migrations/d1/0001_payment_claims.sql',import.meta.url),'utf8');
const params={quoteId:'q1',quoteVersion:2,request:{}};
const principal={verified:true,actorId:'owner',merchantId:'merchant'};
function sample(status='APPROVED'){
 const unit={reference_id:'q1',payee:{merchant_id:'merchant'},
 amount:{currency_code:'USD',value:'15.00'}};
 if(status==='COMPLETED')unit.payments={captures:[{
   id:'CAPTURE01',status:'COMPLETED',amount:{currency_code:'USD',value:'15.00'}
 }]};
 return {id:'ORDER01',intent:'CAPTURE',status,purchase_units:[unit]};
}
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'paypal-d1-compose-'));
 const path=join(dir,'claims.sqlite');
 const seed=new DatabaseSync(path);seed.exec('PRAGMA foreign_keys=ON');seed.exec(migration);
 seed.exec("INSERT INTO quotes(id,owner_id,merchant_id,version,currency,status,approval_actor,approval_version,approval_amount_minor) VALUES('q1','owner','merchant',2,'USD','APPROVED','owner',2,1500)");
 seed.close();const handles=[];
 function open(){
  const raw=new DatabaseSync(path);raw.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=3000');
  handles.push(raw);
  const db={prepare(sql){return {bind(...args){return {
   async run(){const row=raw.prepare(sql).run(...args);
     return {success:true,meta:{changes:Number(row.changes)}};},
   async first(){return raw.prepare(sql).get(...args)??null;}
  }}}}};
  return {raw,db};
 }
 return {open,close(){for(const h of handles)h.close();rmSync(dir,{recursive:true,force:true})}};
}
const within=fn=>async()=>{const f=fixture();try{await fn(f);}finally{f.close();}};
async function claimed(f,{orderId='ORDER01'}={}){
 const {raw,db}=f.open();
 await claimD1OperationOnce({db,quoteId:'q1',actorId:'owner',merchantId:'merchant',
 quoteVersion:2,operation:'create',requestId:'create-key'});
 if(orderId!==null)raw.prepare("UPDATE payment_attempts SET remote_id=? WHERE operation='create'").run(orderId);
 return {raw,db};
}
async function captured({raw,db}){
 raw.exec("UPDATE payment_attempts SET state='APPROVED' WHERE operation='create'");
 await claimD1OperationOnce({db,quoteId:'q1',actorId:'owner',merchantId:'merchant',
 quoteVersion:2,operation:'capture',requestId:'capture-key'});
}
function harness(db,order=sample(),resolveTrustedSession=async()=>principal){
 return createOfflineSandboxD1ReadHarness({db,resolveTrustedSession,orders:{ORDER01:order}});
}
const state=(raw,op='create')=>raw.prepare('SELECT state,remote_id FROM payment_attempts WHERE operation=?').get(op);

test('real Sandbox transport is composed with zero external requests and zero payment POST',within(async f=>{
 const a=await claimed(f);
 const service=harness(a.db);
 const result=await service.refreshOrder(params);
 assert.equal(result.status,'ORDER_APPROVED_BY_GET_CONTRACT');
 assert.equal(result.ledgerState,'APPROVED');
 assert.deepEqual(service.audit(),{token:1,orderGet:1,rejected:0,networkRequests:0,paymentPostRequests:0});
 assert.deepEqual(state(a.raw),{state:'APPROVED',remote_id:'ORDER01'});
}));
test('synthetic trust boundary does not accept user-controlled verified session body',within(async f=>{
 const a=await claimed(f);
 const service=harness(a.db,sample(),async()=>null);
 await assert.rejects(service.refreshOrder({
  ...params,request:{verified:true,actorId:'owner',merchantId:'merchant',role:'admin'}
 }),{code:'UNAUTHENTICATED'});
 assert.equal(service.audit().orderGet,0);
 assert.equal(state(a.raw).state,'IN_FLIGHT');
}));
test('wrong tenant has no provider GET, even when remote ID known',within(async f=>{
 const a=await claimed(f);
 for(const stranger of [
  {verified:true,actorId:'intruder',merchantId:'merchant'},
  {verified:true,actorId:'owner',merchantId:'wrong'}
 ]){
  const service=harness(a.db,sample(),async()=>stranger);
  await assert.rejects(service.refreshOrder(params),{code:'QUOTE_NOT_FOUND'});
  assert.equal(service.audit().token,0);
 }
}));
test('missing order ID never performs OAuth or provider GET',within(async f=>{
 const a=await claimed(f,{orderId:null}),svc=harness(a.db);
 const result=await svc.refreshOrder(params);
 assert.equal(result.status,'REMOTE_ORDER_ID_UNKNOWN_NO_RETRY');
 assert.equal(svc.audit().token,0);
 assert.equal(svc.audit().paymentPostRequests,0);
}));
test('CREATED from synthetic transport does not imply buyer approval',within(async f=>{
 const a=await claimed(f),svc=harness(a.db,sample('CREATED'));
 const r=await svc.refreshOrder(params);
 assert.equal(r.status,'BUYER_APPROVAL_PENDING_NO_POST');
 assert.equal(r.ledgerState,'IN_FLIGHT');
 assert.equal(svc.audit().orderGet,1);
}));
test('captured/completed order cannot be promoted directly by refreshOrder',within(async f=>{
 const a=await claimed(f),svc=harness(a.db,sample('COMPLETED'));
 assert.equal((await svc.refreshOrder(params)).status,'CAPTURE_RECONCILIATION_REQUIRED');
 assert.equal(state(a.raw).state,'IN_FLIGHT');
}));
test('real transport parses nested GET capture proof and local D1 CAS marks PAID',within(async f=>{
 const a=await claimed(f);await captured(a);
 const svc=harness(a.db,sample('COMPLETED'));
 const r=await svc.reconcileCapture(params);
 assert.equal(r.status,'CAPTURE_COMPLETED_BY_GET_CONTRACT');
 assert.equal(r.ledgerState,'PAID');
 assert.equal(r.realProviderAccessTested,false);
 assert.deepEqual(state(a.raw,'capture'),{state:'PAID',remote_id:'CAPTURE01'});
 assert.deepEqual(svc.audit(),{token:1,orderGet:1,rejected:0,networkRequests:0,paymentPostRequests:0});
}));
test('replayed capture completion cannot invoke even simulated GET twice',within(async f=>{
 const a=await claimed(f);await captured(a);const svc=harness(a.db,sample('COMPLETED'));
 await svc.reconcileCapture(params);
 await assert.rejects(svc.reconcileCapture(params),{code:'PAID_ALREADY_RECORDED_NO_REPEAT'});
 assert.equal(svc.audit().orderGet,1);
 assert.equal(a.raw.prepare('SELECT COUNT(*) AS n FROM payment_attempts').get().n,2);
}));
test('currency or amount or merchant mismatch from transport rejects with no paid status',within(async f=>{
 const a=await claimed(f);await captured(a);
 for(const mutate of [
  x=>x.purchase_units[0].payee.merchant_id='attacker',
  x=>x.purchase_units[0].amount.value='99.00',
  x=>x.purchase_units[0].amount.currency_code='EUR',
  x=>x.purchase_units[0].payments.captures[0].amount.value='10.00',
 ]) {
  const wrong=sample('COMPLETED');mutate(wrong);
  const svc=harness(a.db,wrong);
  await assert.rejects(svc.reconcileCapture(params),{code:'SANDBOX_GET_FAILED'});
  assert.equal(state(a.raw,'capture').state,'IN_FLIGHT');
 }
}));
test('malformed or absent synthetic order is rejected without fallback network',within(async f=>{
 const a=await claimed(f);
 const svc=createOfflineSandboxD1ReadHarness({db:a.db,
  resolveTrustedSession:async()=>principal,orders:{}});
 await assert.rejects(svc.refreshOrder(params),{code:'SANDBOX_GET_FAILED'});
 assert.equal(svc.audit().token,1);
 assert.equal(svc.audit().orderGet,1);
 assert.equal(svc.audit().networkRequests,0);
 assert.equal(state(a.raw).state,'IN_FLIGHT');
}));
test('fixture cloning prevents caller mutation after harness construction',within(async f=>{
 const a=await claimed(f),order=sample();
 const svc=harness(a.db,order);order.purchase_units[0].amount.value='999.00';
 assert.equal((await svc.refreshOrder(params)).ledgerState,'APPROVED');
}));
test('incorrect inputs are rejected without transport access',within(async f=>{
 const a=await claimed(f),svc=harness(a.db);
 await assert.rejects(svc.refreshOrder({...params,quoteVersion:1}),{code:'QUOTE_NOT_FOUND'});
 await assert.rejects(svc.refreshOrder({...params,quoteId:'not/allowed'}),{code:'INVALID_RECONCILIATION_INPUT'});
 assert.equal(svc.audit().orderGet,0);
}));
test('harness requires synthetic fixtures and trusted resolver; never accepts external fetchImpl',within(async f=>{
 const a=await claimed(f);
 assert.throws(()=>createOfflineSandboxD1ReadHarness({db:a.db,orders:{ORDER01:sample()}}),
 {code:'SERVER_SESSION_RESOLVER_REQUIRED'});
 assert.throws(()=>createOfflineSandboxD1ReadHarness({db:a.db,
  resolveTrustedSession:async()=>principal,orders:{ORDER01:{id:'OTHER'}}}),
 {code:'INVALID_SYNTHETIC_ORDER'});
 assert.throws(()=>createOfflineSandboxD1ReadHarness({db:a.db,
  resolveTrustedSession:async()=>principal,orders:null}),
 {code:'SYNTHETIC_ORDERS_REQUIRED'});
}));
