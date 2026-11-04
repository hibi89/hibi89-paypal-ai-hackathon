import test from 'node:test';
import assert from 'node:assert/strict';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';

test('real offline loopback identity endpoint provides only read-only synthetic role projection',async()=>{
 const app=await startOfflineDemo({testReviewSessions:true});
 try{
  const read=async(headers={})=>{
    const r=await fetch(app.url+'/api/demo/identity',{headers});
    return {status:r.status,headers:r.headers,data:await r.json()};
  };
  const buyer=await read();
  assert.equal(buyer.status,200);
  assert.equal(buyer.data.identity.actorId,'synthetic-owner');
  assert.equal(buyer.data.identity.role,'buyer');
  assert.equal(buyer.data.identity.merchantId,'synthetic-merchant');
  assert.equal(buyer.data.identity.paymentAuthorized,false);
  assert.equal(buyer.data.identity.registrationEnabled,false);
  assert.equal(buyer.data.registrationAvailable,false);
  assert.equal(buyer.data.realSellerVerified,false);
  assert.equal(buyer.data.realPayPalMerchantVerified,false);
  assert.equal(buyer.data.externalCalls,0);
  assert.equal(buyer.headers.get('cache-control'),'private, no-store');
  // Caller-supplied headers are NOT identity or privilege signals.
  const spoof=await read({'x-actor-id':'synthetic-reviewer','x-role':'merchant_operator'});
  assert.equal(spoof.data.identity.role,'buyer');
  const reviewer=await read({cookie:app.testReviewerCookie});
  assert.equal(reviewer.status,200);
  assert.equal(reviewer.data.identity.role,'reviewer');
  assert.equal(reviewer.data.identity.allowedActionTypes.includes('quote.approve'),false);
  assert.equal(reviewer.data.identity.allowedActionTypes.includes('delivery.review'),true);
  const forged=await read({cookie:'paypal_test_review='+('a'.repeat(64))});
  assert.equal(forged.status,401);
  assert.equal(forged.data.error,'TRUSTED_SESSION_REQUIRED');
  const before=(await (await fetch(app.url+'/api/quotes/sample-project')).json()).quote;
  const post=await fetch(app.url+'/api/demo/identity',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({role:'seller',actorId:'synthetic-owner'})
  });
  assert.equal(post.status,405);
  assert.equal(post.headers.get('allow'),'GET');
  const after=(await (await fetch(app.url+'/api/quotes/sample-project')).json()).quote;
  assert.deepEqual(after,before);
  assert.equal((await read()).data.identity.role,'buyer');
 }finally{await app.close();}
});
