import test from 'node:test';
import assert from 'node:assert/strict';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';

test('owner can inspect SQLite reservation history after approved offline negotiation',async()=>{
 const app=await startOfflineDemo({testReviewSessions:true});
 try{
  const session=await (await fetch(app.url+'/demo/session')).json();
  const post=async(path,data)=>{const response=await fetch(app.url+path,{method:'POST',headers:{origin:app.url,'content-type':'application/json','x-csrf-token':session.csrfToken},body:JSON.stringify(data)});return {status:response.status,data:await response.json()}};
  const quote='/api/quotes/'+session.quoteId;
  const draft=await post(quote+'/draft',{expectedVersion:1,scope:'Synthetic offline freelancer task'});
  assert.equal(draft.status,200);
  const version=draft.data.quote.version;
  const negotiation=await post('/api/demo/negotiate',{quoteId:session.quoteId,expectedVersion:version,buyerMaxMinor:30000,sellerMinMinor:20000,openingMinor:28000});
  assert.equal(negotiation.status,200);
  const amount=negotiation.data.agreedMinor;
  assert.equal((await post('/api/demo/budget/configure',{limitMinor:50000,confirmBudget:true})).status,200);
  assert.equal((await post(quote+'/approve',{expectedVersion:version,confirmed:true,amountMinor:amount})).status,200);
  assert.equal((await post('/api/demo/budget/reserve',{quoteId:session.quoteId,expectedVersion:version,negotiation:negotiation.data,explicitApproval:true})).status,200);
  const replay=await post('/api/demo/budget/reserve',{quoteId:session.quoteId,expectedVersion:version,negotiation:negotiation.data,explicitApproval:true});
  assert.equal(replay.status,200);
  const history=await (await fetch(app.url+'/api/demo/budget/history')).json();
  assert.equal(history.source,'OFFLINE_SQLITE');
  assert.deepEqual(history.reservations,[{quoteId:session.quoteId,quoteVersion:version,amountMinor:amount}]);
  const reviewer=await fetch(app.url+'/api/demo/budget/history',{headers:{cookie:app.testReviewerCookie}});
  assert.equal(reviewer.status,403);
 }finally{await app.close()}
});
