import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runOfflineOperatorMvpSmoke} from '../src/offline_operator_mvp_smoke.mjs';
import {summarizeSyntheticJudgeTrace,renderJudgeEvidenceMarkdown}
  from '../scripts/build_judge_evidence_report.mjs';

test('evidence classes are strictly separated after fake-provider orchestrator succeeds',async()=>{
 const raw=await runOfflineOperatorMvpSmoke();
 const report=summarizeSyntheticJudgeTrace(raw);
 assert.equal(report.status,'JUDGE_SAFE_OFFLINE_EVIDENCE_READY_NOT_SUBMITTED');
 assert.equal(report.evidence.length,4);
 assert.equal(report.evidence[1].status,'VERIFIED_WITH_FAKE_INJECTED_TRANSPORT');
 assert.equal(report.evidence[2].status,'OWNER_REPORTED_NOT_INDEPENDENTLY_ATTESTED');
 assert.equal(report.evidence[3].status,'NOT_SUBMITTED');
 assert.equal(report.verifiedFromThisCommand.actualProviderCalls,0);
 assert.equal(report.verifiedFromThisCommand.actualPaymentCaptured,false);
 assert.equal(report.verifiedFromThisCommand.fakeApiProtocol.status,
   'INJECTED_FAKE_PROTOCOL_SEQUENCE_VERIFIED');
 assert.ok(report.verifiedFromThisCommand.fakeApiProtocol.stageSequence.includes(
   'FAKE_ORDER_CAPTURE_POST'));
 assert.equal(report.releases.publicationAuthorized,false);
 const markdown=renderJudgeEvidenceMarkdown(report);
 assert.match(markdown,/FAKE Gemini and PayPal Sandbox/);
 assert.match(markdown,/owner-reported historical activity/i);
 assert.match(markdown,/NOT_SUBMITTED/);
 assert.doesNotMatch(markdown,/client_secret|access_token|PayerID|checkoutnow/);
});
test('tampered mock payload or invented real provider proof fails closed',async()=>{
 const valid=await runOfflineOperatorMvpSmoke();
 assert.doesNotThrow(()=>summarizeSyntheticJudgeTrace(valid));
 for(const alteration of [
    {realGeminiCalls:1},{realPayPalCalls:1},{realPaymentCaptured:true},
    {implicitNetworkAccess:true},{scope:'REAL_PROVIDER'},
    {mockCaptureState:'PAID_VERIFIED_BY_REAL_PAYPAL'},
    {syntheticOperationClaims:0},{automaticRetry:true},
    {selectedProfile:'sensitive-email@example.com'}, {missingSkills:['secret_token']},
    {fakeProviderProtocol:{...valid.fakeProviderProtocol,stageSequence:['FAKE_PAYPAL_OAUTH_POST']}}
 ]){
   assert.throws(()=>summarizeSyntheticJudgeTrace({...valid,...alteration}));
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
 assert.equal(data.paymentCaptured,false);
 assert.equal(data.submitted,false);
 assert.equal(data.evidenceClasses[2].status,'OWNER_REPORTED_NOT_INDEPENDENTLY_ATTESTED');
 assert.doesNotMatch(child.stdout,/client_secret|access_token|PayerID|checkoutnow/);
 const markdown=readFileSync(new URL('../output/submission/judge_evidence_report.md',import.meta.url),'utf8');
 assert.match(markdown,/LOCAL DRAFT ONLY/);
 assert.match(markdown,/NOT_SUBMITTED/);
});
