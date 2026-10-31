import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createAgentBudgetDemoApi} from '../src/agent_budget_demo_api.mjs';
import {createMarketplaceIdentityPolicy} from '../src/marketplace_identity_policy.mjs';
import {createMarketplaceSelectionApi} from '../src/marketplace_selection_store.mjs';
import {createNegotiationDemoApi} from '../src/agent_negotiation_demo_api.mjs';
import {createNegotiationRegistry} from '../src/negotiation_registry.mjs';

test('real local HTTP: owner can view budget, fictional recommendation history and negotiate; reviewer/seller cannot',async()=>{
 const app=await startOfflineDemo({testReviewSessions:true,testSellerSessions:true,enableSyntheticSeller:true});
 try{
  const sess=await (await fetch(app.url+'/demo/session')).json();
  const csrf=sess.csrfToken;
  async function call(path,{method='GET',cookie,body,headers={}}={}){
   const resp=await fetch(app.url+path,{method,
    headers:{...(cookie?{cookie}:{}),...(method==='POST'?{
      origin:app.url,'content-type':'application/json','x-csrf-token':csrf}:{}),...headers},
    ...(method==='POST'?{body:JSON.stringify(body||{})}:{})});
   return {status:resp.status,data:await resp.json()};
  }
  for(const path of ['/api/demo/budget/status','/api/demo/budget/history']){
   const owner=await call(path);
   assert.equal(owner.status,200,JSON.stringify(owner));
   assert.equal((await call(path,{cookie:app.testReviewerCookie})).status,403);
   assert.equal((await call(path,{cookie:app.testSellerCookie})).status,403);
  }
  const budget=await call('/api/demo/budget/configure',{method:'POST',
   body:{confirmBudget:true,limitMinor:5000}});
  assert.equal(budget.status,200,JSON.stringify(budget));
  for(const cookie of [app.testReviewerCookie,app.testSellerCookie])
   assert.equal((await call('/api/demo/budget/configure',{method:'POST',
     cookie,body:{confirmBudget:true,limitMinor:10000}})).status,403);
  const matched=await call('/api/demo/marketplace',{method:'POST',
   body:{brief:'Build a website with PayPal checkout',vertical:'ai_work'}});
  assert.equal(matched.status,200,JSON.stringify(matched));
  const history=await call('/api/demo/marketplace/history?sessionId='+matched.data.sessionId);
  assert.equal(history.status,200);
  for(const cookie of [app.testReviewerCookie,app.testSellerCookie]){
   assert.equal((await call('/api/demo/marketplace/history?sessionId='+matched.data.sessionId,
     {cookie})).status,403);
   assert.equal((await call('/api/demo/marketplace',{cookie,method:'POST',
     body:{brief:'Build a website with PayPal checkout',vertical:'ai_work'}})).status,403);
  }
  const neg={quoteId:sess.quoteId,expectedVersion:1,buyerMaxMinor:30000,
    sellerMinMinor:25000,openingMinor:28000};
  const proposed=await call('/api/demo/negotiate',{method:'POST',body:neg});
  assert.equal(proposed.status,200,JSON.stringify(proposed));
  assert.equal(proposed.data.paymentAuthorized,false);
  // Existing quote ownership boundary masks foreign quote IDs with 404.
  for(const cookie of [app.testReviewerCookie,app.testSellerCookie])
   assert.equal((await call('/api/demo/negotiate',{method:'POST',cookie,body:neg})).status,404);
  const noSelection=await call('/api/demo/marketplace/selection?quoteId='+sess.quoteId);
  assert.equal(noSelection.status,404);
  assert.equal((await call('/api/demo/marketplace/selection?quoteId='+sess.quoteId,
    {cookie:app.testReviewerCookie})).status,403);
  assert.equal((await call('/api/demo/marketplace/selection?quoteId='+sess.quoteId,
    {cookie:app.testSellerCookie})).status,403);
  assert.equal((await call('/api/quotes/'+sess.quoteId+'/orders',{method:'POST'})).status,503);
 }finally{await app.close();}
});

test('budget reservation rejects reactivated old grant before reserve in separate SQLite',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'paypal-budget-role-boundary-'));
 const filename=join(folder,'quote.sqlite');
 const ledger=createSqliteLedger({filename,enforceLocalMemberWrites:true});
 const second=createSqliteLedger({filename,enforceLocalMemberWrites:true});
 try{
  const buyer='synthetic-owner',merchant='synthetic-merchant',q='q1';
  await ledger.insertQuote({id:q,ownerId:buyer,merchantId:merchant});
  await ledger.provisionLocalMember({actorId:buyer,merchantId:merchant,role:'buyer'});
  await ledger.approve({id:q,actorId:buyer,expectedVersion:1,amountMinor:1500});
  const sessions=new WeakMap();
  const resolveSession=req=>sessions.get(req);
  const policy=createMarketplaceIdentityPolicy({
    resolveTrustedSession:resolveSession,
    resolveMembership:actor=>ledger.getLocalMember(actor)
  });
  let reads=0,writes=0;
  const quotes={get:async id=>{
    reads++;
    if(reads===2){
      await second.setLocalMemberActive({actorId:buyer,expectedRevision:1,active:false});
      await second.setLocalMemberActive({actorId:buyer,expectedRevision:2,active:true});
    }
    return ledger.get(id);
  },getQuoteAuthorityResource:id=>ledger.getQuoteAuthorityResource(id)};
  const budgets={
    status:()=>({configured:true,limitMinor:5000,reservedMinor:0}),
    existing:()=>null,
    reserve:()=>{writes++;return {ok:true}},
    configure:()=>{writes++;return {ok:true}},
    history:()=>[]
  };
  const api=createAgentBudgetDemoApi({resolveSession,quotes,budgets,
    identityPolicy:policy,registry:{verify:()=>true}});
  const data={quoteId:q,expectedVersion:1,explicitApproval:true,
    negotiation:{quoteId:q,quoteVersion:1,status:'PROPOSED',currency:'USD',
      agreedMinor:1500,paymentAuthorized:false}};
  const req=new Request('https://local.test/api/demo/budget/reserve',{
   method:'POST',headers:{origin:'https://local.test','x-csrf-token':'token',
   'content-type':'application/json'},body:JSON.stringify(data)});
  sessions.set(req,{verified:true,actorId:buyer,merchantId:merchant,csrfToken:'token'});
  const denied=await api(req);
  assert.equal(denied.status,403,await denied.text());
  assert.equal(writes,0);
  assert.equal((await ledger.getLocalMember(buyer)).revision,3);
  const fresh=new Request(req.url,{method:'POST',headers:req.headers,
    body:JSON.stringify(data)});
  sessions.set(fresh,{verified:true,actorId:buyer,merchantId:merchant,csrfToken:'token'});
  const allowed=await api(fresh);
  assert.equal(allowed.status,200,JSON.stringify(await allowed.json()));
  assert.equal(writes,1);
 }finally{second.close();ledger.close();rmSync(folder,{recursive:true,force:true});}
});

test('extra REST authorization fails closed for unversioned members and foreign tenant',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'paypal-extra-policy-'));
 const ledger=createSqliteLedger({filename:join(folder,'ledger.sqlite'),enforceLocalMemberWrites:true});
 try{
  await ledger.insertQuote({id:'q1',ownerId:'synthetic-owner',merchantId:'synthetic-merchant'});
  const resolveSession=async()=>({verified:true,actorId:'synthetic-owner',
    merchantId:'synthetic-merchant',csrfToken:'x'});
  const members=[{actorId:'synthetic-owner',merchantId:'synthetic-merchant',
    role:'buyer',active:true}]; // no durable revision
  const policy=createMarketplaceIdentityPolicy({resolveTrustedSession:resolveSession,members});
  const budgets={status:()=>({configured:true,limitMinor:5000,reservedMinor:0}),
    history:()=>[],configure:()=>({ok:true}),reserve:()=>({ok:false})};
  const budget=createAgentBudgetDemoApi({resolveSession,quotes:ledger,budgets,
    identityPolicy:policy,registry:{verify:()=>false}});
  const result=await budget(new Request('https://x.test/api/demo/budget/status'));
  assert.equal(result.status,403);
  assert.equal((await result.json()).error,'TRUSTED_MEMBERSHIP_REVISION_REQUIRED');
  const registry=createNegotiationRegistry();
  const negotiation=createNegotiationDemoApi({resolveSession,repository:ledger,
    identityPolicy:policy,registry});
  const req=new Request('https://x.test/api/demo/negotiate',{method:'POST',
    headers:{origin:'https://x.test','x-csrf-token':'x','content-type':'application/json'},
    body:JSON.stringify({quoteId:'q1',expectedVersion:1,buyerMaxMinor:3000,
      sellerMinMinor:2000,openingMinor:2500})});
  const denied=await negotiation(req);
  assert.equal(denied.status,403);
  assert.equal((await denied.json()).error,'TRUSTED_MEMBERSHIP_REVISION_REQUIRED');
 }finally{ledger.close();rmSync(folder,{recursive:true,force:true});}
});
