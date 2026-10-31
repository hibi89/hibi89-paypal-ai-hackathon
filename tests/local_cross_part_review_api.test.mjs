import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalCrossPartReviewApi} from '../src/local_cross_part_review_api.mjs';

const url='http://127.0.0.1:9999/api/demo/cross-part/review';
const session=Object.freeze({verified:true,actorId:'buyer',merchantId:'merchant',csrfToken:'csrf_test'});
const review=Object.freeze({status:'SYNTHETIC_CROSS_PART_REVIEW_ONLY',
 quoteId:'quote',consentId:'consent',amountMinor:29900,quoteVersion:3,
 reviewFingerprint:'a'.repeat(64),paymentAuthorized:false,
 paypalOrderCreated:false,paypalCapturePerformed:false,
 realProviderEvidence:false});
function fixture(){
 const trusted=new WeakMap();let saved=null,calls=0;
 const bridge=Object.freeze({mode:'INTERNAL_SYNTHETIC_REVIEW_ONLY',
  publicHttpEnabled:false,autoPaymentAuthorized:false,paypalProviderCalls:0,
  async link({hostHandle,quoteId,consentId}){
   calls++;
   assert.equal(quoteId,'quote');
   assert.equal(consentId,'consent');
   assert.equal(trusted.get(hostHandle)?.actorId,'buyer');
   saved=review;return saved;
  },
  async inspect({hostHandle,quoteId}){
   assert.equal(quoteId,'quote');
   assert.equal(trusted.get(hostHandle)?.actorId,'buyer');
   if(!saved)throw Object.assign(new Error('unknown'),{code:'CROSS_PART_LINK_UNAVAILABLE'});
   return saved;
  }
 });
 const handler=createLocalCrossPartReviewApi({bridge,
  resolveSession:async request=>trusted.get(request),
  quoteId:'quote',buyerActorId:'buyer',merchantId:'merchant'});
 const request=(method='GET',body,opts={})=>{
  const headers={'content-type':'application/json',...(opts.origin===false?{}:
   {origin:opts.origin||'http://127.0.0.1:9999'}),
   ...(opts.csrf===false?{}:{'x-csrf-token':opts.csrf||'csrf_test'})};
  const r=new Request(url+(opts.query||''),{method,headers,
   ...(method==='POST'?{body:JSON.stringify(body)}:{})});
  if(opts.trusted!==false)trusted.set(r,opts.role==='reviewer'
   ?{...session,actorId:'reviewer'}:session);
  return r;
 };
 return {handler,request,count:()=>calls};
}
test('local bridge requires a private non-paying host, never a public payment permission',()=>{
 assert.throws(()=>createLocalCrossPartReviewApi({}),/LOCAL_CROSS_PART_TRUSTED_DEPENDENCIES_REQUIRED/);
 const f=fixture();
 assert.ok(f.handler);
});
test('explicit owner POST stores; GET reads without new link, discloses no provider authority',async()=>{
 const f=fixture();
 assert.equal((await f.handler(f.request())).status,404);
 const result=await f.handler(f.request('POST',{consentId:'consent'}));
 assert.equal(result.status,201);
 const doc=await result.json();
 assert.equal(doc.review.reviewFingerprint,'a'.repeat(64));
 for(const k of ['paymentAuthorized','paypalCapturePerformed','realProviderEvidence'])
  assert.equal(doc[k],false);
 assert.equal(doc.providerCalls,0);
 assert.equal(f.count(),1);
 const read=await f.handler(f.request());
 assert.equal(read.status,200);
 assert.equal(read.headers.get('cache-control'),'private, no-store');
 assert.equal((await read.json()).review.amountMinor,29900);
 assert.equal(f.count(),1);
});
test('origin, CSRF, identity, body shape and query cannot forge association',async()=>{
 const f=fixture();
 for(const req of [
  f.request('POST',{consentId:'consent'},{origin:false}),
  f.request('POST',{consentId:'consent'},{origin:'http://evil.invalid'}),
  f.request('POST',{consentId:'consent'},{csrf:false}),
  f.request('POST',{consentId:'consent'},{csrf:'fake'}),
  f.request('POST',{consentId:'consent',actorId:'buyer'}),
  f.request('POST',{consentId:'consent'},{trusted:false}),
  f.request('POST',{consentId:'consent'},{role:'reviewer'}),
  f.request('POST',{consentId:'consent'},{query:'?actorId=buyer'})
 ])assert.notEqual((await f.handler(req)).status,201);
 assert.equal(f.count(),0);
 assert.equal((await f.handler(f.request('GET',undefined,{role:'reviewer'}))).status,404);
 assert.equal((await f.handler(f.request('GET',undefined,{query:'?merchantId=merchant'}))).status,404);
 const badMethod=new Request(url,{method:'DELETE'});
 assert.equal((await f.handler(badMethod)).status,405);
});
