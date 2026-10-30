import test from 'node:test';
import assert from 'node:assert/strict';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';
test('local browser assets, negotiated quote budget reservation and delivery decision',async()=>{
 const app=await startOfflineDemo();
 try{
  for(const path of ['/demo/agent-budget.js','/demo/github-delivery.js']){
   const res=await fetch(app.url+path);assert.equal(res.status,200);assert.match(res.headers.get('content-type'),/javascript/);
  }
  const session=await (await fetch(app.url+'/demo/session')).json();
  const post=async(path,data,csrf=session.csrfToken)=>{
   const res=await fetch(app.url+path,{method:'POST',headers:{origin:app.url,'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify(data)});
   return {status:res.status,data:await res.json()};
  };
  const quoteRoute='/api/quotes/'+session.quoteId;
  const draft=await post(quoteRoute+'/draft',{expectedVersion:1,scope:'Create an offline synthetic marketplace page'});
  assert.equal(draft.status,200);
  const version=draft.data.quote.version;
  const negotiation=await post('/api/demo/negotiate',{quoteId:session.quoteId,expectedVersion:version,buyerMaxMinor:30000,sellerMinMinor:20000,openingMinor:28000});
  assert.equal(negotiation.status,200);
  assert.equal(negotiation.data.status,'PROPOSED');
  const amount=negotiation.data.agreedMinor;
  assert.equal((await post('/api/demo/budget/configure',{limitMinor:50000,confirmBudget:true},'wrong')).status,403);
  assert.equal((await post('/api/demo/budget/configure',{limitMinor:50000,confirmBudget:true})).status,200);
  assert.equal((await post('/api/demo/budget/reserve',{quoteId:session.quoteId,expectedVersion:version,negotiation:negotiation.data,explicitApproval:true})).status,409);
  assert.equal((await post(quoteRoute+'/approve',{expectedVersion:version,confirmed:true,amountMinor:amount})).status,200);
  const reservation=await post('/api/demo/budget/reserve',{quoteId:session.quoteId,expectedVersion:version,negotiation:negotiation.data,explicitApproval:true});
  assert.equal(reservation.status,200);assert.equal(reservation.data.paymentAuthorized,false);
  const state=await (await fetch(app.url+'/api/demo/budget/status')).json();
  assert.equal(state.reservedMinor,amount);
  const decision=await post('/api/demo/github-delivery',{repository:'fictional/demo',commitSha:'a'.repeat(40),prNumber:1,checks:[{name:'build',conclusion:'success'}],requiredChecks:['build'],reviewApproved:true,acknowledgeSynthetic:true});
  assert.equal(decision.status,200);assert.equal(decision.data.decision,'READY_FOR_HUMAN_SETTLEMENT_REVIEW');assert.equal(decision.data.payoutAuthorized,false);
 }finally{await app.close()}
});
