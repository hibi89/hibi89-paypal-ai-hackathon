import test from 'node:test';
import assert from 'node:assert/strict';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';

test('single offline user journey: draft, negotiation, approval, reservation, contract, delivery and review',async()=>{
 const app=await startOfflineDemo({testReviewSessions:true});
 try{
  const session=await (await fetch(app.url+'/demo/session')).json();
  const post=async(path,data,cookie)=>{
   const res=await fetch(app.url+path,{method:'POST',headers:{origin:app.url,'content-type':'application/json','x-csrf-token':session.csrfToken,...(cookie?{cookie}:{})},body:JSON.stringify(data)});
   return {status:res.status,data:await res.json()};
  };
  const quotePath='/api/quotes/'+session.quoteId;
  const draft=await post(quotePath+'/draft',{expectedVersion:1,scope:'Build a fictional global freelance landing page'});
  assert.equal(draft.status,200);
  const version=draft.data.quote.version;
  const proposal=await post('/api/demo/negotiate',{quoteId:session.quoteId,expectedVersion:version,buyerMaxMinor:30000,sellerMinMinor:20000,openingMinor:28000});
  assert.equal(proposal.status,200);
  assert.equal(proposal.data.status,'PROPOSED');
  assert.equal(proposal.data.paymentAuthorized,false);
  const amount=proposal.data.agreedMinor;
  assert.equal((await post('/api/demo/budget/configure',{limitMinor:50000,confirmBudget:true})).status,200);
  assert.equal((await post(quotePath+'/approve',{expectedVersion:version,confirmed:true,amountMinor:amount})).status,200);
  const reservation=await post('/api/demo/budget/reserve',{quoteId:session.quoteId,expectedVersion:version,negotiation:proposal.data,explicitApproval:true});
  assert.equal(reservation.status,200);
  assert.equal(reservation.data.paymentAuthorized,false);
  const budget=await (await fetch(app.url+'/api/demo/budget/status')).json();
  assert.equal(budget.reservedMinor,amount);
  assert.equal(budget.source,'OFFLINE_SQLITE');
  const reservations=await (await fetch(app.url+'/api/demo/budget/history')).json();
  assert.equal(reservations.source,'OFFLINE_SQLITE');
  assert.deepEqual(reservations.reservations,[{quoteId:session.quoteId,quoteVersion:version,amountMinor:amount}]);
  const create=await post('/api/contracts',{id:'demo-contract',quoteId:session.quoteId,reviewerId:session.reviewerId,expectedVersion:version,eventId:'createdJourney',milestones:[{id:'demo-milestone',step:1,amountMinor:amount}]});
  assert.equal(create.status,201);
  const milestone='/api/contracts/demo-contract/milestones/demo-milestone/';
  assert.equal((await post(milestone+'submit',{expectedVersion:1,expectedState:'PENDING',eventId:'submittedJourney',detail:'Synthetic deliverables ready for review'})).status,200);
  assert.equal((await post(milestone+'accept',{expectedVersion:2,eventId:'acceptedJourney'},app.testReviewerCookie)).status,200);
  const contract=await (await fetch(app.url+'/api/contracts/demo-contract')).json();
  assert.equal(contract.contract.milestones[0].state,'ACCEPTED');
  assert.equal(contract.contract.paymentState,'NOT_CAPTURED');
  const reviewerHistory=await fetch(app.url+'/api/demo/budget/history',{headers:{cookie:app.testReviewerCookie}});
  assert.equal(reviewerHistory.status,403);
  const delivery=await post('/api/demo/github-delivery',{repository:'fictional/demo',commitSha:'a'.repeat(40),prNumber:1,checks:[{name:'build',conclusion:'success'}],requiredChecks:['build'],reviewApproved:true,acknowledgeSynthetic:true});
  assert.equal(delivery.status,200);
  assert.equal(delivery.data.decision,'READY_FOR_HUMAN_SETTLEMENT_REVIEW');
  assert.equal(delivery.data.payoutAuthorized,false);
  assert.equal((await post(quotePath+'/orders',{})).status,503);
 }finally{await app.close()}
});
