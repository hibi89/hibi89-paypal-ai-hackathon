import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createWorkerSandboxApprovalReconcile} from '../src/worker_sandbox_order_approval.mjs';
import {createWorkerPaymentClaimGate} from '../src/worker_payment_claim_gate.mjs';
import {createPrivateWorkerIdentityReadRouter} from '../src/worker_private_identity_read_router.mjs';

const ORIGIN='https://fixture.invalid', MERCHANT='PAYPALMERCH13';
const OWNER='owner1', ISSUER='https://idp.invalid', SUB='a'.repeat(64),T=1800000000000;
const COOKIE=Buffer.alloc(32,19).toString('base64url');
const DIGEST=createHash('sha256').update(COOKIE).digest('hex');
const ARGS={requestId:'req1',quoteId:'quote1',quoteVersion:1,ownerId:OWNER,merchantId:MERCHANT};
const load=name=>readFileSync(new URL('../migrations/d1/'+name,import.meta.url),'utf8');
const remote=(override={})=>({id:'ORDER_001',intent:'CAPTURE',status:'APPROVED',
 purchase_units:[{reference_id:'quote1',payee:{merchant_id:MERCHANT},amount:{currency_code:'USD',value:'1.50'}}],...override});
function fixture({provider=remote(),afterGet,throwGet=false,withoutAudit=false}={}){
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
   async run(){const result=sql.prepare(query).run(...params);return {meta:{changes:result.changes}};},
   async all(){return {results:sql.prepare(query).all(...params)};}
  }}}}
 };}};
 let gets=0;
 const transport={mode:'PAYPAL_SANDBOX_READ_ONLY',networkEnabled:true,paymentPostsEnabled:false,
  getOrder:async id=>{gets++;assert.equal(id,'ORDER_001');
   if(throwGet)throw Error('SYNTHETIC_GET_UNAVAILABLE');
   if(afterGet)await afterGet(sql);
   return provider;
  }};
 const gate=createWorkerPaymentClaimGate({db});
 const make=()=>createWorkerSandboxApprovalReconcile({db,allowedOrigin:ORIGIN,
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
