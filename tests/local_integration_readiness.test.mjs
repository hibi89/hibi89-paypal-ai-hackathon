import test from 'node:test';
import assert from 'node:assert/strict';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';
import {evaluateLocalIntegration} from '../src/local_integration_readiness.mjs';

test('D13: readiness cannot become production or payment-ready even if all local flows accepted',()=>{
  const quote={id:'q',ownerId:'owner',merchantId:'merchant',
    status:'APPROVED',version:2,currency:'USD',
    approval:{actorId:'owner',quoteVersion:2,amountMinor:1500}};
  const contract={id:'c',quoteId:'q',quoteVersion:2,ownerId:'owner',merchantId:'merchant',
    amountMinor:1500,currency:'USD',paymentState:'NOT_CAPTURED',
    milestones:[{amountMinor:1500,state:'ACCEPTED'}]};
  const subscription={mode:'OFFLINE_SCENARIO_NO_PROVIDER',state:'ACTIVE',
    paymentEvidence:'NOT_VERIFIED'};
  const result=evaluateLocalIntegration({quote,contract,subscription});
  assert.equal(result.status,'LOCAL_DEMO_CANDIDATE');
  assert.equal(result.realPayPal,'NOT_TESTED');
  assert.equal(result.realAI,'NOT_TESTED');
  assert.equal(result.productionAuth,'NOT_CONFIGURED');
  assert.equal(result.publicDeployment,'NOT_TESTED');
  assert.equal(result.contractPayment,'NOT_CAPTURED');
  assert.equal(result.subscriptionPayment,'NOT_VERIFIED');
  assert.ok(!JSON.stringify(result).includes('owner'));
});
test('D13: inconsistent amount/version/owner/merchant or fulfillment cannot pass data gate',()=>{
  const quote={id:'q',ownerId:'x',merchantId:'m',status:'APPROVED',version:2,currency:'USD',
    approval:{actorId:'x',quoteVersion:2,amountMinor:1200}};
  const contract={id:'c',quoteId:'q',quoteVersion:2,ownerId:'x',merchantId:'m',currency:'USD',
    amountMinor:1200,paymentState:'NOT_CAPTURED',milestones:[{amountMinor:1200,state:'ACCEPTED'}]};
  const subscription={mode:'OFFLINE_SCENARIO_NO_PROVIDER',state:'ACTIVE',
    paymentEvidence:'NOT_VERIFIED'};
  for(const broken of [{...contract,quoteVersion:3},{...contract,amountMinor:1199},
    {...contract,ownerId:'other'},{...contract,merchantId:'other'},
    {...contract,milestones:[{amountMinor:700,state:'ACCEPTED'}]},
    {...contract,milestones:[{amountMinor:1200,state:'SUBMITTED'}]}]){
    const result=evaluateLocalIntegration({quote,contract:broken,subscription});
    assert.equal(result.status,'LOCAL_DEMO_INCOMPLETE');
  }
  assert.equal(evaluateLocalIntegration({quote,contract,
    subscription:{...subscription,paymentEvidence:'PAID'}}).status,'LOCAL_DEMO_INCOMPLETE');
});
test('D13: nonpositive and overflowed milestones cannot qualify as accepted delivery',()=>{
 const quote={id:'q',ownerId:'o',merchantId:'m',status:'APPROVED',version:1,
   currency:'USD',approval:{actorId:'o',quoteVersion:1,amountMinor:1200}};
 const base={quoteId:'q',quoteVersion:1,ownerId:'o',merchantId:'m',currency:'USD',
   amountMinor:1200,paymentState:'NOT_CAPTURED'};
 const subscription={mode:'OFFLINE_SCENARIO_NO_PROVIDER',state:'ACTIVE',paymentEvidence:'NOT_VERIFIED'};
 for(const milestones of [
   [{amountMinor:1300,state:'ACCEPTED'},{amountMinor:-100,state:'ACCEPTED'}],
   [{amountMinor:1200,state:'ACCEPTED'},{amountMinor:0,state:'ACCEPTED'}],
   [{amountMinor:1200,state:'ACCEPTED'},{amountMinor:NaN,state:'ACCEPTED'}],
   [{amountMinor:1200,state:'ACCEPTED'},{amountMinor:1.5,state:'ACCEPTED'}],
   [{amountMinor:Number.MAX_SAFE_INTEGER,state:'ACCEPTED'},
    {amountMinor:Number.MAX_SAFE_INTEGER,state:'ACCEPTED'}]
 ]){
   const result=evaluateLocalIntegration({quote,contract:{...base,milestones},subscription});
   assert.equal(result.status,'LOCAL_DEMO_INCOMPLETE');
   assert.equal(result.dataContract,'MISMATCH');
 }
});
test('D13: local integration GET-only before quote approval, cross feature session isolated',async()=>{
  const app=await startOfflineDemo({testReviewSessions:true});
  try{
    const url=app.url+'/api/demo/integration';
    const r=await fetch(url);
    assert.equal(r.status,200);
    const status=await r.json();
    assert.equal(status.status,'LOCAL_DEMO_INCOMPLETE');
    assert.equal(status.quote,'HUMAN_APPROVAL_REQUIRED');
    assert.equal(status.contract,'NO_CONTRACT');
    assert.equal(status.subscription,'NOT_STARTED');
    assert.equal(status.realPayPal,'NOT_TESTED');
    assert.equal((await fetch(url,{method:'POST',headers:{'content-type':'application/json'},
      body:'{"approved":true}'})).status,405);
    assert.equal((await fetch(url,{headers:{cookie:app.testReviewerCookie}})).status,404);
    assert.equal((await fetch(url+'?actorId=synthetic-owner&merchantId=synthetic-merchant',
      {headers:{cookie:app.testReviewerCookie,'x-demo-role':'owner'}})).status,404);
    assert.equal((await fetch(app.url+'/demo/integration.js')).status,200);
    const noMutation=await (await fetch(url)).json();
    assert.deepEqual(noMutation,status);
  }finally{await app.close()}
});
test('D13: quote approval→contract→review→subscription remains separate from money',async()=>{
  const app=await startOfflineDemo({testReviewSessions:true});
  try{
    const s=await (await fetch(app.url+'/demo/session')).json(),base=app.url;
    const get=async()=>(await (await fetch(base+'/api/demo/integration')).json());
    const post=(path,payload,cookie)=>fetch(base+path,{
      method:'POST',
      headers:{'content-type':'application/json','x-csrf-token':s.csrfToken,
        ...(cookie?{cookie}:{})},
      body:JSON.stringify(payload)
    });
    const quote=base+'/api/quotes/'+s.quoteId, ct='/api/contracts',
      sub='/api/demo/subscription/actions/';
    const approval=await post('/api/quotes/'+s.quoteId+'/approve',
      {expectedVersion:1,confirmed:true,amountMinor:1500});
    assert.equal(approval.status,200);
    assert.equal((await get()).quote,'HUMAN_APPROVED');
    assert.equal((await post(ct,{id:s.contractId,quoteId:s.quoteId,
      reviewerId:s.reviewerId,expectedVersion:1,eventId:'CREATE-13',
      milestones:[{id:s.milestoneId,step:1,amountMinor:1500}]})).status,201);
    assert.equal((await get()).dataContract,'CONSISTENT');
    // A signed contract locks this quote version. No retroactive price/scope edits.
    const revised=await post('/api/quotes/'+s.quoteId+'/draft',
      {scope:'Try to rewrite after contracting',expectedVersion:1});
    assert.equal(revised.status,409);
    assert.equal((await revised.json()).error,'CONTRACT_EXISTS');
    assert.equal((await post(sub+'start',{expectedVersion:1,eventId:'START-13'})).status,200);
    let overview=await get();
    assert.equal(overview.status,'LOCAL_DEMO_INCOMPLETE');
    assert.equal(overview.subscription,'ACTIVE');
    const mil=ct+'/'+s.contractId+'/milestones/'+s.milestoneId;
    assert.equal((await post(mil+'/submit',{expectedVersion:1,
      eventId:'SUBMIT-13',expectedState:'PENDING',detail:'Synthetic release artifacts'})).status,200);
    assert.equal((await post(mil+'/accept',{expectedVersion:2,eventId:'OWNER-FORGE'})).status,403);
    assert.equal((await post(mil+'/accept',{expectedVersion:2,eventId:'REVIEWER-13'},
      app.testReviewerCookie)).status,200);
    overview=await get();
    assert.equal(overview.status,'LOCAL_DEMO_CANDIDATE');
    assert.equal(overview.contract,'DELIVERY_ACCEPTED');
    assert.equal(overview.realPayPal,'NOT_TESTED');
    assert.equal(overview.contractPayment,'NOT_CAPTURED');
    assert.equal(overview.subscriptionPayment,'NOT_VERIFIED');
    // Payment order calls STILL refuse without a provider. No hidden payment POST.
    const order=await post('/api/quotes/'+s.quoteId+'/orders',{});
    assert.equal(order.status,503);
    const failed=await post(sub+'fail',{expectedVersion:2,eventId:'FAIL-13'});
    assert.equal(failed.status,200);
    overview=await get();
    assert.equal(overview.status,'LOCAL_DEMO_INCOMPLETE');
    assert.equal(overview.subscription,'RECOVERY_REQUIRED');
    assert.equal((await post(sub+'recover',{expectedVersion:3,eventId:'RECOVER-13'})).status,200);
    assert.equal((await get()).status,'LOCAL_DEMO_CANDIDATE');
    assert.equal((await post(sub+'cancel',{expectedVersion:4,eventId:'CANCEL-13'})).status,200);
    overview=await get();
    assert.equal(overview.subscription,'CANCELLED');
    assert.equal(overview.status,'LOCAL_DEMO_INCOMPLETE');
    const evt=await (await fetch(base+ct+'/'+s.contractId+'/events')).json();
    assert.deepEqual(evt.events.map(x=>x.eventType),['CREATED','SUBMITTED','ACCEPTED']);
    const receipt=await (await fetch(quote)).json();
    assert.equal(receipt.quote.version,1);
    assert.equal(receipt.quote.status,'APPROVED');
  }finally{await app.close()}
});
