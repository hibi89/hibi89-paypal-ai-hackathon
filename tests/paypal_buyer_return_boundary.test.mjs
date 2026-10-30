import test from 'node:test';
import assert from 'node:assert/strict';
import {createPaypalBuyerReturnBoundary} from '../src/paypal_buyer_return_boundary.mjs';

const handler=createPaypalBuyerReturnBoundary();
const url='https://verified.example/checkout/paypal/';
test('buyer return and buyer cancel both report unverified payment, never approval',async()=>{
 for(const [path,state] of [
  ['return','BUYER_RETURN_NOT_PAYMENT_PROOF'],
  ['cancel','BUYER_CANCEL_NOT_PAYMENT_PROOF']
 ]){
  const res=await handler.handle(new Request(url+path+'?token=FAKE&status=COMPLETED'));
  const raw=await res.text(),body=JSON.parse(raw);
  assert.equal(res.status,200);
  assert.equal(body.status,state);
  assert.equal(body.orderApproved,false);
  assert.equal(body.paymentVerified,false);
  assert.equal(body.paymentState,'NOT_CONFIRMED');
  assert.equal(body.providerPostPerformed,false);
  assert.equal(body.providerGetPerformed,false);
  assert.equal(body.ledgerMutationPerformed,false);
  assert.equal(body.retryPost,false);
  assert.equal(res.headers.get('referrer-policy'),'no-referrer');
  assert.equal(raw.includes('FAKE'),false);
 }
});
test('malicious callback URL params, spoofed headers, cookies and duplicate token never confer authority',async()=>{
 const sent=url+'return?token=FAKE1&token=FAKE2&PayerID=BAD&amount=99999&merchant=OTHER&quoteId=foreign&paid=true';
 const first=await handler.handle(new Request(url+'return'));
 const spoof=await handler.handle(new Request(sent,{headers:{
  cookie:'paypal=pretend-auth','x-paypal-status':'COMPLETED','x-actor-id':'owner',
  referer:'https://www.sandbox.paypal.com/'
 }}));
 assert.deepEqual(await spoof.json(),await first.json());
});
test('callback route cannot be used as POST/HEAD/PUT mutation endpoint',async()=>{
 for(const m of ['POST','PUT','HEAD']){
  const r=await handler.handle(new Request(url+'return',{method:m}));
  assert.equal(r.status,405);
  assert.equal(r.headers.get('allow'),'GET');
 }
 assert.equal((await handler.handle(new Request(url+'arbitrary'))).status,404);
});
test('public-mode callback is forbidden and cannot accidentally gain provider adapter',()=>{
 assert.throws(()=>createPaypalBuyerReturnBoundary({offlineOnly:false}),
  /PUBLIC_BUYER_CALLBACK_NOT_READY/);
 assert.equal(handler.mode,'OFFLINE_MOCK_ONLY');
 assert.equal(handler.providerAccess,false);
 assert.equal(handler.paymentMutationEnabled,false);
});
