import test from 'node:test';
import assert from 'node:assert/strict';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';

test('HTTP reservation rejects fabricated negotiation binding and never reserves funds',async()=>{
 const app=await startOfflineDemo();
 try{
  const session=await (await fetch(app.url+'/demo/session')).json();
  const post=async(path,data)=>{
   const response=await fetch(app.url+path,{method:'POST',headers:{origin:app.url,'content-type':'application/json','x-csrf-token':session.csrfToken},body:JSON.stringify(data)});
   return {status:response.status,body:await response.json()};
  };
  const draft=await post('/api/quotes/'+session.quoteId+'/draft',{expectedVersion:1,scope:'Create fictional freelance landing page'});
  assert.equal(draft.status,200);
  const version=draft.body.quote.version;
  assert.equal((await post('/api/demo/budget/configure',{limitMinor:50000,confirmBudget:true})).status,200);
  assert.equal((await post('/api/quotes/'+session.quoteId+'/approve',{expectedVersion:version,confirmed:true,amountMinor:20000})).status,200);
  const proposal={quoteId:session.quoteId,quoteVersion:version,status:'PROPOSED',currency:'USD',agreedMinor:20000,paymentAuthorized:false};
  for(const negotiation of [{...proposal,quoteId:'other'},{...proposal,quoteVersion:version-1},{...proposal,quoteId:undefined},{...proposal,quoteVersion:undefined}]){
   const attempt=await post('/api/demo/budget/reserve',{quoteId:session.quoteId,expectedVersion:version,negotiation,explicitApproval:true});
   assert.equal(attempt.status,409);
   assert.equal(attempt.body.error,'NEGOTIATION_BINDING_REQUIRED');
  }
  const state=await (await fetch(app.url+'/api/demo/budget/status')).json();
  assert.equal(state.reservedMinor,0);
 }finally{await app.close()}
});
