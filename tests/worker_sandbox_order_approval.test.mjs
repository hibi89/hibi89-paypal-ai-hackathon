import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createWorkerSandboxApprovalReconcile} from '../src/worker_sandbox_order_approval.mjs';
import {createWorkerPaymentClaimGate} from '../src/worker_payment_claim_gate.mjs';
import {createPinnedPayPalSandboxGetTransport} from '../src/worker_pinned_paypal_sandbox_get.mjs';
import {createPrivateWorkerIdentityReadRouter} from '../src/worker_private_identity_read_router.mjs';

const ORIGIN='https://fixture.invalid', MERCHANT='PAYPALMERCH13';
const OWNER='owner1', ISSUER='https://idp.invalid', SUB='a'.repeat(64),T=1800000000000;
const COOKIE=Buffer.alloc(32,19).toString('base64url');
const DIGEST=createHash('sha256').update(COOKIE).digest('hex');
const ARGS={requestId:'req1',quoteId:'quote1',quoteVersion:1,ownerId:OWNER,merchantId:MERCHANT};
const load=name=>readFileSync(new URL('../migrations/d1/'+name,import.meta.url),'utf8');
const remote=(override={})=>({id:'ORDER_001',intent:'CAPTURE',status:'APPROVED',
 purchase_units:[{reference_id:'quote1',payee:{merchant_id:MERCHANT},amount:{currency_code:'USD',value:'1.50'}}],...override});
function fixture({provider=remote(),afterGet,throwGet=false,
 withoutAudit=false,d1TotalChanges=false,forgedTwoWithoutWrite=false}={}){
 const sql=new DatabaseSync(':memory:');
 for(const name of ['0001_payment_claims.sql','0002_worker_private_sessions.sql',
  '0003_worker_private_oidc.sql','0004_worker_private_binding_epoch.sql',
  '0005_payment_attempt_audit.sql','0006_payment_state_integrity.sql'])sql.exec(load(name));
 sql.prepare('INSERT INTO worker_private_oidc_bindings(issuer,subject_hmac,actor_id,merchant_id,role) VALUES(?,?,?,?,?)')
 .run(ISSUER,SUB,OWNER,MERCHANT,'OWNER');
 sql.prepare('INSERT INTO worker_private_sessions(token_sha256,actor_id,merchant_id,role,issuer,issuer_verified_at_ms,expires_at_ms,binding_subject_hmac,binding_revision) VALUES(?,?,?,?,?,?,?,?,1)')
 .run(DIGEST,OWNER,MERCHANT,'OWNER',ISSUER,T-1000,T+60000,SUB);
 sql.prepare('INSERT INTO quotes(id,owner_id,merchant_id,version,currency,status,approval_actor,approval_version,approval_amount_minor) VALUES(?,?,?,?,?,?,?,?,?)')
 .run('quote1',OWNER,MERCHANT,1,'USD','APPROVED',OWNER,1,150);
 const db={withSession(mode){assert.equal(mode,'first-primary');return {
  prepare(query){return {bind(...params){return {
   async first(){return sql.prepare(query).get(...params)??null;},
   async run(){
    if(forgedTwoWithoutWrite&&query.startsWith("UPDATE payment_attempts SET state='APPROVED'"))
     return {meta:{changes:2}};
    const result=sql.prepare(query).run(...params);
    const total=d1TotalChanges&&query.startsWith("UPDATE payment_attempts SET state='APPROVED'")&&
     result.changes===1?2:result.changes;
    return {meta:{changes:total}};
   },
   async all(){return {results:sql.prepare(query).all(...params)};}
  }}}}
 };}};
 let gets=0;
 const transport=createPinnedPayPalSandboxGetTransport({enabled:true,
  getAccessToken:async()=> 'sandbox-test-token',
  fetchImpl:async(url,options)=>{gets++;
   assert.equal(url,'https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER_001');
   assert.equal(options.method,'GET');
   assert.equal(options.redirect,'error');
   if(throwGet)throw Error('SYNTHETIC_GET_UNAVAILABLE');
   if(afterGet)await afterGet(sql);
   return new Response(JSON.stringify(provider),{status:200,
    headers:{'content-type':'application/json'}});
  }});
 const gate=createWorkerPaymentClaimGate({db});
 const make=(options={})=>createWorkerSandboxApprovalReconcile({db,allowedOrigin:ORIGIN,
  bodyReadTimeoutMs:options.bodyReadTimeoutMs??2000,
  expectedMerchantId:MERCHANT,transport,enabled:true,now:()=>T});
 return {sql,db,transport,gate,make,gets:()=>gets,withoutAudit};
}
function request({body={requestId:'req1',quoteId:'quote1',quoteVersion:1},headers={},path='/__private/paypal/reconcile-approved'}={}){
 return new Request(ORIGIN+path,{method:'POST',headers:{origin:ORIGIN,
  'sec-fetch-site':'same-origin','content-type':'application/json',
  'x-proofline-intent':'sandbox-get-approved-reconcile-only',
  cookie:'__Host-proofline_session='+COOKIE,...headers},body:JSON.stringify(body)});
}
const state=sql=>sql.prepare('SELECT state,remote_id FROM payment_attempts').get();
const audit=sql=>sql.prepare('SELECT event_type,after_state FROM payment_attempt_audit ORDER BY sequence').all();
async function claimed(f,{unknown=false}={}){
 assert.equal((await f.gate.claim(ARGS)).claimed,true);
 assert.equal((await f.gate.persistRemoteOrder({...ARGS,remoteId:'ORDER_001'})).persisted,true);
 if(unknown)await f.gate.markUnknown(ARGS);
}

test('only explicit dependencies can enable the reconciliation surface',()=>{
 const f=fixture();
 assert.throws(()=>createWorkerSandboxApprovalReconcile({db:f.db,allowedOrigin:ORIGIN,
  transport:f.transport,expectedMerchantId:MERCHANT}),/EXPLICIT_DEPENDENCIES/);
 assert.throws(()=>createWorkerSandboxApprovalReconcile({db:f.db,allowedOrigin:ORIGIN,
  transport:{...f.transport,paymentPostsEnabled:true},expectedMerchantId:MERCHANT,enabled:true}),/EXPLICIT_DEPENDENCIES/);
 assert.throws(()=>createWorkerSandboxApprovalReconcile({db:f.db,allowedOrigin:ORIGIN,
  transport:{...f.transport,mode:'PAYPAL_LIVE'},expectedMerchantId:MERCHANT,enabled:true}),/EXPLICIT_DEPENDENCIES/);
 f.sql.close();
});

test('APPROVED sandbox GET atomically reconciles existing UNKNOWN to APPROVED; never PAID',async()=>{
 const f=fixture();await claimed(f,{unknown:true});
 const n=audit(f.sql).length;
 const response=await f.make().fetch(request());
 assert.equal(response.status,200);const result=await response.json();
 assert.equal(result.status,'APPROVED_GET_RECONCILED_NO_CAPTURE');
 assert.equal(result.paymentAuthorized,false);
 assert.equal(result.captureAuthorized,false);
 assert.equal(result.paymentPosts,0);
 assert.equal(result.providerReceiptIsPaymentAuthorization,false);
 assert.deepEqual({...state(f.sql)},{state:'APPROVED',remote_id:'ORDER_001'});
 assert.equal(audit(f.sql).length,n+1);
 assert.equal(f.gets(),1);
 f.sql.close();
});

test('trigger-inclusive D1 2-change count reconciles only with exact APPROVED audit tail',async()=>{
 const f=fixture({d1TotalChanges:true});await claimed(f,{unknown:true});
 const old=audit(f.sql).length;
 const response=await f.make().fetch(request());
 assert.equal(response.status,200);
 assert.equal((await response.json()).ledgerState,'APPROVED');
 assert.equal(audit(f.sql).length,old+1);
 assert.equal(audit(f.sql).at(-1).after_state,'APPROVED');
 assert.equal((await f.make().fetch(request())).status,409);
 assert.equal(f.gets(),1);f.sql.close();
});
test('forged two-change result without a state or audit write fails closed',async()=>{
 const f=fixture({forgedTwoWithoutWrite:true});await claimed(f);
 const response=await f.make().fetch(request());
 assert.equal(response.status,409);
 assert.equal(state(f.sql).state,'IN_FLIGHT');
 assert.equal(audit(f.sql).at(-1).after_state,'IN_FLIGHT');
 f.sql.close();
});
test('IN_FLIGHT to APPROVED is supported but duplicate request cannot write again',async()=>{
 const f=fixture();await claimed(f);
 assert.equal((await f.make().fetch(request())).status,200);
 assert.equal((await f.make().fetch(request())).status,409);
 assert.equal(audit(f.sql).filter(e=>e.after_state==='APPROVED').length,1);
 assert.equal(f.gets(),1);
 f.sql.close();
});

test('CREATED, COMPLETED and PAYER_ACTION_REQUIRED do not mark any payment state',async()=>{
 for(const status of ['CREATED','COMPLETED','PAYER_ACTION_REQUIRED']){
  const f=fixture({provider:remote({status})});await claimed(f,{unknown:true});
  const n=audit(f.sql).length;
  const response=await f.make().fetch(request());
  assert.equal(response.status,409);
  assert.equal(state(f.sql).state,'UNKNOWN');
  assert.equal(audit(f.sql).length,n);
  f.sql.close();
 }
});

test('provider identity, payee, price, reference and purchase unit mismatches are rejected',async()=>{
 const valid=remote();
 const altered=[remote({id:'ORDER_IMPOSTOR'}),remote({intent:'AUTHORIZE'}),
  remote({purchase_units:[]}),remote({purchase_units:[...valid.purchase_units,...valid.purchase_units]}),
  remote({purchase_units:[{...valid.purchase_units[0],reference_id:'otherQuote'}]}),
  remote({purchase_units:[{...valid.purchase_units[0],payee:{merchant_id:'SOMEMERCHANT1'}}]}),
  remote({purchase_units:[{...valid.purchase_units[0],amount:{currency_code:'EUR',value:'1.50'}}]}),
  remote({purchase_units:[{...valid.purchase_units[0],amount:{currency_code:'USD',value:'9.99'}}]})];
 for(const provider of altered){
  const f=fixture({provider});await claimed(f);
  assert.equal((await f.make().fetch(request())).status,409);
  assert.equal(state(f.sql).state,'IN_FLIGHT');
  f.sql.close();
 }
});

test('untrusted request body, role cookie and CSRF fail before any provider GET',async()=>{
 const f=fixture();await claimed(f);
 const handler=f.make();
 for(const req of [
  request({body:{requestId:'req1',quoteId:'quote1',quoteVersion:1,ownerId:'other'}}),
  request({body:{requestId:'req1',quoteId:'quote1',quoteVersion:1,remoteId:'FAKE'}}),
  request({headers:{origin:'https://evil.invalid'}}),
  request({headers:{'x-proofline-intent':'capture'}}),
  request({headers:{cookie:'__Host-proofline_session='+COOKIE+'; __Host-proofline_contract_role=role'}}),
  request({headers:{cookie:''}}),
  request({path:'/__private/paypal/reconcile-approved?force=1'})
 ])assert.notEqual((await handler.fetch(req)).status,200);
 assert.equal(f.gets(),0);
 assert.equal(state(f.sql).state,'IN_FLIGHT');
 f.sql.close();
});

test('revocation and OIDC reassignment during GET refuse ledger changes',async()=>{
 for(const mutate of [
  sql=>sql.prepare('UPDATE worker_private_sessions SET revoked_at_ms=?').run(T-1),
  sql=>sql.prepare('UPDATE worker_private_oidc_bindings SET active=0').run(),
  sql=>sql.prepare('UPDATE worker_private_oidc_bindings SET actor_id=?').run('another')
 ]){
  const f=fixture({afterGet:mutate});await claimed(f);
  assert.equal((await f.make().fetch(request())).status,401);
  assert.equal(state(f.sql).state,'IN_FLIGHT');
  f.sql.close();
 }
});

test('provider GET errors, missing audit and expired session never permit approval',async()=>{
 const f=fixture({throwGet:true});await claimed(f);
 assert.equal((await f.make().fetch(request())).status,503);
 assert.equal(state(f.sql).state,'IN_FLIGHT');f.sql.close();
 const missing=fixture();await claimed(missing);
 missing.sql.exec('DROP TABLE payment_attempt_audit');
 assert.equal((await missing.make().fetch(request())).status,503);
 assert.equal(state(missing.sql).state,'IN_FLIGHT');missing.sql.close();
 const expired=fixture();await claimed(expired);
 expired.sql.prepare('UPDATE worker_private_sessions SET expires_at_ms=?').run(T);
 assert.equal((await expired.make().fetch(request())).status,401);
 assert.equal(expired.gets(),0);expired.sql.close();
});

test('claim state changes during provider GET cannot overwrite later PAID',async()=>{
 const f=fixture({afterGet:sql=>{
  sql.exec("UPDATE payment_attempts SET state='APPROVED'");
  sql.exec("UPDATE payment_attempts SET state='PAID'");
 }});await claimed(f);
 assert.equal((await f.make().fetch(request())).status,409);
 assert.equal(state(f.sql).state,'PAID');
 assert.equal(audit(f.sql).filter(e=>e.after_state==='APPROVED').length,1);
 f.sql.close();
});

test('concurrent GET confirmation is single-winner, with one APPROVED audit event',async()=>{
 const f=fixture();await claimed(f);
 const responses=await Promise.all(Array.from({length:5},()=>f.make().fetch(request())));
 assert.equal(responses.filter(x=>x.status===200).length,1);
 assert.equal(responses.filter(x=>x.status===409).length,4);
 assert.equal(audit(f.sql).filter(x=>x.after_state==='APPROVED').length,1);
 f.sql.close();
});


test('full private host leaves reconciliation dark until separate explicit approval flag',async()=>{
 const f=fixture();await claimed(f,{unknown:true});
 const auth={revoke:async()=>{throw Error('UNUSED')}};
 const pkce={start:async()=>new Response(null,{status:503}),
  callback:async()=>new Response(null,{status:503})};
 const config={db:f.db,allowedOrigin:ORIGIN,authority:auth,pkceCoordinator:pkce,
  enabled:true,now:()=>T,sandboxOrderGetTransport:f.transport,
  sandboxExpectedMerchantId:MERCHANT};
 const dark=createPrivateWorkerIdentityReadRouter(config);
 assert.equal((await dark.fetch(request())).status,404);
 assert.equal(f.gets(),0);
 const enabled=createPrivateWorkerIdentityReadRouter({...config,
  sandboxOrderApprovalEnabled:true});
 const result=await enabled.fetch(request());
 assert.equal(result.status,200);
 assert.equal((await result.json()).ledgerState,'APPROVED');
 assert.equal(f.gets(),1);
 f.sql.close();
});

test('host read-only order proof flag cannot implicitly enable approval reconciliation',async()=>{
 const f=fixture();await claimed(f);
 const auth={revoke:async()=>{throw Error('UNUSED')}};
 const pkce={start:async()=>new Response(null,{status:503}),
  callback:async()=>new Response(null,{status:503})};
 const host=createPrivateWorkerIdentityReadRouter({db:f.db,allowedOrigin:ORIGIN,
  authority:auth,pkceCoordinator:pkce,enabled:true,now:()=>T,
  sandboxOrderProofEnabled:true,sandboxOrderGetTransport:f.transport,
  sandboxExpectedMerchantId:MERCHANT});
 assert.equal((await host.fetch(request())).status,404);
 assert.equal(f.gets(),0);
 f.sql.close();
});

test('approval CAS refuses audit tail whose recorded state differs from current ledger',async()=>{
 const f=fixture();await claimed(f);
 // A direct D1 writer can lose the audit trigger; the state would drift.
 f.sql.exec('DROP TRIGGER payment_attempt_audit_on_state_or_remote');
 await f.gate.markUnknown(ARGS);
 assert.equal(state(f.sql).state,'UNKNOWN');
 assert.equal(audit(f.sql).at(-1).after_state,'IN_FLIGHT');
 const before=audit(f.sql).length;
 const result=await f.make().fetch(request());
 assert.equal(result.status,409);
 assert.equal(state(f.sql).state,'UNKNOWN');
 assert.equal(audit(f.sql).length,before);
 f.sql.close();
});

test('approval CAS refuses forged latest audit row with the wrong PayPal order reference',async()=>{
 const f=fixture();await claimed(f);
 f.sql.prepare(`INSERT INTO payment_attempt_audit
 (request_id,quote_id,quote_version,merchant_id,operation,event_type,before_state,after_state,remote_id)
 VALUES('req1','quote1',1,?,'create','REMOTE_ID_BOUND','IN_FLIGHT','IN_FLIGHT','OTHER_ORDER')`).run(MERCHANT);
 const result=await f.make().fetch(request());
 assert.equal(result.status,409);
 assert.equal(state(f.sql).state,'IN_FLIGHT');
 assert.equal(audit(f.sql).filter(e=>e.after_state==='APPROVED').length,0);
 f.sql.close();
});

test('approval CAS refuses audit event whose owner, version or operation metadata is inconsistent',async()=>{
 for(const mismatch of [
  {quote_id:'OTHER_QUOTE'}, {quote_version:2},
  {merchant_id:'WRONGMERCH123'}, {operation:'capture'}
 ]){
  const f=fixture();await claimed(f);
  const record={request_id:'req1',quote_id:'quote1',quote_version:1,
   merchant_id:MERCHANT,operation:'create',event_type:'STATE_CHANGED',
   before_state:'IN_FLIGHT',after_state:'IN_FLIGHT',remote_id:'ORDER_001',...mismatch};
  f.sql.prepare(`INSERT INTO payment_attempt_audit
 (request_id,quote_id,quote_version,merchant_id,operation,event_type,before_state,after_state,remote_id)
 VALUES(?,?,?,?,?,?,?,?,?)`).run(record.request_id,record.quote_id,record.quote_version,
   record.merchant_id,record.operation,record.event_type,record.before_state,
   record.after_state,record.remote_id);
  const response=await f.make().fetch(request());
  assert.equal(response.status,409);
  assert.equal(state(f.sql).state,'IN_FLIGHT');
  f.sql.close();
 }
});

test('approval CAS still accepts audit-consistent UNKNOWN path and writes exactly one audit transition',async()=>{
 const f=fixture();await claimed(f,{unknown:true});
 const before=audit(f.sql).length;
 const response=await f.make().fetch(request());
 assert.equal(response.status,200);
 assert.equal(state(f.sql).state,'APPROVED');
 assert.equal(audit(f.sql).length,before+1);
 assert.equal(audit(f.sql).at(-1).after_state,'APPROVED');
 f.sql.close();
});


test('stalled request body times out before any D1 or provider operation',async()=>{
 const f=fixture();await claimed(f);
 const stream=new ReadableStream({
  start(c){c.enqueue(new TextEncoder().encode('{"requestId":"req1",'));},
  pull(){return new Promise(()=>{});},
  cancel(){return new Promise(()=>{});}
 });
 const raw=new Request(ORIGIN+'/__private/paypal/reconcile-approved',{
  method:'POST',duplex:'half',headers:{origin:ORIGIN,
   'sec-fetch-site':'same-origin','content-type':'application/json',
   'x-proofline-intent':'sandbox-get-approved-reconcile-only',
   cookie:'__Host-proofline_session='+COOKIE},body:stream
 });
 const before=audit(f.sql).length;
 const start=Date.now();
 const response=await f.make({bodyReadTimeoutMs:100}).fetch(raw);
 assert.equal(response.status,400);
 assert.ok(Date.now()-start<800);
 assert.equal(f.gets(),0);
 assert.equal(state(f.sql).state,'IN_FLIGHT');
 assert.equal(audit(f.sql).length,before);
 f.sql.close();
});

test('abort during partial body returns no provider GET or ledger mutation',async()=>{
 const f=fixture();await claimed(f);
 const controller=new AbortController();
 const stream=new ReadableStream({pull(){return new Promise(()=>{});}});
 const raw=new Request(ORIGIN+'/__private/paypal/reconcile-approved',{
  method:'POST',duplex:'half',signal:controller.signal,
  headers:{origin:ORIGIN,'sec-fetch-site':'same-origin',
   'content-type':'application/json',
   'x-proofline-intent':'sandbox-get-approved-reconcile-only',
   cookie:'__Host-proofline_session='+COOKIE},body:stream
 });
 const task=f.make({bodyReadTimeoutMs:1000}).fetch(raw);
 setTimeout(()=>controller.abort(),35);
 const response=await task;
 assert.equal(response.status,400);
 assert.equal(f.gets(),0);
 assert.equal(state(f.sql).state,'IN_FLIGHT');
 f.sql.close();
});

test('valid split JSON body is parsed and reconciled within one body-read budget',async()=>{
 const f=fixture();await claimed(f);
 const payload=new TextEncoder().encode(JSON.stringify({
  requestId:'req1',quoteId:'quote1',quoteVersion:1
 }));
 const stream=new ReadableStream({start(c){
  c.enqueue(payload.slice(0,9));c.enqueue(payload.slice(9,18));
  c.enqueue(payload.slice(18));c.close();
 }});
 const raw=new Request(ORIGIN+'/__private/paypal/reconcile-approved',{
  method:'POST',duplex:'half',headers:{origin:ORIGIN,
   'sec-fetch-site':'same-origin','content-type':'application/json',
   'x-proofline-intent':'sandbox-get-approved-reconcile-only',
   cookie:'__Host-proofline_session='+COOKIE},body:stream
 });
 const response=await f.make({bodyReadTimeoutMs:400}).fetch(raw);
 assert.equal(response.status,200);
 assert.equal(f.gets(),1);
 assert.equal(state(f.sql).state,'APPROVED');
 f.sql.close();
});

test('body timeout config outside bounded range is refused at constructor',()=>{
 const f=fixture();
 for(const bodyReadTimeoutMs of [0,99,5001,'2000',Infinity])
  assert.throws(()=>f.make({bodyReadTimeoutMs}),
   /SANDBOX_APPROVAL_RECONCILE_EXPLICIT_DEPENDENCIES_REQUIRED/);
 f.sql.close();
});

test('oversize multi-chunk body is rejected before any provider or D1 modification',async()=>{
 const f=fixture();await claimed(f);
 const stream=new ReadableStream({start(c){
  c.enqueue(new Uint8Array(260));c.enqueue(new Uint8Array(260));c.close();
 }});
 const raw=new Request(ORIGIN+'/__private/paypal/reconcile-approved',{
  method:'POST',duplex:'half',headers:{origin:ORIGIN,
   'sec-fetch-site':'same-origin','content-type':'application/json',
   'x-proofline-intent':'sandbox-get-approved-reconcile-only',
   cookie:'__Host-proofline_session='+COOKIE},body:stream
 });
 const response=await f.make({bodyReadTimeoutMs:400}).fetch(raw);
 assert.equal(response.status,400);
 assert.equal(f.gets(),0);
 assert.equal(state(f.sql).state,'IN_FLIGHT');
 f.sql.close();
});
