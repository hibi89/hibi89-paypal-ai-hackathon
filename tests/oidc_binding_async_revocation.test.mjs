// Fail-closed OIDC binding and session creation during asynchronous revocation.
// Uses local SQLite and injected synthetic identity; zero provider network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createPreprovisionedOidcAccountBindings}
 from '../src/preprovisioned_oidc_account_bindings.mjs';
import {createHostVerifiedSessionStore}
 from '../src/host_verified_session_store.mjs';

const issuer='https://accounts.example.org';
const origin='https://checkout.example.org';
const actorId='buyerA',merchantId='tenantA',subject='fictional-subject-A';
const member=Object.freeze({actorId,merchantId,role:'buyer',active:true,revision:1});
const time=1780000000000;
const makeGate=()=>{
 let enter,resume;
 const entered=new Promise(resolve=>{enter=resolve});
 const held=new Promise(resolve=>{resume=resolve});
 return {entered,resume,hold:async()=>{enter();await held}};
};
async function withPrivateDir(fn){
 const dir=mkdtempSync(join(tmpdir(),'worknova-oidc-revoke-'));
 try{await fn(dir)}finally{rmSync(dir,{recursive:true,force:true})}
}

test('revoke subject while binding membership is awaited: no stale active mapping',()=>
 withPrivateDir(async dir=>{
  let gate=null;
  const bindings=createPreprovisionedOidcAccountBindings({
   filename:join(dir,'bindings.sqlite'),issuer,subjectPepper:randomBytes(32),
   now:()=>time,authorizeOperatorProvisioning:()=>true,
   getMembership:async()=>{if(gate){const held=gate;gate=null;await held.hold()}return member}
  });
  try{
   assert.equal((await bindings.provision({subject,actorId,merchantId})).provisioned,true);
   const pause=makeGate();
   gate=pause;
   const pending=bindings.lookupExternalAccount({issuer,subject});
   await pause.entered;
   assert.equal((await bindings.revoke({subject})).revoked,true);
   pause.resume();
   assert.equal(await pending,null);
   assert.equal(bindings.isAccountActive({actorId,merchantId}),false);
   assert.equal(await bindings.lookupExternalAccount({issuer,subject}),null);
  }finally{bindings.close()}
 })
);

test('revoke subject while host session membership is awaited: no new bearer inserted',()=>
 withPrivateDir(async dir=>{
  const bindings=createPreprovisionedOidcAccountBindings({
   filename:join(dir,'bindings.sqlite'),issuer,subjectPepper:randomBytes(32),
   now:()=>time,authorizeOperatorProvisioning:()=>true,
   getMembership:async()=>member
  });
  let sessions;
  const dbFile=join(dir,'sessions.sqlite');
  let gate=null;
  try{
   await bindings.provision({subject,actorId,merchantId});
   sessions=createHostVerifiedSessionStore({
    filename:dbFile,expectedOrigin:origin,trustedIssuer:issuer,
    trustedAudience:'worknova-binding-race',now:()=>time,
    verifyExternalIdentity:async()=>({verified:true,issuer,
     audience:'worknova-binding-race',subject,
     assertionId:'OFFLINE_ASSERTION_1234567890',authenticatedAtMs:time}),
    lookupExternalAccount:bindings.lookupExternalAccount,
    getMembership:async()=>{if(gate){const held=gate;gate=null;await held.hold()}return member},
    isAccountBindingActive:bindings.isAccountActive
   });
   const pause=makeGate();
   gate=pause;
   const pending=sessions.establish({synthetic:true});
   await pause.entered;
   await bindings.revoke({subject});
   pause.resume();
   await assert.rejects(pending,{code:'HOST_PREPROVISIONED_ACCOUNT_REQUIRED'});
   const db=new DatabaseSync(dbFile,{readOnly:true});
   try{
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM host_verified_sessions').get().n,0);
   }finally{db.close()}
  }finally{sessions?.close();bindings.close()}
 })
);
