// PRIVATE synthetic-only whole-chain validation of injected Gemini-shaped role adapters.
// Uses fake Response objects only: NO global fetch, API keys, external network, or payments.
// All evidence is persisted to temporary SQLite databases and removed on exit.
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createA2ABudgetStore} from '../src/gemini_a2a_budget_store.mjs';
import {createDurableGeminiA2ARoles} from '../src/gemini_a2a_durable_roles.mjs';
import {createInnovationLab} from '../src/innovation_lab.mjs';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createMarketplaceIdentityPolicy} from '../src/marketplace_identity_policy.mjs';
import {createCrossPartReviewBridge} from '../src/cross_part_review_bridge.mjs';
import {createCrossPartReviewReadApi} from '../src/cross_part_review_read_api.mjs';

const actor='fixture_buyer',merchant='fixture_merchant';
const quoteId='fixture_quote';
const amountMinor=29000;
const quotaScope={actor,merchant,job:'fixture_a2a_job'};
const fakeEnvelope=(action)=>new Response(JSON.stringify({
 candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({
  action,amountMinor
 })}]}}],
 usageMetadata:{totalTokenCount:40}
}),{status:200,headers:{'content-type':'application/json'}});
const makeRoles=(store,fetchImpl)=>createDurableGeminiA2ARoles({
 budgetStore:store,budgetScope:quotaScope,fetchImpl,
 apiKey:'TEST_DOUBLE_ONLY_NOT_AN_API_KEY',
 // Satisfy the private adapter's fixture contract ONLY. This test is not
 // an owner's actual authorization or Free Tier/project attestation.
 ownerAuthorized:true,freeTierConfirmed:true,maxRequests:4,maxTotalTokens:3000,
 maxOutputTokens:128,timeoutMs:1000
});

export async function checkInjectedA2ACrossPart(){
 const root=mkdtempSync(join(tmpdir(),'paypal-a2a-cross-part-'));
 let quota,lab,ledger,bridge,badQuota,badLab;
 try{
  let mockCalls=0;
  const fakeFetch=async(url,init)=>{
   assert.equal(new URL(url).hostname,'generativelanguage.googleapis.com');
   assert.equal(init.method,'POST');
   assert.equal(init.redirect,'error');
   assert.equal(init.headers['x-goog-api-key'],'TEST_DOUBLE_ONLY_NOT_AN_API_KEY');
   mockCalls++;
   if(mockCalls>2)throw new Error('SYNTHETIC_CALL_LIMIT_EXCEEDED');
   return fakeEnvelope(mockCalls===1?'OFFER':'ACCEPT');
  };
  quota=createA2ABudgetStore({filename:join(root,'quota.sqlite'),
   dayLimit:4,attemptLimit:4,dayTokens:10240});
  const roles=makeRoles(quota,fakeFetch);
  const labFile=join(root,'part2.sqlite');
  lab=createInnovationLab({filename:labFile,agentsFactory:()=>roles});
  const consent=lab.delegate({actor,merchant,key:'grant_1',
   category:'services',maxMinor:30000,expiresInMinutes:30});
  const deal=await lab.a2a({actor,merchant,key:'deal_1',consentId:consent.consentId});
  assert.equal(deal.status,'SYNTHETIC_AGREEMENT');
  assert.equal(deal.agreedMinor,amountMinor);
  assert.equal(deal.paymentAuthorized,false);
  assert.equal(deal.paypalCapturePerformed,false);
  assert.equal(deal.providerCalls,0);
  assert.equal(mockCalls,2);
  const quotaReceipt=quota.status(quotaScope);
  assert.equal(quotaReceipt.requestsClaimed,2);
  assert.equal(quotaReceipt.measuredTokens,80);
  assert.deepEqual(quotaReceipt.records.map(x=>x.state),['DONE','DONE']);
  assert.equal(quotaReceipt.providerVerified,false);
  assert.equal((await lab.a2a({actor,merchant,key:'deal_1',
   consentId:consent.consentId})).replayed,true);
  assert.equal(mockCalls,2);

  // Persisted Part2 state reopens without reinvoking the mock transport.
  lab.close();
  lab=createInnovationLab({filename:labFile,
   agentsFactory:()=>{throw new Error('REPLAY_MUST_NOT_EXECUTE_AGENTS')}});
  const restored=await lab.a2a({actor,merchant,key:'deal_1',
   consentId:consent.consentId});
  assert.equal(restored.replayed,true);
  assert.equal(mockCalls,2);
  const state=lab.state({actor,merchant});
  assert.equal(state.realPayPal,false);
  assert.equal(state.realGemini,false);
  assert.equal(state.providerCalls,0);
  assert.equal(state.consents.find(x=>x.id===consent.consentId)?.usedMinor,
   amountMinor);

  ledger=createSqliteLedger({filename:join(root,'part1.sqlite')});
  await ledger.provisionLocalMember({actorId:actor,merchantId:merchant,role:'buyer'});
  await ledger.insertQuote({id:quoteId,ownerId:actor,merchantId:merchant});
  await ledger.approve({id:quoteId,actorId:actor,expectedVersion:1,
   amountMinor});
  const host=Object.freeze(Object.create(null));
  const sessions=new WeakMap([[host,{verified:true,actorId:actor,
   merchantId:merchant}]]);
  const identityPolicy=createMarketplaceIdentityPolicy({
   resolveTrustedSession:async handle=>sessions.get(handle),
   resolveMembership:async id=>ledger.getLocalMember(id)
  });
  const reviewOpts={filename:join(root,'review.sqlite'),ledger,
   innovationStore:lab,identityPolicy,
   authorizeLink:async context=>context.action===
    'LINK_SYNTHETIC_A2A_TO_APPROVED_QUOTE' &&
    context.amountMinor===amountMinor&&context.paymentAuthorized===false
  };
  bridge=createCrossPartReviewBridge(reviewOpts);
  const review=await bridge.link({hostHandle:host,quoteId,
   consentId:consent.consentId});
  assert.equal(review.paymentAuthorized,false);
  assert.equal(review.realProviderEvidence,false);
  bridge.close();
  bridge=createCrossPartReviewBridge(reviewOpts);
  assert.deepEqual(await bridge.inspect({hostHandle:host,quoteId}),review);
  const request=new Request('http://127.0.0.1:8765/api/private/cross-part/review?quoteId='+quoteId);
  sessions.set(request,{verified:true,actorId:actor,merchantId:merchant});
  const readApi=createCrossPartReviewReadApi({bridge});
  const ok=await readApi(request);
  assert.equal(ok.status,200);
  assert.equal((await ok.json()).review.reviewFingerprint,review.reviewFingerprint);
  assert.equal((await readApi(new Request(request.url))).status,404);

  // Provider-like errors must not become real provider evidence or trigger re-POST.
  let rejectedMockCalls=0;
  badQuota=createA2ABudgetStore({filename:join(root,'fail-quota.sqlite'),
   dayLimit:4,attemptLimit:4,dayTokens:10240});
  const failRoles=makeRoles(badQuota,async()=>{
   rejectedMockCalls++;
   return new Response('fake-quota',{status:429});
  });
  badLab=createInnovationLab({filename:join(root,'fail-part2.sqlite'),
   agentsFactory:()=>failRoles});
  const denied=badLab.delegate({actor,merchant,key:'fail_grant',
   category:'services',maxMinor:30000,expiresInMinutes:30});
  const blocked=await badLab.a2a({actor,merchant,key:'fail_deal',
   consentId:denied.consentId});
  assert.equal(blocked.status,'BLOCKED');
  assert.equal(blocked.accepted,false);
  assert.equal(blocked.paymentAuthorized,false);
  assert.equal(blocked.paypalCapturePerformed,false);
  assert.equal(blocked.providerCalls,0);
  assert.equal(rejectedMockCalls,1);
  assert.equal(badQuota.status(quotaScope).records[0].state,'UNKNOWN');
  assert.equal((await badLab.a2a({actor,merchant,key:'fail_deal',
   consentId:denied.consentId})).replayed,true);
  assert.equal(rejectedMockCalls,1);

  return Object.freeze({
   status:'INJECTED_FAKE_A2A_CROSS_PART_SQLITE_E2E_PASS',
   mode:'OFFLINE_FAKE_GEMINI_TRANSPORT_ONLY',
   fakeGeminiShapedRequests:mockCalls,
   fakeQuotaFailureRequests:rejectedMockCalls,
   realGeminiRequests:0,realPayPalRequests:0,
   actualProviderAttestation:false,quotaClaims:quotaReceipt.requestsClaimed,
   measuredFakeTokens:quotaReceipt.measuredTokens,storedQuotaStates:['DONE','DONE'],
   failedProviderQuotaState:'UNKNOWN',part2ReplayPersisted:true,
   part1ApprovedQuoteVerified:true,privateCrossPartReviewVerified:true,
   forgedHostDenied:true,quotaFailureNoRetry:true,
   paymentAuthorized:false,paypalCapturePerformed:false,
   publicationAuthorized:false
  });
 }finally{
  badLab?.close();badQuota?.close();bridge?.close();
  ledger?.close();lab?.close();quota?.close();
  rmSync(root,{recursive:true,force:true});
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.argv.length!==2){
  process.stderr.write('FAKE_A2A_PROOF_NO_ARGUMENTS\n');
  process.exitCode=2;
 }else{
  checkInjectedA2ACrossPart().then(
   value=>process.stdout.write(JSON.stringify(value)+'\n'),
   e=>{process.stderr.write('FAKE_A2A_PROOF_FAILED:'+String(e?.code||e?.message||'UNKNOWN')+'\n');
    process.exitCode=1;}
  );
 }
}
