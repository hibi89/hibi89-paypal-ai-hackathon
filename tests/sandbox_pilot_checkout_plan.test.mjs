import test from 'node:test';
import assert from 'node:assert/strict';
import {planOwnerSandboxPilotCheckout} from '../src/sandbox_pilot_checkout_plan.mjs';
import {planOrder} from '../src/payment_contract.mjs';

const quote={id:'quote-pilot',ownerId:'owner',merchantId:'A1B2C3D4E5F6G',
 version:2,currency:'USD',status:'APPROVED',approval:{
  decision:'APPROVED',actorId:'owner',quoteVersion:2,amountMinor:150}};
const serverSession={verified:true,actorId:'owner',merchantId:quote.merchantId,
 checkoutSessionId:'b'.repeat(64)};
const opts={quote,serverSession,publicOrigin:'https://checkout.example.org'};

test('pilot CREATE plan includes official PayPal wallet experience_context and bounded amount',()=>{
 const p=planOwnerSandboxPilotCheckout(opts);
 assert.equal(p.networkAllowed,false);
 assert.equal(p.provider,'PAYPAL_SANDBOX_ONLY');
 assert.equal(p.requiresDurableFirstClaim,true);
 assert.equal(p.requiresSeparateOwnerExecutionApproval,true);
 assert.equal(p.method,'POST');
 assert.equal(p.path,'/v2/checkout/orders');
 assert.equal(p.requestId,planOrder(quote).requestId);
 assert.deepEqual(p.body,{
  intent:'CAPTURE',
  purchase_units:[{reference_id:'quote-pilot',
   payee:{merchant_id:quote.merchantId},
   amount:{currency_code:'USD',value:'1.50'}}],
  payment_source:{paypal:{experience_context:{
   user_action:'CONTINUE',
   return_url:'https://checkout.example.org/checkout/paypal/return',
   cancel_url:'https://checkout.example.org/checkout/paypal/cancel'
  }}}
 });
 assert.equal(p.buyerReturnIsProof,false);
 assert.equal(p.captureApproved,false);
 assert.ok(!JSON.stringify(p).includes(serverSession.checkoutSessionId));
});

test('pilot has a hard $2.00 virtual USD upper bound, never any paid/capture authority',()=>{
 assert.equal(planOwnerSandboxPilotCheckout({...opts,quote:{
  ...quote,approval:{...quote.approval,amountMinor:200}}}).amountMinor,200);
 for(const amount of [201,999,1000000]){
  assert.throws(()=>planOwnerSandboxPilotCheckout({...opts,quote:{
   ...quote,approval:{...quote.approval,amountMinor:amount}}}),
  {code:'PILOT_AMOUNT_LIMIT_EXCEEDED'});
 }
});
test('real PayPal merchant syntax is required instead of synthetic local merchant fixture',()=>{
 for(const merchantId of ['merchant','sandbox_merchant','ABC_DEF0123456',
  '',null,'aaaaaaaaaaaaaa']){
  assert.throws(()=>planOwnerSandboxPilotCheckout({...opts,quote:{...quote,merchantId}}),
   {code:'PILOT_REAL_SANDBOX_MERCHANT_ID_REQUIRED'});
 }
});
test('canceled, drafted, stale and unapproved quotes cannot create a pilot order plan',()=>{
 for(const status of ['CANCELED','PROPOSED','DRAFT',undefined]){
  assert.throws(()=>planOwnerSandboxPilotCheckout({...opts,quote:{...quote,status}}),
   {code:'PILOT_APPROVED_QUOTE_REQUIRED'});
 }
 for(const approval of [
  null,{...quote.approval,decision:'PENDING'},
  {...quote.approval,quoteVersion:1}
 ])assert.throws(()=>planOwnerSandboxPilotCheckout({...opts,quote:{...quote,approval}}));
});
test('session must be server verified and quote-bound before callbacks are added',()=>{
 for(const serverSession of [
  {...opts.serverSession,verified:false},
  {...opts.serverSession,actorId:'foreign'},
  {...opts.serverSession,merchantId:'ZZZZZZZZZZZZZ'},
  {...opts.serverSession,checkoutSessionId:'short'},
  null
 ])assert.throws(()=>planOwnerSandboxPilotCheckout({...opts,serverSession}),
  {code:'VERIFIED_CHECKOUT_SESSION_REQUIRED'});
});
test('public callback must be canonical HTTPS origin, never localhost, live provider, spoofed URL',()=>{
 for(const publicOrigin of ['http://checkout.example.org',
  'https://localhost','https://127.0.0.1',
  'https://checkout.example.org/return',
  'https://evil.example.org@checkout.example.org/',
  'https://checkout.example.org?key=oops']){
  assert.throws(()=>planOwnerSandboxPilotCheckout({...opts,publicOrigin}),
   {code:'PUBLIC_HTTPS_ORIGIN_REQUIRED'},publicOrigin);
 }
});
test('planner never reads secrets, performs network or attaches live payment route',()=>{
 const p=planOwnerSandboxPilotCheckout(opts);
 for(const key of ['clientId','secret','accessToken','capture','fetchImpl','authorization']){
  assert.equal(JSON.stringify(p).includes('"'+key+'"'),false);
 }
 assert.equal(p.mode,'OFFLINE_SANDBOX_PILOT_PLAN_NOT_AUTHORIZED_TO_EXECUTE');
 assert.equal(p.networkAllowed,false);
 assert.deepEqual(Object.keys(p.body.payment_source.paypal),['experience_context']);
});
