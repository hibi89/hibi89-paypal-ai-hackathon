import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {runJudgeReproduction,validateSyntheticMarketplaceResponse}
  from '../scripts/run_judge_reproduction.mjs';
import {verifyQuoteBoundJudgeProof}
  from '../src/judge_quote_plan_probe.mjs';
import {deriveQuoteBoundFakePayPalFlow}
  from '../src/quote_bound_fake_paypal_flow.mjs';
import {matchSyntheticMarketplaceBrief,matchSyntheticGeneralServiceBrief}
  from '../src/marketplace_match.mjs';

test('judge one-shot exercises two real loopback match requests and fake-provider workflow, not live APIs',async()=>{
  const report=await runJudgeReproduction({write:false});
  assert.equal(report.status,'JUDGE_OFFLINE_REPRODUCED_NOT_SUBMITTED');
  assert.equal(report.reproducibleA.status,'ACTUAL_LOOPBACK_HTTP_VERIFIED_SYNTHETIC_ONLY');
  assert.equal(report.reproducibleA.localMarketplacePosts,2);
  assert.equal(report.reproducibleA.paymentPosts,0);
  assert.equal(report.reproducibleA.quoteMutations,0);
  assert.equal(report.reproducibleA.paymentEndpointStatus,503);
  assert.deepEqual(report.reproducibleA.categories.map(x=>x.vertical),
    ['ai_work','general_services']);
  assert.deepEqual(report.reproducibleA.categories.map(x=>x.firstEligibleFictionalProfile),
    ['synthetic-web','synthetic-creative']);
  assert.equal(report.reproducibleA.browserAutomationExecuted,false);
  const quoteBound=report.reproducibleQuoteBoundPlans;
  assert.equal(quoteBound.status,'TWO_APPROVED_QUOTE_PLANS_REPRODUCED_SYNTHETIC_ONLY');
  assert.equal(quoteBound.source,'TWO_ISOLATED_REAL_LOOPBACK_SQLITE_SESSIONS');
  assert.deepEqual(quoteBound.categories.map(c=>[c.vertical,c.approvedAmount]),[
    ['ai_work','15.00'],['general_services','29.00']]);
  assert.equal(quoteBound.totalPureFakeDomainStages,18);
  for(const category of quoteBound.categories){
    assert.equal(category.quoteVersion,2);
    assert.equal(category.fakeDomainStages,9);
    assert.equal(category.prematureCaptureBlocked,true);
    assert.equal(category.foreignAmountBlocked,true);
    assert.equal(category.localMarketplacePosts,1);
    assert.equal(category.localDraftPosts,1);
    assert.equal(category.localHumanApprovalFixturePosts,1);
    assert.equal(category.localPaymentPosts,0);
    assert.equal(category.actualProviderCalls,0);
    assert.equal(category.paymentEndpointStatus,503);
    assert.equal(category.paymentReal,false);
  }
  assert.equal(quoteBound.realGeminiCalls,0);
  assert.equal(quoteBound.realPayPalCalls,0);
  assert.equal(quoteBound.actualPaymentPosts,0);
  assert.equal(quoteBound.providerPaymentVerified,false);
  assert.equal(report.reproducibleB.status,'VERIFIED_WITH_FAKE_INJECTED_TRANSPORT');
  assert.equal(report.reproducibleB.fakePayPalCreatePosts,1);
  assert.equal(report.reproducibleB.fakePayPalCapturePosts,1);
  assert.equal(report.reproducibleB.fakeGetReconciliation,true);
  assert.equal(report.reproducibleB.actualProviderCalls,0);
  assert.equal(report.reproducibleB.fakeApiProtocol.status,
    'INJECTED_FAKE_PROTOCOL_SEQUENCE_VERIFIED');
  assert.ok(report.reproducibleB.fakeApiProtocol.stageSequence.indexOf(
    'FAKE_ORDER_GET_APPROVED')<
    report.reproducibleB.fakeApiProtocol.stageSequence.indexOf('FAKE_ORDER_CAPTURE_POST'));
  assert.ok(report.reproducibleB.fakeApiProtocol.stageSequence.indexOf('FAKE_ORDER_CAPTURE_POST')<
    report.reproducibleB.fakeApiProtocol.stageSequence.indexOf('FAKE_ORDER_GET_COMPLETED'));
  assert.equal(report.historicalC.status,'OWNER_REPORTED_NOT_INDEPENDENTLY_ATTESTED');
  assert.equal(report.publicationD.status,'NOT_SUBMITTED');
  assert.equal(report.safety.submissionEligible,false);
  assert.equal(report.safety.ownerPrivateReceiptRead,false);
  assert.equal(report.source.publicReleaseVerified,false);
});

test('fake or contaminated marketplace provider results cannot be called reproducible',()=>{
  const base={
    ...matchSyntheticMarketplaceBrief('Build an ecommerce website with PayPal checkout'),
    vertical:'ai_work'
  };
  assert.doesNotThrow(()=>validateSyntheticMarketplaceResponse(base,'ai_work','synthetic-web'));
  const other=matchSyntheticGeneralServiceBrief('Design a new logo and brand identity');
  assert.doesNotThrow(()=>validateSyntheticMarketplaceResponse(other,'general_services','synthetic-creative'));
  const bad=[
    {...base,mode:'GEMINI_API'},
    {...base,vertical:'general_services'},
    {...base,profileCount:4},
    {...base,paypal:{status:'PAID',capturePerformed:true}},
    {...base,price:{status:'VERIFIED',amountMinor:5000}},
    {...base,profiles:base.profiles.map(p=>({...p,source:'LIVE_SELLER'}))},
    {...base,profiles:[{...base.profiles[0],id:'buyer@example.com'},...base.profiles.slice(1)]}
  ];
  for(const payload of bad)
    assert.throws(()=>validateSyntheticMarketplaceResponse(payload,'ai_work','synthetic-web'));
});

test('one-command reviewer CLI returns classified safe JSON and saves only ignored evidence',()=>{
  const script=fileURLToPath(new URL('../scripts/run_judge_reproduction.mjs',import.meta.url));
  const cmd=spawnSync(process.execPath,['--experimental-sqlite',script],{
    encoding:'utf8',timeout:25000,maxBuffer:1024*1024,
    env:{PATH:process.env.PATH||'',HOME:process.env.HOME||'',
      PAYPAL_SANDBOX_CLIENT_SECRET:'CANARY_NO_LEAK',
      GEMINI_API_KEY:'CANARY_NO_LEAK'}
  });
  assert.equal(cmd.status,0,cmd.stderr||cmd.stdout);
  const output=JSON.parse(cmd.stdout);
  assert.equal(output.status,'JUDGE_OFFLINE_REPRODUCED_NOT_SUBMITTED');
  assert.equal(output.safety.realGeminiCalls,0);
  assert.equal(output.safety.realPayPalCalls,0);
  assert.equal(output.safety.paymentPosts,0);
  assert.equal(output.safety.publicUploads,0);
  assert.equal(output.reproducibleB.fakeApiProtocol.actualProviderCalls,0);
  assert.equal(output.reproducibleQuoteBoundPlans.totalPureFakeDomainStages,18);
  assert.equal(output.reproducibleQuoteBoundPlans.actualPaymentPosts,0);
  assert.doesNotMatch(JSON.stringify(output.reproducibleB.fakeApiProtocol),
    /FICTIONALORDER|FICTIONALCAPTURE|checkoutnow|PayerID|client_secret/);
  assert.equal(output.publicationD.publicVideoUrl,null);
  assert.equal(output.publicationD.devpostReceipt,null);
  assert.doesNotMatch(cmd.stdout,/CANARY_NO_LEAK|PayerID|access_token|client_secret/);
  const saved=JSON.parse(readFileSync(new URL('../output/submission/judge_reproduction_receipt.json',import.meta.url),'utf8'));
  assert.deepEqual(saved,output);
});

test('judge quote-bound proof rejects false paid or live provider claims',()=>{
 const q={id:'sample-project',ownerId:'synthetic-owner',merchantId:'synthetic-merchant',
  currency:'USD',status:'APPROVED',version:2,approval:{
   decision:'APPROVED',actorId:'synthetic-owner',quoteVersion:2,amountMinor:2900}};
 const good={status:'LOCAL_APPROVED_QUOTE_PAYPAL_PLAN_ONLY',
  source:'PERSISTED_SYNTHETIC_SQLITE_APPROVAL',
  quoteId:'sample-project',quoteVersion:2,amountMinor:2900,
  currency:'USD',amount:'29.00',plannedMethod:'POST_NOT_SENT',
  plannedPath:'/v2/checkout/orders',externalProviderCalls:0,
  orderCreated:false,capturePerformed:false,executionAuthorized:false,
  sandboxMerchantConnected:false,quoteBoundFakeFlow:deriveQuoteBoundFakePayPalFlow(q)};
 assert.equal(verifyQuoteBoundJudgeProof(good,{version:2,amountMinor:2900})
  .fakeDomainStages,9);
 for(const corrupt of [
  {...good,amount:'30.00'},
  {...good,orderCreated:true},
  {...good,externalProviderCalls:1},
  {...good,quoteBoundFakeFlow:{...good.quoteBoundFakeFlow,paymentWasReal:true}},
  {...good,quoteBoundFakeFlow:{...good.quoteBoundFakeFlow,paymentPosts:1}},
  {...good,quoteBoundFakeFlow:{...good.quoteBoundFakeFlow,steps:[]}},
  {...good,merchantId:'synthetic-merchant'}
 ])assert.throws(()=>verifyQuoteBoundJudgeProof(corrupt,{
    version:2,amountMinor:2900}));
});
