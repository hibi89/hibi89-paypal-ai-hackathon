import test from 'node:test';
import assert from 'node:assert/strict';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';
test('forged negotiated price cannot reserve synthetic SQLite budget',async()=>{
 const app=await startOfflineDemo();
 try{
  const session=await (await fetch(app.url+'/demo/session')).json();
  const post=async(path,data)=>{
   const res=await fetch(app.url+path,{method:'POST',headers:{origin:app.url,'content-type':'application/json','x-csrf-token':session.csrfToken},body:JSON.stringify(data)});
   return {status:res.status,body:await res.json()};
  };
  const q='/api/quotes/'+session.quoteId;
  const draft=await post(q+'/draft',{expectedVersion:1,scope:'Build a synthetic freelancer marketplace landing page'});
  assert.equal(draft.status,200);
  const version=draft.body.quote.version;
  const negotiation=await post('/api/demo/negotiate',{quoteId:session.quoteId,expectedVersion:version,buyerMaxMinor:30000,sellerMinMinor:20000,openingMinor:28000});
  assert.equal(negotiation.status,200);
  const proposal=negotiation.body;
  assert.equal((await post('/api/demo/budget/configure',{limitMinor:50000,confirmBudget:true})).status,200);
  assert.equal((await post(q+'/approve',{expectedVersion:version,confirmed:true,amountMinor:proposal.agreedMinor})).status,200);
  for(const forged of [
   {...proposal,agreedMinor:proposal.agreedMinor+100},
   {...proposal,source:'LIVE_GEMINI'},
   {...proposal,requiresHumanApproval:false},
   {...proposal,rounds:[]},
   {...proposal,paymentAuthorized:true}
  ]){
   const attempt=await post('/api/demo/budget/reserve',{quoteId:session.quoteId,expectedVersion:version,negotiation:forged,explicitApproval:true});
   assert.equal(attempt.status,409);
   assert.equal(attempt.body.error,'NEGOTIATION_NOT_ISSUED');
  }
  const status=await (await fetch(app.url+'/api/demo/budget/status')).json();
  assert.equal(status.reservedMinor,0);
  const legitimate=await post('/api/demo/budget/reserve',{quoteId:session.quoteId,expectedVersion:version,negotiation:proposal,explicitApproval:true});
  assert.equal(legitimate.status,200);
  assert.equal(legitimate.body.paymentAuthorized,false);
 }finally{await app.close()}
});
