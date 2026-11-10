// Security regression: a session lookup must not authenticate a stale
// SQLite row after logout or CSRF rotation while membership lookup awaits.
// All fixtures are local, synthetic and network-free.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHostVerifiedSessionStore}
 from '../src/host_verified_session_store.mjs';

const origin='https://checkout.example.org';
const issuer='https://idp.example.org';
const audience='worknova-stale-row-test';
const now=1_780_000_000_000;
const member=Object.freeze({
 actorId:'buyer1',merchantId:'merchant1',role:'buyer',
 active:true,revision:1
});
async function fixture(run){
 const dir=mkdtempSync(join(tmpdir(),'worknova-async-session-'));
 let store;
 let gate=null;
 try{
  store=createHostVerifiedSessionStore({
   filename:join(dir,'sessions.sqlite'),
   expectedOrigin:origin,trustedIssuer:issuer,trustedAudience:audience,
   now:()=>now,
   verifyExternalIdentity:async proof=>({
    verified:true,issuer,audience,subject:'external-buyer',
    assertionId:proof.id,authenticatedAtMs:now
   }),
   lookupExternalAccount:async()=>({
    actorId:member.actorId,merchantId:member.merchantId
   }),
   getMembership:async()=>{
    const held=gate;
    if(held){
     gate=null;
     held.enter();
     await held.release;
    }
    return member;
   }
  });
  function pauseNextMembership(){
   let enter,release;
   const entered=new Promise(resolve=>{enter=resolve});
   const hold=new Promise(resolve=>{release=resolve});
   gate={enter,release:hold};
   return {entered,resume:release};
  }
  const issued=await store.establish({
   id:'UNIQUE_SYNTHETIC_ASSERTION_01'
  });
  const cookie=issued.setCookie.split(';')[0];
  const get=new Request(origin+'/api/auth/oidc/session',{headers:{cookie}});
  const post=(csrf=issued.csrfToken)=>new Request(origin+'/api/auth/oidc/csrf',{
   method:'POST',headers:{cookie,origin,'x-csrf-token':csrf}
  });
  await run({store,issued,get,post,pauseNextMembership});
 }finally{
  try{store?.close()}catch{}
  rmSync(dir,{recursive:true,force:true});
 }
}

test('logout during an awaited membership lookup never authenticates its old session',()=>fixture(async({
 store,get,post,pauseNextMembership
})=>{
 assert.equal((await store.resolveRequest(get)).verified,true);
 const paused=pauseNextMembership();
 const pending=store.resolveRequest(get);
 await paused.entered;
 assert.equal((await store.revokeRequest(post())).revoked,true);
 paused.resume();
 assert.equal(await pending,null);
 assert.equal(await store.resolveRequest(get),null);
}));

test('CSRF rotation during an awaited membership lookup invalidates old write capability',()=>fixture(async({
 store,issued,post,pauseNextMembership
})=>{
 assert.equal((await store.resolveForGateway(post())).verified,true);
 const paused=pauseNextMembership();
 const oldWrite=store.resolveForGateway(post());
 await paused.entered;
 const rotated=await store.rotateCsrf(post());
 assert.match(rotated.csrfToken,/^[A-Za-z0-9_-]{43}$/);
 assert.notEqual(rotated.csrfToken,issued.csrfToken);
 paused.resume();
 assert.equal(await oldWrite,null);
 assert.equal(await store.resolveForGateway(post()),null);
 const fresh=await store.resolveForGateway(post(rotated.csrfToken));
 assert.equal(fresh.verified,true);
 assert.equal(fresh.csrfToken,rotated.csrfToken);
}));

test('binding awaits during permission revocation: stale session cannot resolve',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'worknova-binding-membership-race-'));
 let store;
 let currentMember={...member};
 let bindingGate=null;
 try{
  store=createHostVerifiedSessionStore({
   filename:join(dir,'sessions.sqlite'),expectedOrigin:origin,
   trustedIssuer:issuer,trustedAudience:audience,now:()=>now,
   verifyExternalIdentity:async proof=>({
    verified:true,issuer,audience,subject:'external-buyer',
    assertionId:proof.id,authenticatedAtMs:now
   }),
   lookupExternalAccount:async()=>({
    actorId:member.actorId,merchantId:member.merchantId
   }),
   getMembership:async()=>({...currentMember}),
   isAccountBindingActive:async()=>{
    const paused=bindingGate;
    if(paused){bindingGate=null;paused.enter();await paused.hold}
    return true; // Previously validated subject binding; membership has changed.
   }
  });
  const issued=await store.establish({id:'ASYNC_MEMBERSHIP_RACE_01'});
  const req=new Request(origin+'/api/auth/oidc/session',{
   headers:{cookie:issued.setCookie.split(';')[0]}
  });
  assert.equal((await store.resolveRequest(req)).verified,true);
  let enter,release;
  const entered=new Promise(resolve=>{enter=resolve});
  const hold=new Promise(resolve=>{release=resolve});
  bindingGate={enter,hold};
  const pending=store.resolveRequest(req);
  await entered;
  currentMember={...member,active:false,revision:2};
  release();
  assert.equal(await pending,null);
  assert.equal(await store.resolveRequest(req),null);
 }finally{store?.close();rmSync(dir,{recursive:true,force:true})}
});

test('final subject binding lookup awaits while membership revoked: no new cookie',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'worknova-session-issuance-race-'));
 let store,currentMember={...member};
 let bindingCalls=0,enter,release;
 const entered=new Promise(resolve=>{enter=resolve});
 const hold=new Promise(resolve=>{release=resolve});
 try{
  store=createHostVerifiedSessionStore({
   filename:join(dir,'sessions.sqlite'),expectedOrigin:origin,
   trustedIssuer:issuer,trustedAudience:audience,now:()=>now,
   verifyExternalIdentity:async proof=>({
    verified:true,issuer,audience,subject:'external-buyer',
    assertionId:proof.id,authenticatedAtMs:now
   }),
   lookupExternalAccount:async()=>{
    if(++bindingCalls===2){enter();await hold}
    return {actorId:member.actorId,merchantId:member.merchantId};
   },
   getMembership:async()=>({...currentMember})
  });
  const pending=store.establish({id:'ASYNC_MEMBERSHIP_ISSUE_RACE_01'});
  await entered;
  currentMember={...member,active:false,revision:2};
  release();
  await assert.rejects(pending,{code:'HOST_CURRENT_MEMBERSHIP_REQUIRED'});
  assert.equal(bindingCalls,2);
  // The denied callback must not consume its assertion or mint any bearer.
  currentMember={...member};
  const issued=await store.establish({id:'ASYNC_MEMBERSHIP_ISSUE_RACE_01'});
  assert.equal(issued.paymentAuthorized,false);
 }finally{store?.close();rmSync(dir,{recursive:true,force:true})}
});
