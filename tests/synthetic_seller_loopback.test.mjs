import test from 'node:test';
import assert from 'node:assert/strict';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';

test('opt-in seller cookie scope, assignment, reviewer and no external provider',async()=>{
 const server=await startOfflineDemo({testReviewSessions:true,testSellerSessions:true,
   enableSyntheticSeller:true});
 try{
  const json=async(path,{method='GET',cookie,csrf,body}={})=>{
   const opts={method,headers:{...(cookie?{cookie}:{}),
     ...(method==='POST'?{
       'content-type':'application/json','origin':server.url,
       'x-csrf-token':csrf}:{} )},
     ...(method==='POST'?{body:JSON.stringify(body||{})}:{})};
   const response=await fetch(server.url+path,opts);
   return {code:response.status,data:await response.json()};
  };
  const owner=await json('/demo/session');
  assert.equal(owner.data.role,'owner');
  assert.equal(owner.data.syntheticSellerEnabled,true);
  const csrf=owner.data.csrfToken;
  const seller={cookie:server.testSellerCookie,csrf};
  const reviewer={cookie:server.testReviewerCookie,csrf};
  const sellerSession=await json('/demo/session',seller);
  assert.equal(sellerSession.data.role,'seller');
  assert.equal((await json('/api/demo/workflow/assign-seller',{method:'POST',
    cookie:server.testSellerCookie,csrf})).code,403);
  assert.equal((await json('/api/demo/workflow/assign-seller',{method:'POST',
    csrf})).code,404); // no contract
  assert.equal((await json('/api/demo/workflow/contracts/demo-contract/milestones/demo-milestone/submit',
    {...seller,method:'POST',body:{expectedVersion:1,expectedState:'PENDING',
      eventId:'pre-contract',detail:'Offline only fake data'}})).code,404);
  assert.equal((await json('/api/demo/protected/quotes/sample-project',seller)).code,403);
  const before=await json('/api/quotes/sample-project');
  assert.equal(before.data.quote.version,1);
  assert.equal((await json('/api/demo/workflow/assign-seller',{method:'GET'})).code,405);
  assert.equal((await json('/api/demo/identity',seller)).data.identity.role,'seller');
  const bad=await json('/api/demo/workflow/assign-seller',{
    method:'POST',csrf:'wrong'});
  assert.equal(bad.code,403);
  assert.equal((await json('/api/quotes/sample-project')).data.quote.status,'PROPOSED');
 }finally{await server.close();}
});
