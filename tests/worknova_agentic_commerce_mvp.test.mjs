import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommerceEngine,simulateBoundedAgreement,authorizeDelegatedReservation,validateOfflineReviewEvidence} from '../src/worknova_agentic_commerce_mvp.mjs';
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

test('real localhost HTTP API completes five-stage journey then revokes reviewed authority',async()=>{
 const app=await startCommerceControlPlane();try{
  const base=app.url;
  const state=async()=>{const r=await fetch(base+'/api/state');assert.equal(r.status,200);return r.json()};
  const initial=await state();
  assert.equal(initial.mandateStatus,'NOT_GRANTED');
  const post=async(action,token=initial.csrfToken)=>{
   const res=await fetch(base+'/api/action',{method:'POST',headers:{'content-type':'application/json','origin':base,'x-csrf-token':token},body:JSON.stringify({action})});
   return {status:res.status,body:await res.json()};
  };
  for(const [index,action] of ['grant','negotiate','verify','license','review'].entries()){
   const result=await post(action);assert.equal(result.status,200);assert.equal(result.body.step,index+1);
   assert.equal(result.body.paypalProviderCalls,0);
   assert.equal(result.body.realPayments,0);
  }
  const finished=await state();
  assert.equal(finished.humanReviewReady,true);
  assert.equal(finished.mandateStatus,'ACTIVE');
  assert.equal(finished.reservedMinor,46000);
  assert.equal(finished.events.length,5);
  const historical=finished.gate.policyDigest;
  const unauthorized=await post('reset','not-the-csrf-token');
  assert.equal(unauthorized.status,403);
  assert.equal((await state()).step,5);
  const revoked=await post('revoke');
  assert.equal(revoked.status,200);
  assert.equal(revoked.body.mandateStatus,'REVOKED');
  assert.equal(revoked.body.humanReviewReady,false);
  assert.equal(revoked.body.gate.policyDigest,historical);
  assert.equal(revoked.body.reservedMinor,46000);
  assert.equal(revoked.body.paypalProviderCalls,0);
  const refreshed=await state();
  assert.equal(refreshed.humanReviewReady,false);
  assert.equal(refreshed.events.length,6);
  assert.equal((await post('reset')).body.mandateStatus,'NOT_GRANTED');
 }finally{await app.close()}
});


test('delegated budget enforces merchant, category, currency and both amount limits',()=>{
 const mandate={currency:'USD',expiresAt:20000,revoked:false,
  limitMinor:50000,perTradeLimitMinor:30000,
  categories:['AI_SERVICES','SOFTWARE_LICENSE'],
  merchants:['mock-freelancer','mock-software']};
 const base={mandate,category:'AI_SERVICES',merchant:'mock-freelancer',currency:'USD',
  amountMinor:30000,reservedMinor:0,nowMs:1000};
 assert.deepEqual(authorizeDelegatedReservation(base),{ok:true,paymentAuthorized:false});
 const cases=[
  [{category:'EXTERNAL_SERVICE'},'CATEGORY_NOT_ALLOWED'],
  [{merchant:'untrusted-merchant'},'MERCHANT_NOT_ALLOWED'],
  [{currency:'EUR'},'CURRENCY_NOT_ALLOWED'],
  [{amountMinor:30001},'PER_TRADE_CAP_EXCEEDED'],
  [{amountMinor:30000,reservedMinor:21000},'TOTAL_BUDGET_EXCEEDED'],
  [{amountMinor:0},'INVALID_POLICY_AMOUNT'],
  [{amountMinor:-1},'INVALID_POLICY_AMOUNT'],
  [{amountMinor:1.5},'INVALID_POLICY_AMOUNT'],
  [{reservedMinor:50001},'INVALID_POLICY_AMOUNT'],
  [{amountMinor:Number.MAX_SAFE_INTEGER},'PER_TRADE_CAP_EXCEEDED'],
  [{nowMs:20000},'MANDATE_NOT_ACTIVE'],
  [{mandate:{...mandate,revoked:true}},'MANDATE_NOT_ACTIVE'],
  [{mandate:{...mandate,expiresAt:1999},nowMs:2000},'MANDATE_NOT_ACTIVE'],
  [{mandate:{...mandate,merchants:undefined}},'MERCHANT_NOT_ALLOWED'],
  [{mandate:{...mandate,categories:null}},'CATEGORY_NOT_ALLOWED'],
  [{mandate:null},'MANDATE_NOT_ACTIVE'],
  [{mandate:{...mandate,limitMinor:0}},'INVALID_POLICY_AMOUNT'],
  [{mandate:{...mandate,perTradeLimitMinor:NaN}},'INVALID_POLICY_AMOUNT'],
  [{amountMinor:30000,reservedMinor:20000},null],
 ];
 for(const [overrides,reason] of cases){
  const actual=authorizeDelegatedReservation({...base,...overrides});
  if(reason)assert.deepEqual(actual,{ok:false,error:'PAYMENT_GUARD_DENIED',reason});
  else assert.deepEqual(actual,{ok:true,paymentAuthorized:false});
 }
});

test('real SQLite policy cannot reserve against non-allowlisted merchant or category',()=>{
 const folder=mkdtempSync(join(tmpdir(),'worknova-guard-test-'));
 const filename=join(folder,'synthetic.sqlite');
 const e=createCommerceEngine({filename});
 const db=new DatabaseSync(filename);
 try{
  assert.equal(e.step('grant').status,200);
  const mutate=(update)=>{
   const row=JSON.parse(db.prepare('SELECT payload FROM demo_state WHERE id=1').get().payload);
   update(row.mandate);
   db.prepare('UPDATE demo_state SET payload=? WHERE id=1').run(JSON.stringify(row));
  };
  const deny=(action,reason,step,reserved)=>{
   const response=e.step(action);
   assert.equal(response.status,409);
   assert.equal(response.error,'PAYMENT_GUARD_DENIED');
   assert.equal(response.reason,reason);
   const state=e.get();
   assert.equal(state.step,step);assert.equal(state.reservedMinor,reserved);
   assert.equal(state.events.length,step);
   assert.equal(state.paypalProviderCalls,0);
  };
  mutate(p=>p.merchants=[]);
  deny('negotiate','MERCHANT_NOT_ALLOWED',1,0);
  mutate(p=>{p.merchants=['mock-freelancer','mock-software'];p.categories=['SOFTWARE_LICENSE']});
  deny('negotiate','CATEGORY_NOT_ALLOWED',1,0);
  mutate(p=>{p.categories=['AI_SERVICES','SOFTWARE_LICENSE'];p.currency='EUR'});
  deny('negotiate','CURRENCY_NOT_ALLOWED',1,0);
  mutate(p=>p.currency='USD');
  assert.equal(e.step('negotiate').status,200);
  assert.equal(e.step('verify').status,200);
  mutate(p=>p.merchants=['mock-freelancer']);
  deny('license','MERCHANT_NOT_ALLOWED',3,30000);
  mutate(p=>p.merchants=['mock-freelancer','mock-software']);
  assert.equal(e.step('license').status,200);
  assert.equal(e.step('review').status,200);
  assert.equal(e.get().reservedMinor,46000);
  assert.equal(e.get().humanReviewReady,true);
 }finally{db.close();e.close();rmSync(folder,{recursive:true,force:true})}
});


test('unsafe proposal is actually policy-evaluated but never executable',()=>{
 const folder=mkdtempSync(join(tmpdir(),'worknova-probe-test-'));
 const filename=join(folder,'synthetic.sqlite');
 const e=createCommerceEngine({filename});const db=new DatabaseSync(filename);
 try{
  const first=e.step('unsafe');
  assert.equal(first.error,'GUARDRAIL_BLOCKED');
  assert.equal(first.reason,'MANDATE_NOT_ACTIVE');
  assert.equal(first.policyEvaluated,true);
  assert.equal(first.paymentAuthorized,false);
  assert.equal(e.step('grant').status,200);
  const overCap=e.step('unsafe');
  assert.equal(overCap.error,'GUARDRAIL_BLOCKED');
  assert.equal(overCap.reason,'PER_TRADE_CAP_EXCEEDED');
  assert.equal(overCap.policyEvaluated,true);
  assert.equal(e.get().reservedMinor,0);
  const row=JSON.parse(db.prepare('SELECT payload FROM demo_state WHERE id=1').get().payload);
  row.mandate.limitMinor=100000;row.mandate.perTradeLimitMinor=70000;
  db.prepare('UPDATE demo_state SET payload=? WHERE id=1').run(JSON.stringify(row));
  const testOnly=e.step('unsafe');
  assert.equal(testOnly.error,'GUARDRAIL_BLOCKED');
  assert.equal(testOnly.reason,'TEST_PROPOSAL_NOT_EXECUTABLE');
  assert.equal(testOnly.paymentAuthorized,false);
  assert.equal(e.get().reservedMinor,0);
  assert.equal(e.get().events.length,1);
  assert.equal(e.step('revoke').status,200);
  assert.equal(e.step('unsafe').reason,'MANDATE_NOT_ACTIVE');
 }finally{db.close();e.close();rmSync(folder,{recursive:true,force:true})}
});


test('tampered review evidence fails closed on GET without erasing audit history',()=>{
 const folder=mkdtempSync(join(tmpdir(),'worknova-evidence-tamper-'));
 const filename=join(folder,'synthetic.sqlite');
 const e=createCommerceEngine({filename});const db=new DatabaseSync(filename);
 try{
  for(const a of ['grant','negotiate','verify','license','review'])assert.equal(e.step(a).status,200);
  const original=e.get();assert.equal(original.humanReviewReady,true);
  assert.equal(original.evidenceIntegrity,'LOCAL_DIGEST_MATCH');
  const read=()=>JSON.parse(db.prepare('SELECT payload FROM demo_state WHERE id=1').get().payload);
  const write=s=>db.prepare('UPDATE demo_state SET payload=? WHERE id=1').run(JSON.stringify(s));
  const altered=read();altered.delivery.checks[0].result='FAILURE';write(altered);
  const after=e.get();
  assert.equal(after.humanReviewReady,false);
  assert.equal(after.evidenceIntegrity,'LOCAL_REVIEW_HOLD');
  assert.equal(after.evidenceHoldReason,'DELIVERY_EVIDENCE_NOT_CLEAR');
  assert.equal(after.step,5);assert.equal(after.events.length,5);
  assert.equal(after.gate.policyDigest,original.gate.policyDigest);
  assert.equal(after.paypalProviderCalls,0);assert.equal(after.realPayments,0);
  const still=read();assert.equal(still.delivery.checks[0].result,'FAILURE');
  const refund=read();refund.delivery.checks[0].result='SUCCESS';write(refund);
  assert.equal(e.get().humanReviewReady,true);
  const mismatch=read();mismatch.reservedMinor=40000;write(mismatch);
  assert.equal(e.get().evidenceHoldReason,'RESERVATION_LEDGER_MISMATCH');
  assert.equal(e.get().humanReviewReady,false);
  mismatch.reservedMinor=46000;mismatch.gate.policyDigest='0'.repeat(64);write(mismatch);
  assert.equal(e.get().evidenceHoldReason,'EVIDENCE_DIGEST_OR_GATE_MISMATCH');
  assert.equal(e.get().humanReviewReady,false);
 }finally{db.close();e.close();rmSync(folder,{recursive:true,force:true})}
});

test('synthetic delivery-check failure blocks review commit and keeps reservations',()=>{
 const folder=mkdtempSync(join(tmpdir(),'worknova-pre-review-hold-'));
 const filename=join(folder,'synthetic.sqlite');
 const e=createCommerceEngine({filename});const db=new DatabaseSync(filename);
 try{
  for(const a of ['grant','negotiate','verify','license'])assert.equal(e.step(a).status,200);
  const row=JSON.parse(db.prepare('SELECT payload FROM demo_state WHERE id=1').get().payload);
  assert.equal(validateOfflineReviewEvidence(row).ok,true);
  row.delivery.checks[1].result='FAILURE';
  db.prepare('UPDATE demo_state SET payload=? WHERE id=1').run(JSON.stringify(row));
  const blocked=e.step('review');assert.equal(blocked.status,409);
  assert.equal(blocked.error,'EVIDENCE_INTEGRITY_HOLD');
  assert.equal(blocked.reason,'DELIVERY_EVIDENCE_NOT_CLEAR');
  assert.equal(e.get().step,4);assert.equal(e.get().gate,undefined);
  assert.equal(e.get().events.length,4);assert.equal(e.get().reservedMinor,46000);
  assert.equal(e.get().paypalProviderCalls,0);
  row.delivery.checks[1].result='SUCCESS';
  db.prepare('UPDATE demo_state SET payload=? WHERE id=1').run(JSON.stringify(row));
  assert.equal(e.step('review').status,200);
  assert.equal(e.get().evidenceIntegrity,'LOCAL_DIGEST_MATCH');
  assert.equal(e.get().humanReviewReady,true);
 }finally{db.close();e.close();rmSync(folder,{recursive:true,force:true})}
});
