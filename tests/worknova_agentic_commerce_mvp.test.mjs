import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommerceEngine,simulateBoundedAgreement} from '../src/worknova_agentic_commerce_mvp.mjs';
import {startCommerceControlPlane} from '../scripts/run_commerce_control_plane.mjs';

test('true five-stage offline lifecycle and financial claims stay disabled',()=>{
 const e=createCommerceEngine();try{
   for(const [i,a] of ['grant','negotiate','verify','license','review'].entries()){
     const r=e.step(a); assert.equal(r.status,200);assert.equal(r.step,i+1);
     assert.equal(r.paypalProviderCalls,0); assert.equal(r.realPayments,0);
     assert.equal(r.escrowCreated,false);assert.equal(r.genuinePayPalAuthorization,false);
   }
   assert.equal(e.get().reservedMinor,46000);
   assert.equal(e.get().remainingMinor,4000);
   assert.equal(e.get().events.length,5);
   assert.equal(e.get().gate.status,'HUMAN_PROVIDER_AUTH_REQUIRED');
 }finally{e.close();}
});
test('replay is idempotent and does not duplicate budget holds',()=>{
 const e=createCommerceEngine();try{e.step('grant');e.step('negotiate');e.step('negotiate'); assert.equal(e.get().reservedMinor,30000);assert.equal(e.get().events.length,2)}finally{e.close()}
});
test('unapproved step order fails without mutation',()=>{
 const e=createCommerceEngine();try{const r=e.step('license'); assert.equal(r.status,409);assert.equal(e.get().step,0)}finally{e.close()}
});
test('over-budget delegated agent attempt is blocked and not billed',()=>{
 const e=createCommerceEngine();try{e.step('grant');const r=e.step('unsafe');assert.equal(r.error,'GUARDRAIL_BLOCKED');assert.equal(e.get().reservedMinor,0)}finally{e.close()}
});
test('expired mandate fails closed',()=>{
 let now=1000;const e=createCommerceEngine({now:()=>now});try{e.step('grant');now+=900001;assert.equal(e.step('negotiate').error,'MANDATE_NOT_ACTIVE');assert.equal(e.get().step,1)}finally{e.close()}
});
test('reset returns to synthetic no-authority state',()=>{
 const e=createCommerceEngine();try{e.step('grant');e.step('negotiate');e.step('reset');assert.equal(e.get().step,0);assert.equal(e.get().mandate,null);assert.equal(e.get().reservedMinor,0)}finally{e.close()}
});
test('actual localhost server enforces origin and csrf and exposes runnable simulation',async()=>{
 const app=await startCommerceControlPlane();try{
  const state=await (await fetch(app.url+'/api/state')).json();assert.match(state.csrfToken,/^[a-f0-9]{64}$/);
  const blocked=await fetch(app.url+'/api/action',{method:'POST',headers:{'content-type':'application/json','origin':app.url},body:JSON.stringify({action:'grant'})});assert.equal(blocked.status,403);
  const ok=await fetch(app.url+'/api/action',{method:'POST',headers:{'content-type':'application/json','origin':app.url,'x-csrf-token':state.csrfToken},body:JSON.stringify({action:'grant'})});assert.equal(ok.status,200);
  assert.equal((await ok.json()).step,1);
  const page=await (await fetch(app.url)).text();assert.match(page,/WORKNOVA/);assert.match(page,/OFFLINE SIMULATION/);
 }finally{await app.close()}
});

test('bounded negotiation has real policy logic, not unrestricted arbitrary prices',()=>{
 const a=simulateBoundedAgreement({askMinor:36000,buyerCeilingMinor:30000,sellerFloorMinor:30000});
 assert.equal(a.amountMinor,30000);assert.equal(a.transcript.length,3);assert.equal(a.paymentAuthorized,false);
 const b=simulateBoundedAgreement({askMinor:36000,buyerCeilingMinor:20000,sellerFloorMinor:30000});
 assert.equal(b.status,'NO_AGREEMENT');
});
test('revoked delegation blocks any later transaction and is replay-safe',()=>{
 const e=createCommerceEngine();try{e.step('grant');e.step('revoke');e.step('revoke');
 assert.equal(e.get().events.length,2);assert.equal(e.get().mandate.revoked,true);
 assert.equal(e.step('negotiate').error,'MANDATE_NOT_ACTIVE');
 assert.equal(e.get().reservedMinor,0);
 }finally{e.close()}
});

 // A seller must not be recorded as accepting below its explicit floor.
test('seller floor is enforced when its quoted ask contradicts minimum policy',()=>{
 const invalid=simulateBoundedAgreement({askMinor:20000,buyerCeilingMinor:30000,sellerFloorMinor:25000});
 assert.equal(invalid.status,'NO_AGREEMENT');
 assert.equal(invalid.paymentAuthorized,undefined);
 assert.equal(invalid.transcript.some(turn=>turn.action==='ACCEPT'),false);
 const valid=simulateBoundedAgreement({askMinor:26000,buyerCeilingMinor:30000,sellerFloorMinor:25000});
 assert.equal(valid.status,'AGREED_OFFLINE');
 assert.equal(valid.amountMinor,26000);
 assert.ok(valid.amountMinor>=25000);
 assert.equal(valid.paymentAuthorized,false);
});

test('6,859 bounded policy combinations never accept a trade below seller floor',()=>{
 let checked=0,agreed=0;
 for(let ask=500;ask<=5000;ask+=250)
  for(let ceiling=500;ceiling<=5000;ceiling+=250)
   for(let floor=500;floor<=5000;floor+=250){
    const result=simulateBoundedAgreement({askMinor:ask,buyerCeilingMinor:ceiling,sellerFloorMinor:floor});
    checked++;
    if(result.status==='AGREED_OFFLINE'){
     agreed++;
     assert.ok(result.amountMinor>=floor);
     assert.ok(result.amountMinor<=ceiling);
     assert.ok(result.amountMinor<=ask);
     assert.equal(result.paymentAuthorized,false);
    }else{
     assert.equal(result.status,'NO_AGREEMENT');
     assert.equal(result.transcript.some(turn=>turn.action==='ACCEPT'),false);
    }
   }
 assert.equal(checked,6859);
 assert.equal(agreed,2470);
});

test('readiness is invalidated immediately by expiration without modifying audited trade history',()=>{
 let now=10000;const e=createCommerceEngine({now:()=>now});try{
  for(const a of ['grant','negotiate','verify','license','review'])assert.equal(e.step(a).status,200);
  const before=e.get();assert.equal(before.mandateStatus,'ACTIVE');
  assert.equal(before.humanReviewReady,true);assert.equal(before.reservedMinor,46000);
  const historicalGate=before.gate.policyDigest;
  now=before.mandate.expiresAt;const expired=e.get();
  assert.equal(expired.mandateStatus,'EXPIRED');assert.equal(expired.humanReviewReady,false);
  assert.equal(expired.gate.policyDigest,historicalGate);
  assert.equal(expired.step,5);assert.equal(expired.reservedMinor,46000);
  assert.equal(expired.events.length,5);
  assert.equal(e.step('review').paypalProviderCalls,0);
  assert.equal(e.get().humanReviewReady,false);
 }finally{e.close()}
});
test('revocation after final review removes current readiness while preserving evidence',()=>{
 const e=createCommerceEngine();try{
  assert.equal(e.get().mandateStatus,'NOT_GRANTED');
  assert.equal(e.get().humanReviewReady,false);
  for(const a of ['grant','negotiate','verify','license','review'])assert.equal(e.step(a).status,200);
  const digest=e.get().gate.policyDigest;
  assert.equal(e.get().humanReviewReady,true);
  assert.equal(e.step('revoke').status,200);
  const revoked=e.get();
  assert.equal(revoked.mandateStatus,'REVOKED');assert.equal(revoked.humanReviewReady,false);
  assert.equal(revoked.events.length,6);assert.equal(revoked.reservedMinor,46000);
  assert.equal(revoked.gate.policyDigest,digest);
  assert.equal(revoked.paypalProviderCalls,0);assert.equal(revoked.realPayments,0);
  assert.equal(e.step('license').status,200);
  assert.equal(e.get().humanReviewReady,false);
  assert.equal(e.step('reset').mandateStatus,'NOT_GRANTED');
 }finally{e.close()}
});
