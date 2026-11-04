import test from 'node:test';import assert from 'node:assert/strict';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';
test('local budget API replay remains idempotent',async()=>{
 const app=await startOfflineDemo();
 try{
  const session=await (await fetch(app.url+'/demo/session')).json();
  const post=async(path,data)=>{
   const res=await fetch(app.url+path,{method:'POST',headers:{origin:app.url,'content-type':'application/json','x-csrf-token':session.csrfToken},body:JSON.stringify(data)});
   return {status:res.status,data:await res.json()};
  };
  const q='/api/quotes/'+session.quoteId;
  const draft=await post(q+'/draft',{expectedVersion:1,scope:'Build a fictional web app for local demo'});
  assert.equal(draft.status,200);
  const version=draft.data.quote.version;
  const proposed=await post('/api/demo/negotiate',{quoteId:session.quoteId,expectedVersion:version,buyerMaxMinor:30000,sellerMinMinor:20000,openingMinor:28000});
  assert.equal(proposed.status,200);
  const agreedMinor=proposed.data.agreedMinor;
  assert.equal((await post('/api/demo/budget/configure',{confirmBudget:true,limitMinor:agreedMinor})).status,200);
  assert.equal((await post(q+'/approve',{expectedVersion:version,confirmed:true,amountMinor:agreedMinor})).status,200);
  const request={quoteId:session.quoteId,expectedVersion:version,negotiation:proposed.data,explicitApproval:true};
  assert.equal((await post('/api/demo/budget/reserve',request)).status,200);
  const replay=await post('/api/demo/budget/reserve',request);
  assert.equal(replay.status,200);
  assert.equal(replay.data.reason,'ALREADY_RESERVED');
  assert.equal(replay.data.remainingMinor,0);
  assert.equal(replay.data.paymentAuthorized,false);
  assert.equal(replay.data.providerCallMade,false);
  const state=await (await fetch(app.url+'/api/demo/budget/status')).json();
  assert.equal(state.reservedMinor,agreedMinor);
 }finally{await app.close()}
});
