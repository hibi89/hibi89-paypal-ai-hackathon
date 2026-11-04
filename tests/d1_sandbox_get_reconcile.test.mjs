import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {claimD1OperationOnce} from '../src/d1_claim.mjs';
import {createD1SandboxGetReconciler} from '../src/d1_sandbox_get_reconcile.mjs';
const sql=readFileSync(new URL('../migrations/d1/0001_payment_claims.sql',import.meta.url),'utf8');
const ids={quoteId:'q1',quoteVersion:2};
const merchant='merchant',owner='owner',orderId='ORDER01';
function setup(){
 const folder=mkdtempSync(join(tmpdir(),'d1-get-'));
 const file=join(folder,'d1.sqlite'), handles=[];
 const db0=new DatabaseSync(file);
 db0.exec('PRAGMA foreign_keys=ON');db0.exec(sql);
 db0.exec("INSERT INTO quotes(id,owner_id,merchant_id,version,currency,status,approval_actor,approval_version,approval_amount_minor) VALUES('q1','owner','merchant',2,'USD','APPROVED','owner',2,1500)");
 db0.close();
 function open(){
  const raw=new DatabaseSync(file);raw.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=3000');handles.push(raw);
  return {raw,db:{prepare(statement){return {bind(...params){return {
   async first(){return raw.prepare(statement).get(...params)??null},
   async run(){const r=raw.prepare(statement).run(...params);
     return {success:true,meta:{changes:Number(r.changes)}}}
  }}}}}};
 }
 return {open,close(){for(const raw of handles)raw.close();rmSync(folder,{recursive:true,force:true})}};
}
const using=fn=>async()=>{const f=setup();try{await fn(f)}finally{f.close()}};
const quote={id:'q1',ownerId:owner,merchantId:merchant,version:2,currency:'USD',
 approval:{actorId:owner,quoteVersion:2,decision:'APPROVED',amountMinor:1500}};
function order(status='APPROVED'){
 const unit={reference_id:'q1',payee:{merchant_id:merchant},
 amount:{currency_code:'USD',value:'15.00'}};
 if(status==='COMPLETED') unit.payments={captures:[{
  id:'CAPTURE01',status:'COMPLETED',amount:{currency_code:'USD',value:'15.00'}
 }]};
 return {id:orderId,intent:'CAPTURE',status,purchase_units:[unit]};
}
const proof=()=>({order:order('COMPLETED'),capture:{
 id:'CAPTURE01',orderId:orderId,status:'COMPLETED',
 amount:{currency_code:'USD',value:'15.00'}
}});
function backend(db,transport,resolveSession=async()=>({
 verified:true,actorId:owner,merchantId:merchant
})){
 return createD1SandboxGetReconciler({db,resolveSession,
  transport:transport??{mode:'SANDBOX_ONLY',
   async getOrder(){return order()},
   async getCaptureProof(){return proof()}}});
}
async function claimed(f){
 const x=f.open();
 await claimD1OperationOnce({db:x.db,quoteId:'q1',actorId:owner,
 merchantId:merchant,quoteVersion:2,operation:'create',requestId:'create-key'});
 return x;
}
function bindOrderId(x){
 x.raw.exec("UPDATE payment_attempts SET remote_id='ORDER01' WHERE operation='create'");
}
const getAttempt=(x,operation='create')=>x.raw.prepare(
 'SELECT * FROM payment_attempts WHERE operation=?').get(operation);
async function capturedClaim(x){
 await claimD1OperationOnce({db:x.db,quoteId:'q1',actorId:owner,
 merchantId:merchant,quoteVersion:2,operation:'capture',requestId:'capture-key'});
}
test('only private SANDBOX_ONLY GET transport and resolver permitted',using(async f=>{
 const x=await claimed(f);
 assert.throws(()=>createD1SandboxGetReconciler({db:x.db,transport:{mode:'SANDBOX_ONLY'}}),
 {code:'TRUSTED_SESSION_RESOLVER_REQUIRED'});
 assert.throws(()=>createD1SandboxGetReconciler({db:x.db,resolveSession:async()=>({})}),
 {code:'PRIVATE_SANDBOX_GET_TRANSPORT_REQUIRED'});
 assert.throws(()=>backend(x.db,{mode:'LIVE',getOrder(){},getCaptureProof(){}}),
 {code:'PRIVATE_SANDBOX_GET_TRANSPORT_REQUIRED'});
}));
test('client-forged identity cannot cause GET or DB change',using(async f=>{
 const x=await claimed(f);bindOrderId(x);
 let gets=0;
 const transport={mode:'SANDBOX_ONLY',getOrder(){gets++;return order()},
 getCaptureProof(){gets++;return proof()}};
 await assert.rejects(backend(x.db,transport,async()=>null).refreshOrder({
 ...ids,request:{verified:true,actorId:owner,merchantId:merchant}}),
 {code:'UNAUTHENTICATED'});
 assert.equal(gets,0);assert.equal(getAttempt(x).state,'IN_FLIGHT');
}));
test('tenant and merchant isolation prevent remote GET',using(async f=>{
 const x=await claimed(f);bindOrderId(x);let gets=0;
 const transport={mode:'SANDBOX_ONLY',getOrder(){gets++;return order()},
 getCaptureProof(){gets++;return proof()}};
 for(const session of [
 {verified:true,actorId:'intruder',merchantId:merchant},
 {verified:true,actorId:owner,merchantId:'foreign'}]){
  await assert.rejects(backend(x.db,transport,async()=>session)
   .refreshOrder({...ids,request:{}}),{code:'QUOTE_NOT_FOUND'});
 }
 assert.equal(gets,0);assert.equal(getAttempt(x).state,'IN_FLIGHT');
}));
test('unknown remote order ID demands manual resolution without GET or retry',using(async f=>{
 const x=await claimed(f);let calls=0;
 const transport={mode:'SANDBOX_ONLY',getOrder(){calls++;return order()},
 getCaptureProof(){calls++;return proof()}};
 const result=await backend(x.db,transport).refreshOrder({...ids,request:{}});
 assert.equal(result.status,'REMOTE_ORDER_ID_UNKNOWN_NO_RETRY');
 assert.equal(result.paymentPostAttempted,false);assert.equal(calls,0);
}));
test('fresh backend GET APPROVED writes create state via D1 CAS',using(async f=>{
 const x=await claimed(f);bindOrderId(x);
 const result=await backend(x.db).refreshOrder({...ids,request:{}});
 assert.equal(result.status,'ORDER_APPROVED_BY_GET_CONTRACT');
 assert.equal(result.ledgerState,'APPROVED');
 assert.equal(result.realProviderAccessTested,false);
 assert.equal(result.paymentPostAttempted,false);
 assert.equal(getAttempt(x).remote_id,orderId);
}));
test('CREATED and COMPLETED GET never mark create APPROVED without approval evidence',using(async f=>{
 const x=await claimed(f);bindOrderId(x);
 for(const state of ['CREATED','COMPLETED']){
  const transport={mode:'SANDBOX_ONLY',async getOrder(){return order(state)},
  async getCaptureProof(){return proof()}};
  const v=await backend(x.db,transport).refreshOrder({...ids,request:{}});
  assert.equal(v.ledgerState,'IN_FLIGHT');
 }
 assert.equal(getAttempt(x).state,'IN_FLIGHT');
}));
test('wrong merchant, amount, currency, intent, id, reference, or extra units reject GET',using(async f=>{
 const x=await claimed(f);bindOrderId(x);
 const bad=[
  {...order(),id:'ANOTHER'},
  {...order(),intent:'AUTHORIZE'},
  {...order(),purchase_units:[{...order().purchase_units[0],reference_id:'other'}]},
  {...order(),purchase_units:[{...order().purchase_units[0],payee:{merchant_id:'other'}}]},
  {...order(),purchase_units:[{...order().purchase_units[0],amount:{currency_code:'USD',value:'99.00'}}]},
  {...order(),purchase_units:[{...order().purchase_units[0],amount:{currency_code:'EUR',value:'15.00'}}]},
  {...order(),purchase_units:[...order().purchase_units,...order().purchase_units]},
 ];
 for(const value of bad){
  const transport={mode:'SANDBOX_ONLY',async getOrder(){return value},
    async getCaptureProof(){return proof()}};
  await assert.rejects(backend(x.db,transport).refreshOrder({...ids,request:{}}),
    {code:'ORDER_GET_PROOF_MISMATCH'});
 }
 assert.equal(getAttempt(x).state,'IN_FLIGHT');
}));
test('provider GET network failure is sanitized and never mutates attempts',using(async f=>{
 const x=await claimed(f);bindOrderId(x);
 const transport={mode:'SANDBOX_ONLY',
  async getOrder(){throw new Error('DO_NOT_EXPOSE_PROVIDER_TOKEN')},
  async getCaptureProof(){throw new Error('DO_NOT_EXPOSE_PROVIDER_TOKEN')}};
 await assert.rejects(backend(x.db,transport).refreshOrder({...ids,request:{}}),
  {code:'SANDBOX_GET_FAILED'});
 assert.equal(getAttempt(x).state,'IN_FLIGHT');
}));
test('replayed APPROVED GET does not issue POST or produce extra attempts',using(async f=>{
 const x=await claimed(f);bindOrderId(x);const v=backend(x.db);
 for(let i=0;i<3;i++)assert.equal((await v.refreshOrder({...ids,request:{}})).ledgerState,'APPROVED');
 assert.equal(x.raw.prepare('SELECT count(*) AS n FROM payment_attempts').get().n,1);
}));
test('capture rejected before create verified APPROVED or before capture claim',using(async f=>{
 const x=await claimed(f);bindOrderId(x);
 await assert.rejects(backend(x.db).reconcileCapture({...ids,request:{}}),
  {code:'CAPTURE_CLAIMS_REQUIRED'});
 x.raw.exec("UPDATE payment_attempts SET state='APPROVED'");
 await assert.rejects(backend(x.db).reconcileCapture({...ids,request:{}}),
  {code:'CAPTURE_CLAIMS_REQUIRED'});
}));
test('uncompleted captured proof must preserve UNKNOWN and forbid new POST',using(async f=>{
 const x=await claimed(f);bindOrderId(x);
 await backend(x.db).refreshOrder({...ids,request:{}});
 await capturedClaim(x);
 x.raw.exec("UPDATE payment_attempts SET state='UNKNOWN' WHERE operation='capture'");
 const transport={mode:'SANDBOX_ONLY',async getOrder(){return order()},
 async getCaptureProof(){return {order:order('APPROVED'),capture:null}}};
 const result=await backend(x.db,transport).reconcileCapture({...ids,request:{}});
 assert.equal(result.status,'CAPTURE_NOT_COMPLETED_NO_RETRY');
 assert.equal(getAttempt(x,'capture').state,'UNKNOWN');
 assert.equal(result.paymentPostAttempted,false);
}));
test('valid mocked capture GET sets PAID exactly once with matching approval',using(async f=>{
 const x=await claimed(f);bindOrderId(x);
 await backend(x.db).refreshOrder({...ids,request:{}});
 await capturedClaim(x);
 x.raw.exec("UPDATE payment_attempts SET state='UNKNOWN' WHERE operation='capture'");
 const result=await backend(x.db).reconcileCapture({...ids,request:{}});
 assert.equal(result.status,'CAPTURE_COMPLETED_BY_GET_CONTRACT');
 assert.equal(result.ledgerState,'PAID');
 assert.equal(result.realProviderAccessTested,false);
 assert.equal(getAttempt(x,'capture').remote_id,'CAPTURE01');
 const f2=f.open();
 await assert.rejects(backend(f2.db).reconcileCapture({...ids,request:{}}),
  {code:'PAID_ALREADY_RECORDED_NO_REPEAT'});
 assert.equal(f2.raw.prepare('SELECT count(*) AS n FROM payment_attempts').get().n,2);
}));
test('capture proof ID, amount, status, order, and nested PayPal capture must match',using(async f=>{
 const x=await claimed(f);bindOrderId(x);
 await backend(x.db).refreshOrder({...ids,request:{}});
 await capturedClaim(x);
 const p=proof();
 const bad=[
  {...p,capture:{...p.capture,id:'BOGUS'}},
  {...p,capture:{...p.capture,orderId:'BOGUS'}},
  {...p,capture:{...p.capture,amount:{currency_code:'USD',value:'17.00'}}},
  {...p,capture:{...p.capture,status:'PENDING'}},
  {...p,order:{...p.order,purchase_units:[{...p.order.purchase_units[0],payments:{captures:[]}}]}},
  {...p,order:{...p.order,purchase_units:[{...p.order.purchase_units[0],payee:{merchant_id:'wrong'}}]}},
 ];
 for(const proofValue of bad){
  const transport={mode:'SANDBOX_ONLY',async getOrder(){return order()},
   async getCaptureProof(){return proofValue}};
  await assert.rejects(backend(x.db,transport).reconcileCapture({...ids,request:{}}));
 }
 assert.equal(getAttempt(x,'capture').state,'IN_FLIGHT');
}));
test('capture foreign ID and failing GET never changes unknown to PAID',using(async f=>{
 const x=await claimed(f);bindOrderId(x);
 await backend(x.db).refreshOrder({...ids,request:{}});
 await capturedClaim(x);
 x.raw.exec("UPDATE payment_attempts SET state='UNKNOWN',remote_id='PREVIOUS' WHERE operation='capture'");
 await assert.rejects(backend(x.db).reconcileCapture({...ids,request:{}}),
 {code:'CAPTURE_REMOTE_ID_CONFLICT'});
 assert.equal(getAttempt(x,'capture').state,'UNKNOWN');
}));
test('invalid quote version is rejected before remote call',using(async f=>{
 const x=await claimed(f);bindOrderId(x);
 await assert.rejects(backend(x.db).refreshOrder({...ids,quoteVersion:1,request:{}}),
 {code:'QUOTE_NOT_FOUND'});
 await assert.rejects(backend(x.db).refreshOrder({...ids,quoteVersion:0,request:{}}),
 {code:'INVALID_RECONCILIATION_INPUT'});
 assert.equal(getAttempt(x).state,'IN_FLIGHT');
}));

test('PAYER_ACTION_REQUIRED GET is pending and cannot CAS-approve a create attempt',using(async f=>{
 const x=await claimed(f);bindOrderId(x);
 const transport={mode:'SANDBOX_ONLY',
  async getOrder(){return order('PAYER_ACTION_REQUIRED')},
  async getCaptureProof(){throw Error('GET capture never expected')}};
 const result=await backend(x.db,transport).refreshOrder({...ids,request:{}});
 assert.equal(result.status,'BUYER_APPROVAL_PENDING_NO_POST');
 assert.equal(result.ledgerState,'IN_FLIGHT');
 assert.equal(getAttempt(x).state,'IN_FLIGHT');
}));
