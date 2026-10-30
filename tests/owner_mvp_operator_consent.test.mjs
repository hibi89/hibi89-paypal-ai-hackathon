import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnerMvpOperatorConsent} from '../src/owner_mvp_operator_consent.mjs';
const create=({fast=false,answer=()=>true}={})=>{
 const asked=[];
 const gate=createOwnerMvpOperatorConsent({fast,confirm:async(p,message)=>{
  asked.push({phrase:p,message});return answer(p,message);
 }});
 return {gate,asked,phrases:()=>asked.map(p=>p.phrase)};
};
const QUOTE={action:'APPROVE_SYNTHETIC_USD_1_50',selectedProfileId:'synthetic-web',missingSkills:['qa']};
const SESSION={action:'ISSUE_OWNER_SANDBOX_CHECKOUT_SESSION'};
test('fast path: one explicit consent covers tunnel and only its two read-only probes',async()=>{
 const x=create({fast:true});
 assert.equal(await x.gate.authorizeTunnel(),true);
 assert.equal(await x.gate.authorizeProbe(),true);
 assert.deepEqual(x.phrases(),['OPEN TEMP HTTPS TUNNEL']);
 assert.match(x.asked[0].message,/two read-only HTTPS reachability probes/);
 assert.equal(await x.gate.authorizeProbe(),true);
 assert.deepEqual(x.phrases(),['OPEN TEMP HTTPS TUNNEL','PROBE OWNER HTTPS CALLBACK']);
});
test('fast path: session only inherits prior explicit quote+session consent once',async()=>{
 const x=create({fast:true});
 assert.equal(await x.gate.authorizeStage(QUOTE),true);
 assert.match(x.asked[0].message,/15-minute local checkout session/);
 assert.equal(await x.gate.authorizeStage(SESSION),true);
 assert.deepEqual(x.phrases(),['APPROVE USD 1.50']);
 assert.equal(await x.gate.authorizeStage(SESSION),true);
 assert.deepEqual(x.phrases(),['APPROVE USD 1.50','ISSUE SANDBOX SESSION']);
});
test('declined quote does not authorize session, and declined tunnel does not authorize probe',async()=>{
 const x=create({fast:true,answer:p=>!['OPEN TEMP HTTPS TUNNEL','APPROVE USD 1.50'].includes(p)});
 assert.equal(await x.gate.authorizeTunnel(),false);
 assert.equal(await x.gate.authorizeProbe(),true);
 assert.equal(await x.gate.authorizeStage(QUOTE),false);
 assert.equal(await x.gate.authorizeStage(SESSION),true);
 assert.deepEqual(x.phrases(),['OPEN TEMP HTTPS TUNNEL','PROBE OWNER HTTPS CALLBACK','APPROVE USD 1.50','ISSUE SANDBOX SESSION']);
});
test('fast mode never shortcuts Gemini request or PayPal CREATE / Capture POST',async()=>{
 const x=create({fast:true});
 await x.gate.authorizeTunnel();await x.gate.authorizeProbe();
 await x.gate.authorizeStage(QUOTE);await x.gate.authorizeStage(SESSION);
 const actions=[{action:'GEMINI_SKILL_CLASSIFICATION_ONCE'},
  {operation:'CREATE_SANDBOX_ORDER'},{operation:'CAPTURE_SANDBOX_ORDER'}];
 for(const action of actions)assert.equal(await x.gate.authorizeStage(action),true);
 assert.deepEqual(x.phrases().slice(-3),['SEND SYNTHETIC GEMINI','CREATE SANDBOX ORDER','CAPTURE SANDBOX USD 1.50']);
 assert.equal(await x.gate.authorizeStage({operation:'LIVE_PAYMENT'}),false);
 assert.equal(x.gate.providerPostAuthorizedByShortcut,false);
});
test('default mode retains existing per-stage approvals without changes',async()=>{
 const x=create();
 await x.gate.authorizeTunnel();await x.gate.authorizeProbe();
 await x.gate.authorizeStage(QUOTE);await x.gate.authorizeStage(SESSION);
 assert.deepEqual(x.phrases(),['OPEN TEMP HTTPS TUNNEL','PROBE OWNER HTTPS CALLBACK',
  'APPROVE USD 1.50','ISSUE SANDBOX SESSION']);
});
test('consent gate rejects invalid configuration',()=>{
 assert.throws(()=>createOwnerMvpOperatorConsent({}),{code:'MVP_CONSENT_CONFIGURATION_REQUIRED'});
 assert.throws(()=>createOwnerMvpOperatorConsent({confirm:()=>true,fast:'yes'}),{code:'MVP_CONSENT_CONFIGURATION_REQUIRED'});
});
