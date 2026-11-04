import test from 'node:test';
import assert from 'node:assert/strict';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';

// General Services must do more than display a second category:
// exercise the SAME local quote/approval/contract boundary as AI Work.
// This never calls Gemini/PayPal, submits an order or authorizes payout.
test('Global Services fictional design match completes shared human-approved quote and unpaid contract',async()=>{
 const app=await startOfflineDemo({testReviewSessions:true});
 try{
  const session=await (await fetch(app.url+'/demo/session')).json();
  assert.equal(session.mode,'OFFLINE_MOCK');
  assert.equal(session.role,'owner');
  const post=async(path,payload)=>{
   const res=await fetch(app.url+path,{
    method:'POST',
    headers:{origin:app.url,'content-type':'application/json','x-csrf-token':session.csrfToken},
    body:JSON.stringify(payload),
   });
   return {status:res.status,data:await res.json()};
  };
  const brief='Design a new logo and brand identity for my small business';
  const general=await post('/api/demo/marketplace',{vertical:'general_services',brief});
  assert.equal(general.status,200);
  assert.equal(general.data.vertical,'general_services');
  assert.equal(general.data.mode,'OFFLINE_SYNTHETIC_NO_AI');
  assert.equal(general.data.profiles.length,3);
  const profile=general.data.profiles.find(p=>p.id==='synthetic-creative');
  assert.ok(profile);
  assert.equal(profile.source,'SYNTHETIC_PROFILE');
  assert.equal(profile.eligible,true);
  assert.equal(general.data.paypal.capturePerformed,false);
  const quotePath='/api/quotes/'+session.quoteId;
  const scope=brief+' [Synthetic candidate: synthetic-creative]';
  const draft=await post(quotePath+'/draft',{expectedVersion:1,scope});
  assert.equal(draft.status,200);
  assert.equal(draft.data.quote.scope,scope);
  const version=draft.data.quote.version;
  const amountMinor=2900;
  const approval=await post(quotePath+'/approve',{expectedVersion:version,confirmed:true,amountMinor});
  assert.equal(approval.status,200);
  assert.equal(approval.data.quote.approval.amountMinor,amountMinor);
  const stale=await post(quotePath+'/approve',{expectedVersion:version,confirmed:true,amountMinor});
  assert.notEqual(stale.status,200,'stale approval cannot be reused');
  const create=await post('/api/contracts',{
   id:'general-service-contract',quoteId:session.quoteId,
   reviewerId:session.reviewerId,expectedVersion:version,
   eventId:'generalServiceCreated',
   milestones:[{id:'general-service-milestone',step:1,amountMinor}],
  });
  assert.equal(create.status,201);
  const contract=await (await fetch(app.url+'/api/contracts/general-service-contract')).json();
  assert.equal(contract.contract.paymentState,'NOT_CAPTURED');
  assert.equal(contract.contract.milestones[0].state,'PENDING');
  const otherCategory=await post('/api/demo/marketplace',{
   vertical:'ai_work',brief:'Build an ecommerce website with PayPal checkout',
  });
  assert.equal(otherCategory.status,200);
  assert.equal(otherCategory.data.vertical,'ai_work');
  const unchanged=await (await fetch(app.url+quotePath)).json();
  assert.equal(unchanged.quote.scope,scope,'switching category never silently overwrites approved scope');
  assert.equal(unchanged.quote.approval.amountMinor,amountMinor);
  assert.equal((await post(quotePath+'/orders',{})).status,503,'browser order POST remains disabled');
 }finally{await app.close()}
});
