import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {runJudgeReproduction,validateSyntheticMarketplaceResponse}
  from '../scripts/run_judge_reproduction.mjs';
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
  assert.equal(report.reproducibleB.status,'VERIFIED_WITH_FAKE_INJECTED_TRANSPORT');
  assert.equal(report.reproducibleB.fakePayPalCreatePosts,1);
  assert.equal(report.reproducibleB.fakePayPalCapturePosts,1);
  assert.equal(report.reproducibleB.fakeGetReconciliation,true);
  assert.equal(report.reproducibleB.actualProviderCalls,0);
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
      PAYPAL_SANDBOX_CLIENT_SECRET:'CANARY_SECRET_NOT_FOR_REPORT',
      GEMINI_API_KEY:'CANARY_SECRET_NOT_FOR_REPORT'}
  });
  assert.equal(cmd.status,0,cmd.stderr||cmd.stdout);
  const output=JSON.parse(cmd.stdout);
  assert.equal(output.status,'JUDGE_OFFLINE_REPRODUCED_NOT_SUBMITTED');
  assert.equal(output.safety.realGeminiCalls,0);
  assert.equal(output.safety.realPayPalCalls,0);
  assert.equal(output.safety.paymentPosts,0);
  assert.equal(output.safety.publicUploads,0);
  assert.equal(output.publicationD.publicVideoUrl,null);
  assert.equal(output.publicationD.devpostReceipt,null);
  assert.doesNotMatch(cmd.stdout,/CANARY_SECRET_NOT_FOR_REPORT|PayerID|access_token|client_secret/);
  const saved=JSON.parse(readFileSync(new URL('../output/submission/judge_reproduction_receipt.json',import.meta.url),'utf8'));
  assert.deepEqual(saved,output);
});
