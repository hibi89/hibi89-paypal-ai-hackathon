import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createSubscriptionScenarioStore} from '../src/subscription_demo_store.mjs';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';

const withDB=fn=>async()=>{
  const dir=mkdtempSync(join(tmpdir(),'paypal-d12-test-'));
  const filename=join(dir,'state.sqlite');
  let store=createSubscriptionScenarioStore({filename});
  try{
    const id={subscriptionId:'demo-sub',ownerId:'owner',merchantId:'merchant'};
    store.seed(id);
    await fn({store,id,reopen:()=>{
      store.close();store=createSubscriptionScenarioStore({filename});return store;
    }});
  }finally{store.close();rmSync(dir,{recursive:true,force:true})}
};
test('D12: subscription event ledger rejects updates and deletes after reopen',withDB(async x=>{
 const i=x.id;
 let s=x.store.get({subscriptionId:i.subscriptionId,actorId:i.ownerId,merchantId:i.merchantId});
 x.store.step({subscriptionId:i.subscriptionId,actorId:i.ownerId,merchantId:i.merchantId,
   action:'start',expectedVersion:s.version,eventId:'IMMUTABLE1'});
 const events=x.store.events({subscriptionId:i.subscriptionId,actorId:i.ownerId,merchantId:i.merchantId});
 assert.equal(events.length,1);
 assert.equal(events[0].source,'OFFLINE_SCENARIO');
 const reopened=x.reopen();
 assert.deepEqual(reopened.events({subscriptionId:i.subscriptionId,actorId:i.ownerId,merchantId:i.merchantId}),events);
}));
test('D12: DB rejects memory and keeps payment evidence NOT_VERIFIED',()=>{
 assert.throws(()=>createSubscriptionScenarioStore({filename:':memory:'}),
   {code:'DURABLE_DEMO_DB_REQUIRED'});
});
test('D12: valid local start→failure→synthetic GET fixture recovery→cancel',withDB(async x=>{
  const p=x.id;
  let s=x.store.get({subscriptionId:p.subscriptionId,actorId:'owner',merchantId:'merchant'});
  assert.equal(s.version,1);assert.equal(s.state,'NOT_STARTED');
  assert.equal(s.paymentEvidence,'NOT_VERIFIED');
  const step=(action,id)=>x.store.step({subscriptionId:p.subscriptionId,
    actorId:'owner',merchantId:'merchant',action,expectedVersion:s.version,eventId:id});
  s=step('start','EVENT1');assert.equal(s.state,'ACTIVE');
  s=step('fail','EVENT2');assert.equal(s.state,'RECOVERY_REQUIRED');
  assert.match(s.failureHint,/Synthetic renewal failure/);
  s=step('recover','EVENT3');assert.equal(s.state,'ACTIVE');
  assert.equal(s.recoveryEvidence,'SYNTHETIC_GET_FIXTURE_ONLY_NOT_PAYPAL');
  s=step('cancel','EVENT4');assert.equal(s.state,'CANCELLED');
  assert.equal(s.paymentEvidence,'NOT_VERIFIED');
  assert.deepEqual(x.store.events({subscriptionId:p.subscriptionId,actorId:'owner',
    merchantId:'merchant'}).map(e=>e.action),['start','fail','recover','cancel']);
  assert.throws(()=>step('start','EVENT5'),{code:'DEMO_TRANSITION_FORBIDDEN'});
  assert.throws(()=>step('recover','EVENT6'),{code:'DEMO_TRANSITION_FORBIDDEN'});
}));
test('D12: stale version, duplicate event and illegal transitions leave state unchanged',withDB(async x=>{
  const i=x.id;
  const step=(action,expectedVersion,eventId)=>x.store.step({
    subscriptionId:i.subscriptionId,actorId:i.ownerId,merchantId:i.merchantId,
    action,expectedVersion,eventId});
  assert.throws(()=>step('fail',1,'EARLYFAIL'),{code:'DEMO_TRANSITION_FORBIDDEN'});
  assert.throws(()=>step('start',2,'STALE'),{code:'STALE_DEMO_VERSION'});
  step('start',1,'EVENT-ONE');
  assert.throws(()=>step('start',2,'EVENT-OTHER'),{code:'DEMO_TRANSITION_FORBIDDEN'});
  assert.throws(()=>step('fail',1,'EVENT-ONE'),{code:'STALE_DEMO_VERSION'});
  assert.throws(()=>step('fail',2,'EVENT-ONE'),{code:'DUPLICATE_DEMO_EVENT'});
  const s=x.store.get({subscriptionId:i.subscriptionId,actorId:i.ownerId,
    merchantId:i.merchantId});
  assert.equal(s.state,'ACTIVE');assert.equal(s.version,2);
  assert.equal(x.store.events({subscriptionId:i.subscriptionId,actorId:i.ownerId,
    merchantId:i.merchantId}).length,1);
}));
test('D12: merchant and owner isolation; no client-selected actor or merchant',withDB(async x=>{
  const i=x.id;
  for(const identity of [
    {actorId:'reviewer',merchantId:'merchant'},
    {actorId:'owner',merchantId:'other'},
    {actorId:'unknown',merchantId:'unknown'}]){
    assert.throws(()=>x.store.get({subscriptionId:i.subscriptionId,...identity}),
      {code:'SUBSCRIPTION_NOT_FOUND'});
    assert.throws(()=>x.store.step({subscriptionId:i.subscriptionId,...identity,
      action:'start',eventId:'FORGED',expectedVersion:1}),
      {code:'SUBSCRIPTION_NOT_FOUND'});
  }
  assert.throws(()=>x.store.seed({...i,ownerId:'someone-else'}),
    {code:'SUBSCRIPTION_BINDING_CONFLICT'});
}));
test('D12: disk-reopen retains scenario, audit and forbids cancelled resurrection',withDB(async x=>{
  const p=x.id;
  x.store.step({subscriptionId:p.subscriptionId,actorId:p.ownerId,
    merchantId:p.merchantId,action:'start',expectedVersion:1,eventId:'START1'});
  x.store.step({subscriptionId:p.subscriptionId,actorId:p.ownerId,
    merchantId:p.merchantId,action:'cancel',expectedVersion:2,eventId:'CANCEL2'});
  const reopened=x.reopen();
  const s=reopened.get({subscriptionId:p.subscriptionId,
    actorId:p.ownerId,merchantId:p.merchantId});
  assert.equal(s.state,'CANCELLED');assert.equal(s.version,3);
  assert.equal(reopened.events({subscriptionId:p.subscriptionId,
    actorId:p.ownerId,merchantId:p.merchantId}).length,2);
  assert.throws(()=>reopened.step({subscriptionId:p.subscriptionId,
    actorId:p.ownerId,merchantId:p.merchantId,action:'start',expectedVersion:3,eventId:'AGAIN'}),
    {code:'DEMO_TRANSITION_FORBIDDEN'});
}));
test('D12: local HTTP GET is read-only, POST needs CSRF and exact trusted shape',async()=>{
 const app=await startOfflineDemo();
 try{
  const session=await (await fetch(app.url+'/demo/session')).json();
  const url=app.url+'/api/demo/subscription';
  const req=async(path,body,headers={})=>fetch(url+path,{method:'POST',
    headers:{'content-type':'application/json','x-csrf-token':session.csrfToken,...headers},
    body:JSON.stringify(body)});
  for(let i=0;i<3;i++){
    const r=await fetch(url);assert.equal(r.status,200);
    const s=(await r.json()).subscription;
    assert.equal(s.state,'NOT_STARTED');assert.equal(s.version,1);
    assert.equal(s.paymentEvidence,'NOT_VERIFIED');
  }
  assert.equal((await fetch(app.url+'/demo/subscription.js')).status,200);
  const missing=await fetch(url+'/actions/start',{method:'POST',
    headers:{'content-type':'application/json'},body:'{}'});
  assert.equal(missing.status,403);
  assert.equal((await req('/actions/start',{expectedVersion:1,eventId:'BAD',
    actorId:'synthetic-owner'})).status,400);
  assert.equal((await req('/actions/start',{expectedVersion:1,eventId:'BAD'},
    {origin:'https://attacker.example'})).status,403);
  assert.equal((await req('/actions/start',{expectedVersion:1,eventId:'GOOD',
    merchantId:'synthetic-merchant'})).status,400);
  assert.equal((await req('/actions/start',{expectedVersion:1,eventId:'GOOD'})).status,200);
  assert.equal((await req('/actions/start',{expectedVersion:1,eventId:'ANOTHER'})).status,409);
  assert.equal((await fetch(url)).status,200);
  assert.equal((await (await fetch(url)).json()).subscription.version,2);
  assert.equal((await fetch(url+'/actions/fail')).status,405);
  assert.equal((await req('/actions/start',{expectedVersion:2,eventId:'OTHER'})).status,409);
  // No human quote approval exists; upstream quote gate refuses at 409
  // before the later 503 provider gate. Neither response issues a payment.
  const order=await fetch(app.url+'/api/quotes/'+session.quoteId+'/orders',{
    method:'POST',headers:{'x-csrf-token':session.csrfToken},body:'{}'});
  assert.equal(order.status,409);
  assert.equal((await order.json()).error,'HUMAN_APPROVAL_REQUIRED');
 }finally{await app.close()}
});
test('D12: reviewer cookie cannot change synthetic subscription by role spoofing',async()=>{
 const app=await startOfflineDemo({testReviewSessions:true});
 try{
  const owner=await (await fetch(app.url+'/demo/session')).json();
  const target=app.url+'/api/demo/subscription';
  const reviewer=await fetch(target,{headers:{cookie:app.testReviewerCookie}});
  assert.equal(reviewer.status,404);
  const forbidden=await fetch(target+'/actions/start',{method:'POST',
    headers:{cookie:app.testReviewerCookie,
      'content-type':'application/json','x-csrf-token':owner.csrfToken},
    body:JSON.stringify({expectedVersion:1,eventId:'REVIEWER'})});
  assert.equal(forbidden.status,404);
  const ownerRead=await (await fetch(target)).json();
  assert.equal(ownerRead.subscription.state,'NOT_STARTED');
 }finally{await app.close()}
});
test('D12: failure, cancellation and recovery HTTP transitions are disjoint',async()=>{
 const app=await startOfflineDemo();
 try{
  const s=await (await fetch(app.url+'/demo/session')).json();
  const url=app.url+'/api/demo/subscription';
  const post=(action,version,id)=>fetch(url+'/actions/'+action,{
    method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrfToken},
    body:JSON.stringify({expectedVersion:version,eventId:id})});
  assert.equal((await post('recover',1,'INVALID')).status,409);
  assert.equal((await post('start',1,'A1')).status,200);
  assert.equal((await post('fail',2,'A2')).status,200);
  const fail=(await (await fetch(url)).json()).subscription;
  assert.equal(fail.state,'RECOVERY_REQUIRED');
  assert.equal(fail.paymentEvidence,'NOT_VERIFIED');
  assert.equal((await post('recover',3,'A3')).status,200);
  assert.equal((await post('cancel',4,'A4')).status,200);
  assert.equal((await post('recover',5,'A5')).status,409);
  assert.equal((await post('start',5,'A6')).status,409);
  assert.equal((await (await fetch(url)).json()).subscription.state,'CANCELLED');
 }finally{await app.close()}
});
