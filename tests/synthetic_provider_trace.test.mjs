import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyInjectedProviderProtocol,validateSyntheticProtocolProof}
  from '../src/synthetic_provider_trace.mjs';
import {runOfflineOperatorMvpSmoke} from '../src/offline_operator_mvp_smoke.mjs';

const consents=[
 'GEMINI_SKILL_CLASSIFICATION_ONCE','APPROVE_SYNTHETIC_USD_1_50',
 'ISSUE_OWNER_SANDBOX_CHECKOUT_SESSION','CREATE_SANDBOX_ORDER',
 'CAPTURE_SANDBOX_ORDER'
];
const fake=()=>({
 consents:[...consents],
 calls:[
  {kind:'FAKE_GEMINI',method:'POST',
   path:'/v1beta/models/gemini-3.5-flash-lite:generateContent'},
  {kind:'FAKE_PAYPAL',method:'POST',path:'/v1/oauth2/token'},
  {kind:'FAKE_PAYPAL',method:'POST',path:'/v2/checkout/orders'},
  {kind:'FAKE_PAYPAL',method:'GET',path:'/v2/checkout/orders/FICTIONALORDER1',
   observedStatus:'PAYER_ACTION_REQUIRED'},
  {kind:'FAKE_PAYPAL',method:'GET',path:'/v2/checkout/orders/FICTIONALORDER1',
   observedStatus:'APPROVED'},
  {kind:'FAKE_PAYPAL',method:'POST',
   path:'/v2/checkout/orders/FICTIONALORDER1/capture'},
  {kind:'FAKE_PAYPAL',method:'GET',path:'/v2/checkout/orders/FICTIONALORDER1',
   observedStatus:'COMPLETED'}
 ]
});

test('injected fake API record yields only bounded symbolic stages and exact human approvals',()=>{
 const proof=verifyInjectedProviderProtocol(fake());
 assert.equal(proof.status,'INJECTED_FAKE_PROTOCOL_SEQUENCE_VERIFIED');
 assert.equal(validateSyntheticProtocolProof(proof),true);
 assert.equal(proof.fakeGeminiPosts,1);
 assert.equal(proof.fakePayPalOrderCreatePosts,1);
 assert.equal(proof.fakePayPalOrderCapturePosts,1);
 assert.equal(proof.actualProviderCalls,0);
 assert.deepEqual(proof.humanConsentStages,consents);
 const result=JSON.stringify(proof);
 assert.doesNotMatch(result,/FICTIONALORDER1|api-m\.sandbox\.paypal\.com|checkoutnow|PayerID|Bearer /);
});

test('capture before buyer-approved GET or missing completed GET is rejected',()=>{
 const input=fake();
 const idx=input.calls.findIndex(x=>x.method==='POST'&&x.path.endsWith('/capture'));
 input.calls.splice(idx,1);
 input.calls.splice(3,0,{kind:'FAKE_PAYPAL',method:'POST',
   path:'/v2/checkout/orders/FICTIONALORDER1/capture'});
 assert.throws(()=>verifyInjectedProviderProtocol(input),/FAKE_PROTOCOL_/);
 const other=fake();
 other.calls.at(-1).observedStatus='APPROVED';
 assert.throws(()=>verifyInjectedProviderProtocol(other),/FAKE_PROTOCOL_/);
});

test('missing, reordered or invented human approval is rejected',()=>{
 for(const consentsBad of [
   consents.slice(0,4),[...consents].reverse(),
   [...consents.slice(0,4),'AUTOMATIC_CAPTURE'],
   ['REAL_PROVIDER_APPROVED',...consents.slice(1)]
 ]){
  assert.throws(()=>verifyInjectedProviderProtocol({...fake(),consents:consentsBad}),
    /FAKE_PROTOCOL_HUMAN_CONSENT_SEQUENCE/);
 }
});

test('unknown endpoint and malicious paths cannot be printed as proof',()=>{
 const input=fake();
 input.calls[2].path='https://api-m.paypal.com/v2/checkout/orders';
 assert.throws(()=>verifyInjectedProviderProtocol(input),/FAKE_PROTOCOL_/);
 const x=fake();x.calls[3].path='/v2/checkout/orders/../../private';
 assert.throws(()=>verifyInjectedProviderProtocol(x),/FAKE_PROTOCOL_/);
 const real=fake();real.calls[0].kind='REAL_GEMINI';
 assert.throws(()=>verifyInjectedProviderProtocol(real),/FAKE_PROTOCOL_/);
});

test('tampered public proof summary fails even if status label claims verification',()=>{
 const proof=verifyInjectedProviderProtocol(fake());
 for(const altered of [
  {...proof,actualProviderCalls:1},
  {...proof,privateIdentifiersIncluded:true},
  {...proof,humanConsentStages:['AUTO_APPROVAL']},
  {...proof,fakePayPalOrderCapturePosts:2},
  {...proof,stageSequence:[...proof.stageSequence].reverse()},
  {...proof,stageSequence:[...proof.stageSequence,'NOT_ALLOWED_REMOTE_CALL']}
 ]){
  assert.throws(()=>validateSyntheticProtocolProof(altered),/FAKE_PROTOCOL_/);
 }
});

test('actual offline owner orchestrator emits validated fake API and no external provider receipt',async()=>{
 const observed=await runOfflineOperatorMvpSmoke();
 assert.equal(validateSyntheticProtocolProof(observed.fakeProviderProtocol),true);
 assert.equal(observed.realGeminiCalls,0);
 assert.equal(observed.realPayPalCalls,0);
 assert.equal(observed.realPaymentCaptured,false);
 assert.equal(observed.fakeProviderProtocol.fakePaypalGetObservations.buyerPending>0,true);
 assert.equal(observed.fakeProviderProtocol.fakePaypalGetObservations.buyerApproved>0,true);
 assert.equal(observed.fakeProviderProtocol.fakePaypalGetObservations.capturedCompleted>0,true);
});
