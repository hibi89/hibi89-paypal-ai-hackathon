import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createWorkerSandboxOrderGetTransport} from '../src/worker_sandbox_get_transport.mjs';
import {createWorkerSandboxOrderProof} from '../src/worker_sandbox_order_proof.mjs';
import {createPrivateWorkerIdentityReadRouter} from '../src/worker_private_identity_read_router.mjs';

const ORIGIN='https://proofline-fixture.invalid';
const ISSUER='https://idp.proofline-fixture.invalid',SUBJECT='a'.repeat(64);
const ACTOR='ciOwner',MERCHANT='PAYPALMERCH13',ORDER='ORDER_001',T=1800000000000;
const COOKIE=Buffer.alloc(32,30).toString('base64url');
const DIGEST=createHash('sha256').update(COOKIE).digest('hex');
const ORDER_DATA=()=>({id:ORDER,intent:'CAPTURE',status:'APPROVED',
 purchase_units:[{reference_id:'ciProofQuote',payee:{merchant_id:MERCHANT},
 amount:{currency_code:'USD',value:'1.50'}}]});
function makeDb({state='APPROVED',remoteId=ORDER,merchant=MERCHANT}={}){
 const sql=new DatabaseSync(':memory:');
 for(const name of ['0001_payment_claims.sql','0002_worker_private_sessions.sql',
  '0003_worker_private_oidc.sql','0004_worker_private_binding_epoch.sql'])
  sql.exec(readFileSync(new URL('../migrations/d1/'+name,import.meta.url),'utf8'));
 sql.prepare('INSERT INTO worker_private_oidc_bindings(issuer,subject_hmac,actor_id,merchant_id,role) VALUES(?,?,?,?,?)')
  .run(ISSUER,SUBJECT,ACTOR,merchant,'OWNER');
 sql.prepare('INSERT INTO worker_private_sessions(token_sha256,actor_id,merchant_id,role,issuer,issuer_verified_at_ms,expires_at_ms,binding_subject_hmac,binding_revision) VALUES(?,?,?,?,?,?,?,?,1)')
  .run(DIGEST,ACTOR,merchant,'OWNER',ISSUER,T-10000,T+60000,SUBJECT);
 sql.prepare('INSERT INTO quotes(id,owner_id,merchant_id,version,currency,status,approval_actor,approval_version,approval_amount_minor) VALUES(?,?,?,?,?,?,?,?,?)')
  .run('ciProofQuote',ACTOR,merchant,1,'USD','APPROVED',ACTOR,1,150);
 sql.prepare('INSERT INTO payment_attempts(request_id,quote_id,quote_version,merchant_id,operation,state,remote_id,amount_minor,currency) VALUES(?,?,?,?,?,?,?,?,?)')
  .run('ciProofRequest','ciProofQuote',1,merchant,'create',state,remoteId,150,'USD');
 const db={
  withSession(mode){
   assert.equal(mode,'first-primary');
   return {
    prepare(q){
     return {
      bind(...args){
       return {
        async first(){return sql.prepare(q).get(...args)??null;},
        async all(){return {results:sql.prepare(q).all(...args)};}
       };
      }
     };
    }
   };
  }
 };
 return {sql,db};
}
function req({path='/__private/paypal/order-proof',method='POST',body,headers={}}={}){
 const b=body===undefined?{quoteId:'ciProofQuote',quoteVersion:1}:body;
 return new Request(ORIGIN+path,{method,
  headers:{origin:ORIGIN,'sec-fetch-site':'same-origin',
   cookie:'__Host-proofline_session='+COOKIE,
   'content-type':'application/json',
   'x-proofline-intent':'sandbox-order-get-only',...headers},
  ...(method==='POST'?{body:JSON.stringify(b)}:{})});
}
function fixture({order=ORDER_DATA(),dbOptions,afterGet}={}){
 const {sql,db}=makeDb(dbOptions);
 const calls=[];
 const transport={mode:'PAYPAL_SANDBOX_READ_ONLY',networkEnabled:true,
  paymentPostsEnabled:false,async getOrder(id){
   calls.push(id);if(afterGet)afterGet(sql);return order;
  }};
 const handler=createWorkerSandboxOrderProof({db,allowedOrigin:ORIGIN,
  transport,expectedMerchantId:MERCHANT,enabled:true,now:()=>T});
 return {sql,db,handler,calls,transport};
}
test('disabled-by-default Worker transport and proof cannot contact a provider',async()=>{
 let calls=0;
 const fetchImpl=async()=>{calls++;throw Error('UNEXPECTED_REQUEST')};
 const disabled=createWorkerSandboxOrderGetTransport({clientId:'client1234',
  clientSecret:'testSecret12345',fetchImpl});
 assert.equal(disabled.networkEnabled,false);
 await assert.rejects(disabled.getOrder(ORDER),{code:'SANDBOX_GET_NETWORK_NOT_AUTHORIZED'});
 assert.equal(calls,0);
 const {db,sql}=makeDb();
 assert.throws(()=>createWorkerSandboxOrderProof({db,allowedOrigin:ORIGIN,
  transport:disabled,enabled:true}),/SANDBOX_GET_EXPLICIT_PRIVATE_DEPENDENCIES_REQUIRED/);
 assert.throws(()=>createWorkerSandboxOrderProof({db,allowedOrigin:ORIGIN,
  transport:{mode:'PAYPAL_SANDBOX_READ_ONLY',networkEnabled:true,
   paymentPostsEnabled:false,getOrder:async()=>ORDER_DATA()}}),
 /SANDBOX_GET_EXPLICIT_PRIVATE_DEPENDENCIES_REQUIRED/);
 sql.close();
});
test('Worker-compatible injected transport emits exactly OAuth POST then Sandbox Orders GET',async()=>{
 const traffic=[];
 const transport=createWorkerSandboxOrderGetTransport({
  clientId:'client1234',clientSecret:'testSecret12345',
  networkApproved:true,fetchImpl:async(url,config)=>{
   traffic.push({url,method:config.method,auth:config.headers.authorization,
     redirect:config.redirect,cache:config.cache,credentials:config.credentials});
   if(traffic.length===1)return Response.json({
    token_type:'Bearer',access_token:'sandbox-token1234'});
   return Response.json(ORDER_DATA());
  }});
 const order=await transport.getOrder(ORDER);
 assert.equal(order.id,ORDER);
 assert.deepEqual(traffic.map(x=>x.method),['POST','GET']);
 assert.deepEqual(traffic.map(x=>x.url),[
  'https://api-m.sandbox.paypal.com/v1/oauth2/token',
  'https://api-m.sandbox.paypal.com/v2/checkout/orders/'+ORDER]);
 assert.ok(traffic[0].auth.startsWith('Basic '));
 assert.equal(traffic[1].auth,'Bearer sandbox-token1234');
 assert.ok(traffic.every(x=>x.credentials==='omit'&&x.cache==='no-store'&&x.redirect==='error'));
 assert.equal(transport.paymentPostsEnabled,false);
 await assert.rejects(transport.getOrder('../capture'),{code:'SANDBOX_ORDER_ID_INVALID'});
 assert.equal(traffic.length,2);
});
test('OAuth failure, unexpected redirect and oversized provider responses never retry',async()=>{
 for(const source of [
  ()=>new Response('html',{status:302}),
  ()=>new Response('{"token_type":"Bearer"}',{status:200,
    headers:{'content-type':'application/json'}}),
  ()=>Response.json({token_type:'Bearer',access_token:'x'.repeat(5000)})
 ]){
  let n=0;
  const transport=createWorkerSandboxOrderGetTransport({
   clientId:'client1234',clientSecret:'testSecret12345',
   networkApproved:true,fetchImpl:async()=>{n++;return source()}});
  await assert.rejects(transport.getOrder(ORDER));
  assert.equal(n,1);
 }
});
test('approved owner can verify remote order against durable quote and create attempt, without D1 writes',async()=>{
 const f=fixture();
 const result=await f.handler.fetch(req());
 assert.equal(result.status,200);
 const data=await result.json();
 assert.equal(data.status,'SANDBOX_GET_EVIDENCE_VALIDATED_NO_LEDGER_COMMIT');
 assert.equal(data.orderStatus,'APPROVED');
 assert.equal(data.ledgerState,'APPROVED');
 assert.equal(data.orderReferenceMatches,true);
 assert.equal(data.paymentAuthorized,false);
 assert.equal(data.paymentPosts,0);
 assert.equal(data.ledgerWrites,0);
 assert.deepEqual(f.calls,[ORDER]);
 assert.equal(f.sql.prepare("SELECT state FROM payment_attempts WHERE operation='create'").get().state,'APPROVED');
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM payment_attempts").get().n,1);
 f.sql.close();
});
test('GET/refresh never calls provider, invalid intention and unknown stored remote id fail closed',async()=>{
 const f=fixture();
 for(const invalid of [
  req({method:'GET'}),
  req({headers:{origin:'https://attacker.invalid'}}),
  req({headers:{'sec-fetch-site':'cross-site'}}),
  req({headers:{'x-proofline-intent':'capture'}}),
  req({body:{quoteId:'ciProofQuote',quoteVersion:1,remoteId:'attacker'}}),
  req({body:{quoteId:'ciProofQuote',quoteVersion:0}}),
  req({headers:{cookie:''}})
 ]){
  assert.notEqual((await f.handler.fetch(invalid)).status,200);
 }
 assert.deepEqual(f.calls,[]);
 f.sql.close();
 const missing=fixture({dbOptions:{remoteId:null}});
 assert.equal((await missing.handler.fetch(req())).status,409);
 assert.deepEqual(missing.calls,[]);
 missing.sql.close();
});
test('wrong PayPal merchant or amount, redirect-origin data and completed status cannot become paid proof',async()=>{
 for(const v of [
  {purchase_units:[{reference_id:'ciProofQuote',payee:{merchant_id:'BADMERCHANT12'},amount:{currency_code:'USD',value:'1.50'}}]},
  {purchase_units:[{reference_id:'ciProofQuote',payee:{merchant_id:MERCHANT},amount:{currency_code:'USD',value:'2.50'}}]},
  {id:'OTHER_ORDER'},
  {intent:'AUTHORIZE'}
 ]){
  const f=fixture({order:{...ORDER_DATA(),...v}});
  const result=await f.handler.fetch(req());
  assert.equal(result.status,503);
  assert.equal((await result.json()).paymentAuthorized,false);
  assert.deepEqual(f.calls,[ORDER]);f.sql.close();
 }
 const completed=fixture({order:{...ORDER_DATA(),status:'COMPLETED'}});
 const out=await (await completed.handler.fetch(req())).json();
 assert.equal(out.reconciliationRequired,true);
 assert.equal(out.status,'SANDBOX_GET_EVIDENCE_VALIDATED_NO_LEDGER_COMMIT');
 assert.equal(out.paymentAuthorized,false);
 completed.sql.close();
});
test('owner session revoked while provider GET is running cannot receive proof',async()=>{
 const f=fixture({afterGet:sql=>sql.prepare(
  'UPDATE worker_private_sessions SET revoked_at_ms=? WHERE token_sha256=?').run(T-1,DIGEST)});
 const result=await f.handler.fetch(req());
 assert.equal(result.status,401);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM payment_attempts').get().n,1);
 assert.deepEqual(f.calls,[ORDER]);f.sql.close();
});
test('router keeps provider route dark by default and exposes only opted-in owner proof',async()=>{
 const f=fixture();
 const authority={revoke:async()=>{throw Error('DISABLED')}};
 const pkceCoordinator={start:async()=>new Response(null,{status:503}),
  callback:async()=>new Response(null,{status:503})};
 const dark=createPrivateWorkerIdentityReadRouter({db:f.db,allowedOrigin:ORIGIN,
  authority,pkceCoordinator,enabled:true,now:()=>T});
 assert.equal((await dark.fetch(req())).status,404);
 const opted=createPrivateWorkerIdentityReadRouter({db:f.db,allowedOrigin:ORIGIN,
  authority,pkceCoordinator,enabled:true,now:()=>T,
  sandboxOrderProofEnabled:true,sandboxOrderGetTransport:f.transport,
  sandboxExpectedMerchantId:MERCHANT});
 assert.equal((await opted.fetch(req())).status,200);
 assert.deepEqual(f.calls,[ORDER]);
 f.sql.close();
});

test('provider response is rejected when D1 order binding or ledger state changes during GET',async()=>{
 for(const mutation of [
  "UPDATE payment_attempts SET remote_id='REPLACED_ORDER' WHERE operation='create'",
  "UPDATE payment_attempts SET state='UNKNOWN' WHERE operation='create'"
 ]){
  const f=fixture({afterGet:sql=>sql.exec(mutation)});
  const response=await f.handler.fetch(req());
  assert.equal(response.status,401);
  const body=await response.json();
  assert.equal(body.paymentAuthorized,false);
  assert.equal(body.ledgerWrites,0);
  assert.deepEqual(f.calls,[ORDER]);
  f.sql.close();
 }
});
