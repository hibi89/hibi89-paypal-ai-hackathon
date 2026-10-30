import test from 'node:test';
import assert from 'node:assert/strict';
import {planBuyerCheckoutCallbacks} from '../src/paypal_checkout_callback_contract.mjs';
const quote={id:'q1',ownerId:'owner',merchantId:'merchant',version:2,
 currency:'USD',status:'APPROVED',
 approval:{decision:'APPROVED',actorId:'owner',quoteVersion:2,amountMinor:1500}};
const session={verified:true,actorId:'owner',merchantId:'merchant',
 checkoutSessionId:'a'.repeat(64)};
const opts={publicOrigin:'https://pay.example.org',quote,serverSession:session};

test('bound server session yields fixed same-origin return and cancel URLs, no secret leakage',()=>{
 const r=planBuyerCheckoutCallbacks(opts);
 assert.deepEqual(r.experienceContext,{
  user_action:'CONTINUE',
  return_url:'https://pay.example.org/checkout/paypal/return',
  cancel_url:'https://pay.example.org/checkout/paypal/cancel'
 });
 assert.equal(r.networkAllowed,false);
 assert.equal(r.browserReturnIsPaymentProof,false);
 assert.equal(r.captureRequiresSeparateAction,true);
 assert.equal(JSON.stringify(r).includes(session.checkoutSessionId),false);
});
test('untrusted origin, query and local hosts fail before checkout URL construction',()=>{
 for(const origin of [
  'http://pay.example.org','https://localhost','https://127.0.0.1',
  'https://[::1]','https://pay.example.org:8443',
  'https://pay.example.org/a','https://pay.example.org?token=x',
  'https://person:secret@pay.example.org','https://pay.example.org/#ok',
  'https://dev.local','https://service.internal','https://pay.example.org/',
  '//pay.example.org',' https://pay.example.org'
 ]){
  assert.throws(()=>planBuyerCheckoutCallbacks({...opts,publicOrigin:origin}),
    {code:'PUBLIC_HTTPS_ORIGIN_REQUIRED'},origin);
 }
});
test('forged owner, merchant, quote version or missing server checkout binding fail closed',()=>{
 for(const delta of [
  {serverSession:{...session,verified:false}},
  {serverSession:{...session,actorId:'other'}},
  {serverSession:{...session,merchantId:'other'}},
  {serverSession:{...session,checkoutSessionId:'weak'}},
  {serverSession:{...session,checkoutSessionId:null}},
  {quote:{...quote,ownerId:'other'}},
  {quote:{...quote,merchantId:'other'}},
  {quote:{...quote,version:3}},
  {quote:{...quote,approval:null}}
 ]){
  assert.throws(()=>planBuyerCheckoutCallbacks({...opts,...delta}));
 }
});
test('callback preflight does not authorize real requests or emit payment tokens',()=>{
 const r=planBuyerCheckoutCallbacks(opts);
 assert.equal(r.mode,'OFFLINE_PLAN_NOT_PROVIDER_APPROVED');
 assert.equal(Object.hasOwn(r,'payment_source'),false);
 assert.equal(Object.hasOwn(r,'checkoutSessionId'),false);
 assert.equal(Object.hasOwn(r,'apiKey'),false);
});
