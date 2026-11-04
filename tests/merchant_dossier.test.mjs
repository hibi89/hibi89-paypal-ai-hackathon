import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildSyntheticMerchantDossier} from '../src/merchant_dossier.mjs';
import {createInnovationLab} from '../src/innovation_lab.mjs';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';
const actor='synthetic-owner',merchant='synthetic-merchant';
const example=Object.freeze({
 contractRef:'demo-contract-001',amountMinor:29375,
 issueType:'QUALITY',deliveryStatus:'REVIEWED',
 evidenceKinds:['contract_terms','delivery_record','review_decision']
});
test('exact dollar cents and evidence completeness yield human-review-only draft',()=>{
 const result=buildSyntheticMerchantDossier(example);
 assert.equal(result.invoice.totalMinor,29375);
 assert.equal(result.invoice.currency,'USD');
 assert.equal(result.invoice.sent,false);
 assert.equal(result.dispute.reviewState,'READY_FOR_HUMAN_REVIEW');
 assert.deepEqual(result.dispute.missingRequired,[]);
 assert.equal(result.dispute.verifiedEvidenceCount,0);
 assert.equal(result.paypalInvoiceCreated,false);
 assert.equal(result.paypalDisputeSubmitted,false);
 assert.equal(result.paymentState,'NOT_PAID');
 assert.equal(result.source,'USER_ENTERED_FICTIONAL_ASSERTIONS_UNVERIFIED');
});
test('dispute contradictions and missing documents are explicitly not verified',()=>{
 const missing=buildSyntheticMerchantDossier({...example,evidenceKinds:['contract_terms']});
 assert.deepEqual(missing.dispute.missingRequired,['delivery_record','review_decision']);
 assert.equal(missing.dispute.reviewState,'MISSING_EVIDENCE');
 const conflict=buildSyntheticMerchantDossier({...example,
  issueType:'NON_DELIVERY'});
 assert.equal(conflict.dispute.reviewState,'CONFLICT_REQUIRES_HUMAN_REVIEW');
 assert.ok(conflict.dispute.contradictions.includes('NON_DELIVERY_CONFLICTS_WITH_REVIEWED'));
 const wrongRecord=buildSyntheticMerchantDossier({...example,
  deliveryStatus:'NOT_DELIVERED',evidenceKinds:['contract_terms','delivery_record']});
 assert.ok(wrongRecord.dispute.contradictions.includes('DELIVERY_EVIDENCE_CONFLICTS_WITH_NOT_DELIVERED'));
 assert.equal(wrongRecord.invoice.sent,false);
});
test('reject malformed, data-bearing, counterfeit and over-budget dossier fields',()=>{
 const bad=[
  {...example,amountMinor:299.99},{...example,amountMinor:0},
  {...example,amountMinor:1000001},{...example,contractRef:'real-customer-100'},
  {...example,contractRef:'demo-<script>alert(1)</script>'},
  {...example,issueType:'UNSUPPORTED'},
  {...example,deliveryStatus:'PAID'},
  {...example,evidenceKinds:['review_decision','review_decision']},
  {...example,evidenceKinds:['contract_terms','provider_auth']},
  {...example,evidenceKinds:'contract_terms'},
  {...example,actor:'synthetic-owner'},null
 ];
 for(const input of bad)assert.throws(()=>buildSyntheticMerchantDossier(input),
  e=>e.code==='INVALID_SYNTHETIC_DOSSIER');
});
test('SQLite dossier reuses same immutable claim, conflicting payload and role are denied',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ppl-dossier-'));
 const filename=join(dir,'lab.sqlite');
 let store;
 try{
  store=createInnovationLab({filename});
  const draft=store.skill({actor,merchant,key:'draft1',kind:'invoice',
   dossierInput:example});
  assert.equal(draft.replayed,false);
  assert.equal(draft.invoice.totalMinor,29375);
  const replay=store.skill({actor,merchant,key:'draft1',kind:'invoice',
   dossierInput:example});
  assert.equal(replay.replayed,true);
  assert.equal(replay.invoice.totalMinor,29375);
  assert.throws(()=>store.skill({actor,merchant,key:'draft1',kind:'invoice',
    dossierInput:{...example,amountMinor:45000}}),e=>e.code==='REPLAY_CONFLICT');
  assert.throws(()=>store.skill({actor,merchant,key:'bad',kind:'invoice',
    dossierInput:{...example,contractRef:'private'} }),e=>e.code==='INVALID_SYNTHETIC_DOSSIER');
  assert.equal(store.state({actor,merchant}).events.length,1);
  store.close();store=createInnovationLab({filename});
  const persisted=store.state({actor,merchant});
  assert.equal(persisted.events.length,1);
  assert.equal(persisted.events[0].result.dispute.reviewState,'READY_FOR_HUMAN_REVIEW');
  assert.equal(store.skill({actor,merchant,key:'draft1',kind:'invoice',dossierInput:example}).replayed,true);
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
test('actual HTTP invoice validates schema and isolates reviewer and CSRF; GET never mutates',async()=>{
 const app=await startOfflineDemo({testReviewSessions:true});
 try{
  const session=await(await fetch(app.url+'/demo/session')).json();
  const endpoint=app.url+'/api/demo/innovation/';
  const post=(body,headers={})=>fetch(endpoint+'invoice',{
   method:'POST',headers:{origin:app.url,'content-type':'application/json',
    'x-csrf-token':session.csrfToken,...headers},body:JSON.stringify(body)});
  const payload={idempotencyKey:'dossier1',...example};
  assert.equal((await post(payload,{'x-csrf-token':'bad'})).status,403);
  assert.equal((await post(payload,{cookie:app.testReviewerCookie})).status,403);
  assert.equal((await post({...payload,externalPayPalInvoiceId:'FAKE'})).status,400);
  assert.equal((await post({...payload,contractRef:'buyer-PII'})).status,400);
  const draft=await post(payload);
  assert.equal(draft.status,200);
  assert.equal((await draft.json()).dispute.reviewState,'READY_FOR_HUMAN_REVIEW');
  const r=await post(payload);
  assert.equal((await r.json()).replayed,true);
  assert.equal((await post({...payload,amountMinor:19000})).status,409);
  const state=await(await fetch(endpoint+'state')).json();
  assert.equal(state.events.length,1);
  assert.equal(state.providerCalls,0);
  assert.equal(state.realPayPal,false);
  assert.deepEqual(await(await fetch(endpoint+'state')).json(),state);
 }finally{await app.close();}
});
