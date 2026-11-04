import test from 'node:test';
import assert from 'node:assert/strict';
import {createCrossPartReviewReadApi} from '../src/cross_part_review_read_api.mjs';
const base='http://127.0.0.1:1234/api/private/cross-part/review';
const review=Object.freeze({paymentAuthorized:false,paypalOrderCreated:false,
 paypalCapturePerformed:false,realProviderEvidence:false,status:'SYNTHETIC_CROSS_PART_REVIEW_ONLY'});
test('adapter refuses untrusted bridge configuration',()=>{
 assert.throws(()=>createCrossPartReviewReadApi({}),/PRIVATE_REVIEW_BRIDGE_REQUIRED/);
 assert.throws(()=>createCrossPartReviewReadApi({bridge:{inspect(){},publicHttpEnabled:true,autoPaymentAuthorized:false}}),
 /PRIVATE_REVIEW_BRIDGE_REQUIRED/);
});
test('only explicit GET and exactly one validated quote ID allowed',async()=>{
 let called=0;
 const api=createCrossPartReviewReadApi({bridge:{publicHttpEnabled:false,
  autoPaymentAuthorized:false,inspect:async()=>{called++;return review;}}});
 for(const [url,method,status] of [
  [base+'?quoteId=q1','POST',405],[base+'?quoteId=q1&merchant=other','GET',400],
  [base+'?quoteId=q1&quoteId=q2','GET',400],[base+'?quoteId=%2F','GET',400],
  [base+'?quoteId=q1','GET',200],[base+'?quoteId=q1&x=1','GET',400],
  ['http://127.0.0.1:1234/api/private/other?quoteId=q1','GET',404]
 ]){
  const response=await api(new Request(url,{method}));
  assert.equal(response.status,status);
 }
 assert.equal(called,1);
});
test('passes opaque trusted Request to inspect; no payment side effects',async()=>{
 let handle;
 const api=createCrossPartReviewReadApi({bridge:{publicHttpEnabled:false,
  autoPaymentAuthorized:false,inspect:async x=>{handle=x.hostHandle;
   assert.equal(x.quoteId,'q1');return review;}}});
 const request=new Request(base+'?quoteId=q1');
 const response=await api(request);
 assert.equal(handle,request);
 assert.equal(response.status,200);
 assert.equal(response.headers.get('cache-control'),'no-store');
 const body=await response.json();
 assert.equal(body.review.paymentAuthorized,false);
 assert.equal(body.readOnly,true);
 assert.equal(body.providerCalls,0);
});
test('denies errors and forged payment evidence without leaking details',async()=>{
 for(const inspect of [async()=>{throw Error('secret tenant')},
  async()=>({...review,paymentAuthorized:true})]){
  const api=createCrossPartReviewReadApi({bridge:{inspect,publicHttpEnabled:false,
   autoPaymentAuthorized:false}});
  const response=await api(new Request(base+'?quoteId=q1'));
  assert.ok([404,503].includes(response.status));
  assert.doesNotMatch(await response.text(),/secret tenant/);
 }
});
