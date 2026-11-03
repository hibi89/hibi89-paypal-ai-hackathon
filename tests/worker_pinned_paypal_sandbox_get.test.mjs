import test from 'node:test';
import assert from 'node:assert/strict';
import {createPinnedPayPalSandboxGetTransport,
 isPinnedPayPalSandboxGetTransport} from '../src/worker_pinned_paypal_sandbox_get.mjs';
import {createWorkerSandboxApprovalReconcile} from '../src/worker_sandbox_order_approval.mjs';

const ORDER='ORDER_001',TARGET='https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER_001';
const payload={id:ORDER,status:'APPROVED',intent:'CAPTURE',purchase_units:[]};
const json=(value=payload,options={})=>new Response(JSON.stringify(value),{
 status:options.status??200,headers:{'content-type':options.contentType??'application/json',
 ...options.headers}});
function harness({fetchImpl,token='sandbox-test-token',timeoutMs=8000}={}){
 const seen=[];let tokens=0;
 const transport=createPinnedPayPalSandboxGetTransport({enabled:true,timeoutMs,
  getAccessToken:async()=>{tokens++;return token;},
  fetchImpl:fetchImpl??(async (url,opts)=>{seen.push({url,opts});return json();})});
 return {transport,seen,tokens:()=>tokens};
}
test('a pinned transport makes exactly one GET to the official Sandbox API',async()=>{
 const h=harness();
 assert.equal(isPinnedPayPalSandboxGetTransport(h.transport),true);
 assert.deepEqual(await h.transport.getOrder(ORDER),payload);
 assert.equal(h.tokens(),1);
 assert.equal(h.seen.length,1);
 assert.equal(h.seen[0].url,TARGET);
 assert.equal(h.seen[0].opts.method,'GET');
 assert.equal(h.seen[0].opts.redirect,'error');
 assert.equal(h.seen[0].opts.headers.authorization,'Bearer sandbox-test-token');
 assert.equal(h.transport.paymentPostsEnabled,false);
 assert.equal(h.transport.mode,'PAYPAL_SANDBOX_READ_ONLY');
});
test('factory refuses default-off or unsafe config and branding cannot be forged by object spread',async()=>{
 const h=harness();
 assert.throws(()=>createPinnedPayPalSandboxGetTransport({
  getAccessToken:()=>'',fetchImpl:async()=>json()}),/EXPLICIT_SETUP_REQUIRED/);
 for(const timeoutMs of [0,99,10001,'1000',Infinity])assert.throws(()=>
  createPinnedPayPalSandboxGetTransport({enabled:true,timeoutMs,
   getAccessToken:()=>'',fetchImpl:async()=>json()}),/EXPLICIT_SETUP_REQUIRED/);
 assert.equal(isPinnedPayPalSandboxGetTransport({...h.transport}),false);
 assert.throws(()=>createWorkerSandboxApprovalReconcile({
  db:{withSession:()=>({})},allowedOrigin:'https://fixture.invalid',
  enabled:true,expectedMerchantId:'PAYPALMERCH13',
  transport:{...h.transport}}),/EXPLICIT_DEPENDENCIES_REQUIRED/);
});
test('invalid order IDs and invalid token are rejected before fetch',async()=>{
 const h=harness();
 for(const order of ['../orders/a','a/b','ORDER?x=1','',1,'x'.repeat(65)])
  await assert.rejects(h.transport.getOrder(order),{code:'SANDBOX_ORDER_ID_INVALID'});
 assert.equal(h.seen.length,0);
 assert.equal(h.tokens(),0);
 const bad=harness({token:'Token with spaces'});
 await assert.rejects(bad.transport.getOrder(ORDER),{
  code:'SANDBOX_GET_TOKEN_UNAVAILABLE_NO_RETRY'});
 assert.equal(bad.seen.length,0);
});
test('GET 429, auth denial and provider outage are classified without retry',async()=>{
 for(const [status,code] of [[429,'SANDBOX_GET_RATE_LIMITED_NO_RETRY'],
  [401,'SANDBOX_GET_AUTH_REJECTED_NO_RETRY'],
  [403,'SANDBOX_GET_AUTH_REJECTED_NO_RETRY'],
  [500,'SANDBOX_GET_PROVIDER_UNAVAILABLE_NO_RETRY'],
  [503,'SANDBOX_GET_PROVIDER_UNAVAILABLE_NO_RETRY'],
  [404,'SANDBOX_GET_UNEXPECTED_STATUS_NO_RETRY']]){
  let n=0;
  const h=harness({fetchImpl:async()=>{n++;return json(payload,{status})}});
  await assert.rejects(h.transport.getOrder(ORDER),{code});
  assert.equal(n,1);
 }
});
test('wrong content type, oversized and malformed responses fail closed',async()=>{
 const candidates=[
  [new Response('raw',{headers:{'content-type':'text/html'}}),'SANDBOX_GET_RESPONSE_TYPE_INVALID'],
  [new Response('ok',{headers:{'content-type':'application/json','content-length':'65536'}}),'SANDBOX_GET_RESPONSE_TOO_LARGE'],
  [new Response('x'.repeat(32769),{headers:{'content-type':'application/json'}}),'SANDBOX_GET_RESPONSE_TOO_LARGE'],
  [new Response('{invalid json',{headers:{'content-type':'application/json'}}),'SANDBOX_GET_INVALID_JSON']
 ];
 for(const [response,code] of candidates){
  const h=harness({fetchImpl:async()=>response});
  await assert.rejects(h.transport.getOrder(ORDER),{code});
 }
});
test('redirects or changed response origins cannot be treated as Sandbox evidence',async()=>{
 const redirect=harness({fetchImpl:async()=>new Response(null,{
  status:302,headers:{location:'https://api-m.paypal.com/v2/checkout/orders/ORDER_001'}})});
 await assert.rejects(redirect.transport.getOrder(ORDER),{
  code:'SANDBOX_GET_UNEXPECTED_STATUS_NO_RETRY'});
 const changed=json();Object.defineProperty(changed,'url',{
  value:'https://attacker.invalid/order/ORDER_001'});
 const other=harness({fetchImpl:async()=>changed});
 await assert.rejects(other.transport.getOrder(ORDER),{
  code:'SANDBOX_GET_REDIRECT_OR_SOURCE_UNTRUSTED'});
});
test('failed network and abort timeout are explicit, without a retry',async()=>{
 let n=0;
 const network=harness({fetchImpl:async()=>{n++;throw Error('simulated connection loss')}});
 await assert.rejects(network.transport.getOrder(ORDER),{
  code:'SANDBOX_GET_NETWORK_UNAVAILABLE_NO_RETRY'});
 assert.equal(n,1);
 let aborted=0;
 const timeout=harness({timeoutMs:100,fetchImpl:async (_url,opts)=>new Promise((resolve,reject)=>{
  opts.signal.addEventListener('abort',()=>{aborted++;reject(Error('aborted'));},{once:true});
 })});
 await assert.rejects(timeout.transport.getOrder(ORDER),{
  code:'SANDBOX_GET_TIMEOUT_NO_RETRY'});
 assert.equal(aborted,1);
});
test('handler cannot accept arbitrary unpinned GET stubs even with matching flags',()=>{
 const forged={mode:'PAYPAL_SANDBOX_READ_ONLY',networkEnabled:true,
  paymentPostsEnabled:false,getOrder:async()=>payload};
 assert.equal(isPinnedPayPalSandboxGetTransport(forged),false);
 assert.throws(()=>createWorkerSandboxApprovalReconcile({enabled:true,
  allowedOrigin:'https://fixture.invalid',
  db:{withSession:()=>({})},expectedMerchantId:'PAYPALMERCH13',
  transport:forged}),/EXPLICIT_DEPENDENCIES_REQUIRED/);
});
