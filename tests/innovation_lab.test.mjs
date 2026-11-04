import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createInnovationLab,negotiateA2A,findGift,saveChurnOffer,prepareInvoiceDispute} from '../src/innovation_lab.mjs';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';
const actor='synthetic-owner',merchant='synthetic-merchant';
test('all five independent engines have safe reproducible offline output',()=>{
 const a=negotiateA2A(30000);
 assert.equal(a.agreedMinor,29900);
 assert.deepEqual(a.messages.map(x=>x.action),['OFFER','COUNTER','COUNTER','ACCEPT','ACCEPT']);
 assert.equal(negotiateA2A(20000).status,'NO_AGREEMENT');
 assert.equal(findGift(3900).selected.id,'desk-light-b');
 assert.equal(findGift(200).status,'NO_ELIGIBLE_GIFT');
 assert.equal(saveChurnOffer().paypalPlanChanged,false);
 assert.equal(prepareInvoiceDispute().paypalInvoiceCreated,false);
});
test('delegations use durable atomic single-use claims, expiry, and replay protection',()=>{
 const folder=mkdtempSync(join(tmpdir(),'paypal-innovation-'));
 const filename=join(folder,'lab.sqlite');
 let now=1000000,store;
 try{
  store=createInnovationLab({filename,now:()=>now});
  const grant=store.delegate({actor,merchant,key:'c1',category:'services',maxMinor:30000,expiresInMinutes:1});
  assert.equal(grant.status,'SYNTHETIC_CONSENT_CREATED');
  assert.equal(store.delegate({actor,merchant,key:'c1',category:'services',maxMinor:30000,expiresInMinutes:1}).consentId,grant.consentId);
  assert.throws(()=>store.delegate({actor,merchant,key:'c1',category:'gifts',maxMinor:30000,expiresInMinutes:1}),e=>e.code==='REPLAY_CONFLICT');
  assert.throws(()=>store.trade({actor,merchant,key:'wrong',consentId:grant.consentId,kind:'gift'}),e=>e.code==='DELEGATION_SCOPE_DENIED');
  const trade=store.trade({actor,merchant,key:'t1',kind:'a2a',consentId:grant.consentId});
  assert.equal(trade.reservedMinor,29900);
  assert.equal(trade.paymentAuthorized,false);
  assert.equal(store.trade({actor,merchant,key:'t1',kind:'a2a',consentId:grant.consentId}).replayed,true);
  assert.throws(()=>store.trade({actor,merchant,key:'t2',kind:'a2a',consentId:grant.consentId}),e=>e.code==='DELEGATION_ALREADY_SPENT');
  store.close();store=createInnovationLab({filename,now:()=>now});
  assert.equal(store.state({actor,merchant}).events.length,2);
  assert.equal(store.trade({actor,merchant,key:'t1',kind:'a2a',consentId:grant.consentId}).replayed,true);
  const exp=store.delegate({actor,merchant,key:'c2',category:'services',maxMinor:30000,expiresInMinutes:1});
  now+=60001;
  assert.throws(()=>store.trade({actor,merchant,key:'t3',kind:'a2a',consentId:exp.consentId}),e=>e.code==='DELEGATION_EXPIRED');
 }finally{store?.close();rmSync(folder,{recursive:true,force:true});}
});
test('actual loopback Part 2 API and dashboard isolate roles, CSRF and provider actions',async()=>{
 const app=await startOfflineDemo({testReviewSessions:true});
 const path=app.url+'/api/demo/innovation/';
 const post=(which,data,csrf='',cookie='')=>fetch(path+which,{method:'POST',
  headers:{'content-type':'application/json',origin:app.url,'x-csrf-token':csrf,...(cookie?{cookie}:{})},
  body:JSON.stringify(data)});
 try{
  assert.equal((await fetch(app.url+'/demo/innovation')).status,200);
  const html=await(await fetch(app.url+'/demo/innovation')).text();
  for(const word of ['Agent-to-Agent','Delegate & Consent','Gift Finder','Churn Saver','Invoice / Dispute'])
   assert.ok(html.includes(word),word);
  assert.equal((await fetch(app.url+'/demo/innovation.js')).status,200);
  const session=await(await fetch(app.url+'/demo/session')).json();
  const request={idempotencyKey:'c1',category:'services',maxMinor:30000,expiresInMinutes:30};
  assert.equal((await post('delegate',request)).status,403);
  assert.equal((await fetch(path+'state',{headers:{cookie:app.testReviewerCookie}})).status,403);
  const consent=await post('delegate',request,session.csrfToken);
  assert.equal(consent.status,201);
  const id=(await consent.json()).consentId;
  const deal=await post('a2a',{idempotencyKey:'t1',consentId:id},session.csrfToken);
  assert.equal(deal.status,200);
  assert.equal((await deal.json()).paymentAuthorized,false);
  assert.equal((await post('a2a',{idempotencyKey:'t2',consentId:id},session.csrfToken)).status,409);
  assert.equal((await post('gift',{idempotencyKey:'g1',consentId:id},session.csrfToken)).status,403);
  const giftGrant=await post('delegate',{idempotencyKey:'c2',category:'gifts',maxMinor:3900,expiresInMinutes:30},session.csrfToken);
  assert.equal(giftGrant.status,201);
  const gid=(await giftGrant.json()).consentId;
  const gift=await post('gift',{idempotencyKey:'g2',consentId:gid},session.csrfToken);
  assert.equal((await gift.json()).selected.id,'desk-light-b');
  assert.equal((await post('churn',{idempotencyKey:'ch1'},session.csrfToken)).status,200);
  assert.equal((await post('invoice',{idempotencyKey:'in1'},session.csrfToken)).status,200);
  const a=await(await fetch(path+'state')).json();
  await fetch(path+'state');await fetch(path+'state');
  assert.deepEqual(await(await fetch(path+'state')).json(),a);
  assert.equal(a.events.length,6);
  assert.equal(a.providerCalls,0);
  assert.equal((await fetch(path+'gift')).status,405);
  assert.equal((await post('a2a',{idempotencyKey:'spoof',consentId:id,actorId:'synthetic-reviewer'},session.csrfToken)).status,400);
 }finally{await app.close();}
});
