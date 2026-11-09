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
