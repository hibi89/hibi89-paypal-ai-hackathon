import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildSyntheticChurnProposal} from '../src/churn_retention_policy.mjs';
import {createInnovationLab} from '../src/innovation_lab.mjs';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';
const actor='synthetic-owner',merchant='synthetic-merchant';
const scenario=Object.freeze({
 subscriptionRef:'demo-sub-maintenance-101',currentMinor:2500,
 remainingMonths:6,churnRisk:'HIGH',maxDiscountBps:2000,pauseAllowed:true
});
test('HIGH risk / 20 percent local cap: integer monthly and full term amounts',()=>{
 const r=buildSyntheticChurnProposal(scenario);
 assert.equal(r.status,'DRAFT_ONLY');
 assert.equal(r.decisionStatus,'DISCOUNT_PROPOSAL');
 assert.equal(r.currentMinor,2500);
 assert.equal(r.targetDiscountBps,2000);
 assert.equal(r.discountBps,2000);
 assert.equal(r.monthlyDiscountMinor,500);
 assert.equal(r.proposedMinor,2000);
 assert.equal(r.baselineTermMinor,15000);
 assert.equal(r.proposedTermMinor,12000);
 assert.equal(r.termSavingsMinor,3000);
 assert.equal(r.providerSubscriptionVerified,false);
 assert.equal(r.customerConsentRequired,true);
 assert.equal(r.merchantApprovalRequired,true);
 assert.equal(r.paypalPlanChanged,false);
 assert.equal(r.paypalSubscriptionPaused,false);
});
test('risk bands/caps limit discount, exact cents round down without a refund',()=>{
 const m=buildSyntheticChurnProposal({...scenario,churnRisk:'MEDIUM',
  maxDiscountBps:3000,currentMinor:1999,remainingMonths:3});
 assert.equal(m.discountBps,1000);
 assert.equal(m.monthlyDiscountMinor,199);
 assert.equal(m.proposedMinor,1800);
 assert.equal(m.termSavingsMinor,597);
 const capped=buildSyntheticChurnProposal({...scenario,maxDiscountBps:500});
 assert.equal(capped.discountBps,500);
 assert.equal(capped.monthlyDiscountMinor,125);
 assert.equal(capped.termSavingsMinor,750);
 const low=buildSyntheticChurnProposal({...scenario,churnRisk:'LOW'});
 assert.equal(low.discountBps,0);
 assert.equal(low.decisionStatus,'NO_DISCOUNT_RECOMMENDED');
 assert.equal(low.termSavingsMinor,0);
});
test('zero cap permits high-risk human pause review but never edits plan',()=>{
 const pause=buildSyntheticChurnProposal({...scenario,maxDiscountBps:0});
 assert.equal(pause.decisionStatus,'PAUSE_REVIEW');
 assert.equal(pause.alternative,'PAUSE_FOR_HUMAN_REVIEW');
 assert.equal(pause.termSavingsMinor,0);
 assert.equal(pause.paypalSubscriptionPaused,false);
 const blocked=buildSyntheticChurnProposal({...scenario,maxDiscountBps:0,pauseAllowed:false});
 assert.equal(blocked.decisionStatus,'NO_DISCOUNT_RECOMMENDED');
 assert.equal(blocked.alternative,'NONE');
});
test('reject unverified identifiers, fractional amounts, invalid risk, unknown fields',()=>{
 const bad=[
  {...scenario,subscriptionRef:'customer-personal-001'},
  {...scenario,subscriptionRef:'demo-sub-<script>'},
  {...scenario,currentMinor:25.5},{...scenario,currentMinor:0},
  {...scenario,currentMinor:1000001},
  {...scenario,remainingMonths:0},{...scenario,remainingMonths:25},
  {...scenario,remainingMonths:2.5},
  {...scenario,maxDiscountBps:-1},{...scenario,maxDiscountBps:3001},
  {...scenario,churnRisk:'CRITICAL'},
  {...scenario,pauseAllowed:'true'},
  {...scenario,externalPayPalSubscriptionId:'fake'},
  null
 ];
 for(const input of bad)assert.throws(()=>buildSyntheticChurnProposal(input),
  e=>e.code==='INVALID_SYNTHETIC_CHURN');
});
test('local churn event persists and replays, not editable by reusing the key',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ppl-churn-'));
 const filename=join(dir,'part2.sqlite');
 let store;
 try{
  store=createInnovationLab({filename});
  const created=store.skill({actor,merchant,key:'churn01',kind:'churn',churnInput:scenario});
  assert.equal(created.replayed,false);
  assert.equal(created.termSavingsMinor,3000);
  assert.equal(created.providerCalls,0);
  assert.equal(created.paymentAuthorized,false);
  const same=store.skill({actor,merchant,key:'churn01',kind:'churn',churnInput:scenario});
  assert.equal(same.replayed,true);
  assert.throws(()=>store.skill({actor,merchant,key:'churn01',kind:'churn',
   churnInput:{...scenario,currentMinor:4000}}),e=>e.code==='REPLAY_CONFLICT');
  assert.throws(()=>store.skill({actor,merchant,key:'bad-churn',kind:'churn',
   churnInput:{...scenario,subscriptionRef:'private'}}),e=>e.code==='INVALID_SYNTHETIC_CHURN');
  assert.equal(store.state({actor,merchant}).events.length,1);
  store.close();store=createInnovationLab({filename});
  assert.equal(store.state({actor,merchant}).events.length,1);
  assert.equal(store.skill({actor,merchant,key:'churn01',kind:'churn',
   churnInput:scenario}).replayed,true);
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
test('real loopback churn endpoint rejects CSRF, role spoofing, and mutated keys',async()=>{
 const app=await startOfflineDemo({testReviewSessions:true});
 try{
  const session=await(await fetch(app.url+'/demo/session')).json();
  const route=app.url+'/api/demo/innovation/churn';
  const post=(payload,headers={})=>fetch(route,{
   method:'POST',headers:{origin:app.url,'content-type':'application/json',
     'x-csrf-token':session.csrfToken,...headers},
   body:JSON.stringify(payload)
  });
  const payload={idempotencyKey:'churn01',...scenario};
  assert.equal((await post(payload,{'x-csrf-token':'wrong'})).status,403);
  assert.equal((await post(payload,{cookie:app.testReviewerCookie})).status,403);
  assert.equal((await post({...payload,providerApproved:true})).status,400);
  assert.equal((await post({...payload,currentMinor:-100})).status,400);
  const first=await post(payload);
  assert.equal(first.status,200);
  assert.equal((await first.json()).decisionStatus,'DISCOUNT_PROPOSAL');
  const repeat=await post(payload);
  assert.equal((await repeat.json()).replayed,true);
  assert.equal((await post({...payload,remainingMonths:9})).status,409);
  const state=await(await fetch(app.url+'/api/demo/innovation/state')).json();
  assert.equal(state.events.filter(x=>x.kind==='churn').length,1);
  assert.equal(state.providerCalls,0);
  assert.equal(state.realPayPal,false);
  assert.deepEqual(await(await fetch(app.url+'/api/demo/innovation/state')).json(),state);
 }finally{await app.close();}
});
