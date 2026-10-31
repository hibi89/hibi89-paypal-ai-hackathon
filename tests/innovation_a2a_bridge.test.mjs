import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createInnovationLab} from '../src/innovation_lab.mjs';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';
const actor='synthetic-owner',merchant='synthetic-merchant';
const tmp=agentsFactory=>{
 const folder=mkdtempSync(join(tmpdir(),'paypal-a2a-')),filename=join(folder,'lab.sqlite');
 return {folder,filename,store:createInnovationLab({filename,agentsFactory})};
};
const mandate=store=>store.delegate({actor,merchant,key:'grant-1',category:'services',
 maxMinor:30000,expiresInMinutes:20}).consentId;
test('HTTP Part 2 A2A returns auditable two-agent protocol without provider calls',async()=>{
 const app=await startOfflineDemo();
 try{
  const session=await(await fetch(app.url+'/demo/session')).json();
  const post=(route,body)=>fetch(app.url+'/api/demo/innovation/'+route,{method:'POST',
   headers:{'content-type':'application/json',origin:app.url,'x-csrf-token':session.csrfToken},body:JSON.stringify(body)});
  const id=(await(await post('delegate',{idempotencyKey:'c1',category:'services',maxMinor:30000,
   expiresInMinutes:20})).json()).consentId;
  const r=await(await post('a2a',{consentId:id,idempotencyKey:'one'})).json();
  assert.equal(r.status,'SYNTHETIC_AGREEMENT');
  assert.equal(r.protocolStatus,'AGREED_OFFLINE_CONTRACT');
  assert.equal(r.agreedMinor,29900);
  assert.deepEqual(r.messages.map(m=>m.action),['OFFER','COUNTER','COUNTER','ACCEPT']);
  assert.match(r.transcriptSha256,/^[a-f0-9]{64}$/);
  assert.equal(r.paymentAuthorized,false);
  assert.equal(r.providerCalls,0);
  assert.equal((await(await post('a2a',{consentId:id,idempotencyKey:'one'})).json()).replayed,true);
  assert.equal((await post('a2a',{consentId:id,idempotencyKey:'another'})).status,409);
  const state=await(await fetch(app.url+'/api/demo/innovation/state')).json();
  assert.equal(state.events.filter(e=>e.kind==='a2a').length,1);
  assert.equal(state.consents[0].usedMinor,29900);
  assert.equal(state.pendingAttempts.length,0);
 }finally{await app.close();}
});
test('two concurrent requests never run duplicate role agents; reopened connection sees claim',async()=>{
 let resolve,entered;
 const wait=new Promise(r=>{resolve=r}),started=new Promise(r=>{entered=r});
 let calls=0,reopened;
 const x=tmp(()=>({
  sellerAgent:async()=>{calls++;entered();await wait;return {action:'OFFER',amountMinor:29900}},
  buyerAgent:async()=>({action:'ACCEPT',amountMinor:29900})
 }));
 try{
  const id=mandate(x.store);
  const running=x.store.a2a({actor,merchant,key:'once',consentId:id});
  await started;
  assert.equal(x.store.state({actor,merchant}).pendingAttempts.length,1);
  await assert.rejects(()=>x.store.a2a({actor,merchant,key:'once',consentId:id}),
   e=>e.code==='A2A_PENDING_OR_UNKNOWN');
  await assert.rejects(()=>x.store.a2a({actor,merchant,key:'another',consentId:id}),
   e=>e.code==='DELEGATION_ALREADY_CLAIMED');
  reopened=createInnovationLab({filename:x.filename});
  assert.equal(reopened.state({actor,merchant}).pendingAttempts.length,1);
  await assert.rejects(()=>reopened.a2a({actor,merchant,key:'once',consentId:id}),
   e=>e.code==='A2A_PENDING_OR_UNKNOWN');
  assert.equal(calls,1);
  resolve();
  assert.equal((await running).status,'SYNTHETIC_AGREEMENT');
  assert.equal((await reopened.a2a({actor,merchant,key:'once',consentId:id})).replayed,true);
 }finally{resolve?.();reopened?.close();x.store.close();rmSync(x.folder,{recursive:true,force:true});}
});
test('revoke during an asynchronous offer makes the final result fail closed',async()=>{
 let release,entered;
 const wait=new Promise(r=>{release=r}),started=new Promise(r=>{entered=r});
 const x=tmp(()=>({
  sellerAgent:async()=>{entered();await wait;return {action:'OFFER',amountMinor:29900}},
  buyerAgent:async()=>({action:'ACCEPT',amountMinor:29900})
 }));
 try{
  const id=mandate(x.store);
  const run=x.store.a2a({actor,merchant,key:'one',consentId:id});
  await started;
  assert.equal(x.store.revoke({actor,merchant,key:'rev1',consentId:id}).status,'DELEGATION_REVOKED');
  release();
  const done=await run;
  assert.equal(done.status,'BLOCKED_DELEGATION_CHANGED');
  assert.equal(done.reservedMinor,0);
  assert.equal(done.paymentAuthorized,false);
  assert.equal(x.store.state({actor,merchant}).consents[0].usedMinor,0);
  assert.equal((await x.store.a2a({actor,merchant,key:'one',consentId:id})).replayed,true);
 }finally{release?.();x.store.close();rmSync(x.folder,{recursive:true,force:true});}
});
test('malicious role output never grants payment or consumes delegation',async()=>{
 const x=tmp(()=>({
  sellerAgent:async()=>({action:'OFFER',amountMinor:29900,authorizePayment:true}),
  buyerAgent:async()=>({action:'ACCEPT',amountMinor:29900})
 }));
 try{
  const id=mandate(x.store);
  const r=await x.store.a2a({actor,merchant,key:'tampered',consentId:id});
  assert.equal(r.status,'BLOCKED');
  assert.equal(r.reason,'INVALID_AGENT_MESSAGE');
  assert.equal(r.reservedMinor,0);
  assert.equal(r.paymentAuthorized,false);
  assert.equal(x.store.state({actor,merchant}).consents[0].usedMinor,0);
  await assert.rejects(()=>x.store.trade({actor,merchant,key:'legacy',kind:'a2a',consentId:id}),
   e=>e.code==='DELEGATION_ALREADY_CLAIMED');
 }finally{x.store.close();rmSync(x.folder,{recursive:true,force:true});}
});
test('owner revoke endpoint requires CSRF and disallows reviewer',async()=>{
 const app=await startOfflineDemo({testReviewSessions:true});
 try{
  const session=await(await fetch(app.url+'/demo/session')).json();
  const post=(route,body,other={})=>fetch(app.url+'/api/demo/innovation/'+route,{method:'POST',
   headers:{'content-type':'application/json',origin:app.url,'x-csrf-token':session.csrfToken,...other},
   body:JSON.stringify(body)});
  const id=(await(await post('delegate',{idempotencyKey:'grant',category:'services',
   maxMinor:30000,expiresInMinutes:20})).json()).consentId;
  assert.equal((await post('revoke',{consentId:id,idempotencyKey:'revoke1'},
   {'x-csrf-token':'invalid'})).status,403);
  assert.equal((await post('revoke',{consentId:id,idempotencyKey:'revoke1'},
   {cookie:app.testReviewerCookie})).status,403);
  assert.equal((await(await post('revoke',{consentId:id,idempotencyKey:'revoke1'})).json()).status,'DELEGATION_REVOKED');
  assert.equal((await post('a2a',{consentId:id,idempotencyKey:'run1'})).status,403);
  assert.equal((await(await fetch(app.url+'/api/demo/innovation/state')).json()).consents[0].active,false);
 }finally{await app.close();}
});
