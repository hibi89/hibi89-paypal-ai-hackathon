import test from 'node:test';
import assert from 'node:assert/strict';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';
import {createSyntheticProtocolDemoApi} from '../src/synthetic_protocol_demo_api.mjs';
import {runOfflineOperatorMvpSmoke} from '../src/offline_operator_mvp_smoke.mjs';

test('real loopback owner click runs fake adapter trace with zero provider or payment operations',async()=>{
 const app=await startOfflineDemo();
 try{
  const session=await (await fetch(app.url+'/demo/session')).json();
  assert.equal(session.mode,'OFFLINE_MOCK');
  const response=await fetch(app.url+'/api/demo/provider-protocol',{
    method:'POST',headers:{
      'origin':app.url,'content-type':'application/json',
      'x-csrf-token':session.csrfToken
    },body:'{}'
  });
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.status,'SYNTHETIC_API_PROTOCOL_REPLAY_ONLY');
  assert.equal(data.realProviderCalls,0);
  assert.equal(data.realPaymentCaptured,false);
  assert.equal(data.externalRequestsAllowed,false);
  assert.equal(data.fakeCreatePosts,1);
  assert.equal(data.fakeCapturePosts,1);
  assert.equal(data.fakeGetReconciliation,true);
  assert.equal(data.approvals.length,5);
  assert.ok(data.stages.indexOf('FAKE_ORDER_GET_APPROVED')<
    data.stages.indexOf('FAKE_ORDER_CAPTURE_POST'));
  assert.ok(data.stages.indexOf('FAKE_ORDER_CAPTURE_POST')<
    data.stages.indexOf('FAKE_ORDER_GET_COMPLETED'));
  for(const privateData of ['FICTIONALORDER','FICTIONALCAPTURE','checkoutnow',
    'Bearer ','client_secret','access_token','PayerID'])
    assert.equal(JSON.stringify(data).includes(privateData),false);
  const quote=await (await fetch(app.url+'/api/quotes/sample-project')).json();
  assert.equal(quote.quote.status,'PROPOSED');
  assert.equal(quote.quote.version,1);
  assert.equal(quote.quote.approval,null);
  const payment=await fetch(app.url+'/api/quotes/sample-project/payment');
  assert.equal(payment.status,503);
 }finally{await app.close();}
});

test('fake integration replay rejects GET, cross-origin and absent/wrong CSRF without invoking orchestrator',async()=>{
 const app=await startOfflineDemo();
 try{
  const csrf=(await (await fetch(app.url+'/demo/session')).json()).csrfToken;
  const url=app.url+'/api/demo/provider-protocol';
  for(const [method,headers,body,expected] of [
   ['GET',{},undefined,405],
   ['POST',{'content-type':'application/json','x-csrf-token':csrf},'{}',403],
   ['POST',{'origin':'https://evil.example','content-type':'application/json','x-csrf-token':csrf},'{}',403],
   ['POST',{'origin':app.url,'content-type':'application/json','x-csrf-token':'wrong'},'{}',403],
   ['POST',{'origin':app.url,'content-type':'application/json','x-csrf-token':csrf},'{"force":true}',400]
  ]){
   const response=await fetch(url,{method,headers,...(body?{body}:{})});
   assert.equal(response.status,expected,method+' '+JSON.stringify(headers));
  }
  assert.equal((await (await fetch(app.url+'/api/quotes/sample-project')).json()).quote.version,1);
 }finally{await app.close();}
});

test('synthetic reviewer cannot access owner-only fake-provider replay',async()=>{
 const app=await startOfflineDemo({testReviewSessions:true});
 try{
  const csrf=(await (await fetch(app.url+'/demo/session')).json()).csrfToken;
  const response=await fetch(app.url+'/api/demo/provider-protocol',{
   method:'POST',headers:{origin:app.url,'content-type':'application/json',
     'x-csrf-token':csrf,cookie:app.testReviewerCookie},body:'{}'
  });
  assert.equal(response.status,404);
 }finally{await app.close();}
});

test('fake replay has explicit concurrency lock and per-session budget',async()=>{
 let release;
 const gate=new Promise(r=>{release=r});
 const api=createSyntheticProtocolDemoApi({
  resolveSession:async()=>({verified:true,actorId:'synthetic-owner',
    merchantId:'synthetic-merchant',csrfToken:'fixed-for-tests'}),
  runProbe:async()=>{await gate;return runOfflineOperatorMvpSmoke()},
  maxReplays:1
 });
 const req=()=>new Request('http://127.0.0.1:8811/api/demo/provider-protocol',{
  method:'POST',headers:{origin:'http://127.0.0.1:8811',
   'content-type':'application/json','x-csrf-token':'fixed-for-tests'},
  body:'{}'
 });
 const first=api(req());
 // Ensure the pending first replay has acquired the in-flight lock.
 await new Promise(r=>setImmediate(r));
 const second=await api(req());
 assert.equal(second.status,409);
 release();
 assert.equal((await first).status,200);
 assert.equal((await api(req())).status,429);
});

test('synthetic replay failure is not misreported as real provider proof',async()=>{
 const api=createSyntheticProtocolDemoApi({
  resolveSession:async()=>({verified:true,actorId:'synthetic-owner',
    merchantId:'synthetic-merchant',csrfToken:'fixed-for-tests'}),
  runProbe:async()=>{throw Error('PROVIDER_SECRET_SHOULD_NEVER_LEAK')}
 });
 const response=await api(new Request('http://127.0.0.1:8811/api/demo/provider-protocol',{
  method:'POST',headers:{origin:'http://127.0.0.1:8811',
   'content-type':'application/json','x-csrf-token':'fixed-for-tests'},
  body:'{}'
 }));
 assert.equal(response.status,503);
 assert.equal((await response.text()).includes('PROVIDER_SECRET_SHOULD_NEVER_LEAK'),false);
});
