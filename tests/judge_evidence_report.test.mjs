import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runOfflineOperatorMvpSmoke} from '../src/offline_operator_mvp_smoke.mjs';
import {summarizeSyntheticJudgeTrace,renderJudgeEvidenceMarkdown,runSyntheticPart2JudgeTrace}
  from '../scripts/build_judge_evidence_report.mjs';

test('evidence classes are strictly separated after fake-provider orchestrator succeeds',async()=>{
 const raw=await runOfflineOperatorMvpSmoke();
 const part2=await runSyntheticPart2JudgeTrace();
 const report=summarizeSyntheticJudgeTrace(raw,part2);
 assert.equal(report.status,'JUDGE_SAFE_OFFLINE_EVIDENCE_READY_NOT_SUBMITTED');
 assert.equal(report.project,'WORKNOVA — AI Work + Global Services');
 assert.equal(report.reviewerSourceBranch,'lead/paypal');
 assert.equal(report.reviewerSourceUrl,
  'https://github.com/hibi89/hibi89-paypal-ai-hackathon/tree/lead/paypal');
 assert.equal(report.reviewerSourceVerifiedLiveByThisCommand,false);
 assert.equal(report.evidence.length,5);
 assert.equal(report.evidence[1].status,'VERIFIED_WITH_FAKE_INJECTED_TRANSPORT');
 assert.equal(report.evidence[2].status,'VERIFIED_DETERMINISTIC_OFFLINE_NO_PROVIDER');
 assert.equal(report.evidence[2].count,6);
 assert.equal(report.evidence[3].status,'OWNER_REPORTED_NOT_INDEPENDENTLY_ATTESTED');
 assert.equal(report.evidence[4].status,'NOT_SUBMITTED');
 assert.equal(report.evidence[4].source,'docs/DEVPOST_FINAL_REVIEW_PACKET_EN_20261105.md');
 assert.equal(report.verifiedFromThisCommand.part2FiveSkillsExecuted,5);
 assert.equal(report.verifiedFromThisCommand.part2RealProviderCalls,0);
 assert.equal(report.verifiedFromThisCommand.actualProviderCalls,0);
 assert.equal(report.verifiedFromThisCommand.actualPaymentCaptured,false);
 assert.equal(report.releases.publicationAuthorized,false);
 const markdown=renderJudgeEvidenceMarkdown(report);
 assert.match(markdown,/FAKE Gemini and PayPal Sandbox/);
 assert.match(markdown,/owner-reported historical activity/i);
 assert.match(markdown,/^# WORKNOVA — judge evidence classes/);
 assert.match(markdown,/git switch lead\/paypal/);
 assert.doesNotMatch(markdown,/^# Proofline/m);
 assert.match(markdown,/NOT_SUBMITTED/);
 assert.match(markdown,/docs\/DEVPOST_FINAL_REVIEW_PACKET_EN_20261105[.]md/);
 assert.doesNotMatch(markdown,/docs\/OWNER_FINAL_SUBMISSION_HANDOFF_20261029[.]md/);
 assert.doesNotMatch(markdown,/client_secret|access_token|PayerID|checkoutnow/);
});
test('tampered mock payload or invented real provider proof fails closed',async()=>{
 const valid={
   status:'MOCK_MVP_E2E_PASS',scope:'SYNTHETIC_PROVIDER_FIXTURE_ONLY',
   realGeminiCalls:0,realPayPalCalls:0,realPaymentCaptured:false,
   implicitNetworkAccess:false,syntheticQuoteCurrency:'USD',
   syntheticQuoteAmount:'1.50',syntheticSkillSource:'INJECTED_FAKE_GEMINI',
   simulatedBuyerApproved:true,
   mockCaptureState:'PAID_VERIFIED_BY_INJECTED_PROVIDER_GET',
   privateSqliteLedgerVerified:true,syntheticOperationClaims:2,
   createPostsToFakeTransport:1,capturePostsToFakeTransport:1,
   automaticRetry:false,selectedProfile:'synthetic-web',missingSkills:['qa']
 };
 const part2=await runSyntheticPart2JudgeTrace();
 assert.doesNotThrow(()=>summarizeSyntheticJudgeTrace(valid,part2));
 assert.throws(()=>summarizeSyntheticJudgeTrace(valid),
  /PART2_SYNTHETIC_TRACE_NOT_VERIFIED/);
 assert.throws(()=>summarizeSyntheticJudgeTrace(valid,{...part2,actualProviderCalls:1}),
  /PART2_SYNTHETIC_TRACE_NOT_VERIFIED/);
 assert.throws(()=>summarizeSyntheticJudgeTrace(valid,{...part2,paymentAuthorized:true}),
  /PART2_SYNTHETIC_TRACE_NOT_VERIFIED/);
 for(const alteration of [
    {realGeminiCalls:1},{realPayPalCalls:1},{realPaymentCaptured:true},
    {implicitNetworkAccess:true},{scope:'REAL_PROVIDER'},
    {mockCaptureState:'PAID_VERIFIED_BY_REAL_PAYPAL'},
    {syntheticOperationClaims:0},{automaticRetry:true},
    {selectedProfile:'sensitive-email@example.com'}, {missingSkills:['secret_token']}
 ]){
   assert.throws(()=>summarizeSyntheticJudgeTrace({...valid,...alteration},part2));
 }
});
test('one-command judge evidence CLI exits cleanly with no provider claims',()=>{
 const script=fileURLToPath(new URL('../scripts/build_judge_evidence_report.mjs',import.meta.url));
 const child=spawnSync(process.execPath,['--experimental-sqlite',script],{
   encoding:'utf8',timeout:15000,env:{PATH:process.env.PATH,HOME:process.env.HOME||''}
 });
 assert.equal(child.status,0,child.stderr||child.stdout);
 const data=JSON.parse(child.stdout);
 assert.equal(data.providerCalls,0);
 assert.equal(data.project,'WORKNOVA — AI Work + Global Services');
 assert.match(data.reviewerSourceUrl,/\/tree\/lead\/paypal$/);
 assert.equal(data.reviewerSourceVerifiedLiveByThisCommand,false);
 assert.equal(data.paymentCaptured,false);
 assert.equal(data.submitted,false);
 assert.equal(data.evidenceClasses[2].status,'VERIFIED_DETERMINISTIC_OFFLINE_NO_PROVIDER');
 assert.equal(data.evidenceClasses[3].status,'OWNER_REPORTED_NOT_INDEPENDENTLY_ATTESTED');
 assert.equal(data.part2Skills,5);
 assert.doesNotMatch(child.stdout,/client_secret|access_token|PayerID|checkoutnow/);
 const markdown=readFileSync(new URL('../output/submission/judge_evidence_report.md',import.meta.url),'utf8');
 assert.match(markdown,/LOCAL DRAFT ONLY/);
 assert.match(markdown,/NOT_SUBMITTED/);
});

test('judge-facing report rendering rejects forged public/provider states and evidence rows',async()=>{
 const raw=await runOfflineOperatorMvpSmoke();
 const part2=await runSyntheticPart2JudgeTrace();
 const good=summarizeSyntheticJudgeTrace(raw,part2);
 assert.doesNotThrow(()=>renderJudgeEvidenceMarkdown(good));
 for(const altered of [
  {...good,project:'Proofline — fake legacy source'},
  {...good,reviewerSourceUrl:'https://example.test/pretend-approved'},
  {...good,reviewerSourceVerifiedLiveByThisCommand:true},
  {...good,verifiedFromThisCommand:{...good.verifiedFromThisCommand,actualProviderCalls:1}},
  {...good,verifiedFromThisCommand:{...good.verifiedFromThisCommand,actualPaymentCaptured:true}},
  {...good,releases:{...good.releases,publicVideoUrl:'https://example.test/watch'}},
  {...good,releases:{...good.releases,publicationAuthorized:true}},
  {...good,evidence:good.evidence.map((x,i)=>i===3?
    {...x,status:'INDEPENDENT_PAYPAL_AND_GEMINI_PROVIDER_VERIFIED'}:x)},
  {...good,evidence:good.evidence.map((x,i)=>i===3?
    {...x,source:'secret_provider_receipt.json'}:x)},
  {...good,evidence:good.evidence.map((x,i)=>i===4?
    {...x,source:'docs/OWNER_FINAL_SUBMISSION_HANDOFF_20261029.md'}:x)}
 ]){
  assert.throws(()=>renderJudgeEvidenceMarkdown(altered),
   /JUDGE_PUBLICATION_OR_PROVIDER_PROVENANCE_INVALID/);
 }
});
