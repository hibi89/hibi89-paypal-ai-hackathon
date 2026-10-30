import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {summarizeOwnerReview,prepareOwnerReview}
  from '../scripts/prepare_owner_review_brief.mjs';

const sha='a'.repeat(40);
const fixture=()=>({
 judge:{
  status:'JUDGE_OFFLINE_REPRODUCED_NOT_SUBMITTED',
  reproducibleB:{actualProviderCalls:0},
  safety:{paymentPosts:0,publicUploads:0},
  historicalC:{status:'OWNER_REPORTED_NOT_INDEPENDENTLY_ATTESTED'},
  publicationD:{status:'NOT_SUBMITTED'}
 },
 candidate:{
  privateVideo:{status:'LOCAL_SYNTHETIC_WEBM_INTEGRITY_VERIFIED'},
  videoSourceMatch:'MATCHED_CLEAN_SOURCE',
  privateVideoDuration:{status:'ENCODED_MEDIA_UNDER_THREE_MINUTES',seconds:151.72},
  authorizedToPublish:false,
  devpostReceipt:'NOT_SUBMITTED',publicSourceRelease:'NOT_APPROVED'
 },
 freeze:{
  status:'PRIVATE_RELEASE_BLOCKED_NOT_SUBMITTED',commitSha:sha,
  sourceVerified:true,localJudgeTechnicalEvidenceVerified:true,
  privateSyntheticVideoTechnicallyVerified:true,
  publishingAuthorized:false,submissionEligible:false,
  externalProviderRequests:0,paymentPosts:0
 },
 receipt:{
  status:'LOCAL_PROVIDER_RESULT_RECORDED_NOT_FRESH_GET',
  ownerReportedLiveRunNotIndependentlyAttested:true,
  providerGetPerformedNow:false,providerPostPerformedNow:false,
  geminiCallPerformedNow:false,sqliteWritesPerformed:false,
  freshRemotePaymentProof:false,safeToRepeatPayment:false
 }
});

test('historical private SQLite consistency plus CI-class mock cannot grant provider replay or publication',()=>{
 const result=summarizeOwnerReview(fixture());
 assert.equal(result.localTechnicalReplay,'SYNTHETIC_PASS');
 assert.equal(result.localVideo,'SOURCE_MATCHED_UNDER_180_SECONDS');
 assert.equal(result.historicalOwnerEvidence,'PRIVATE_SQLITE_CONSISTENT_NOT_REMOTE_ATTESTATION');
 assert.equal(result.livePayPalAndGeminiJudgeReplay,'NOT_INDEPENDENTLY_VERIFIED');
 assert.equal(result.realProviderCalls,0);
 assert.equal(result.paymentPosts,0);
 assert.equal(result.privateSqliteWrites,0);
 assert.equal(result.privateIdentifiersExported,false);
 assert.equal(result.publishingAuthorized,false);
 assert.equal(result.devpostSubmitted,false);
 assert.ok(result.nextActions.includes('OWNER_WATCH_AND_REDACT_FINAL_VIDEO'));
});

test('missing or stale video chooses next minimal owner action without payment retries',()=>{
 const a=fixture();
 a.freeze.privateSyntheticVideoTechnicallyVerified=false;
 a.candidate.privateVideo={status:'LOCAL_VIDEO_NOT_RECORDED'};
 a.candidate.videoSourceMatch='VIDEO_SOURCE_UNVERIFIED';
 a.receipt.status='NO_LOCAL_ATTEMPT';
 const result=summarizeOwnerReview(a);
 assert.equal(result.localVideo,'NEEDS_REVIEW');
 assert.ok(result.nextActions.includes('RECORD_PRIVATE_OWNER_VIDEO_ONCE'));
 assert.ok(result.nextActions.includes('REVIEW_HISTORICAL_OWNER_RECEIPT_WITHOUT_RETRY'));
 assert.ok(!result.nextActions.some(x=>x.includes('CAPTURE')||x.includes('PAYMENT_POST')));
 const b=fixture();
 b.freeze.privateSyntheticVideoTechnicallyVerified=false;
 b.candidate.privateVideoDuration.status='FFPROBE_UNAVAILABLE_OR_FAILED';
 assert.ok(summarizeOwnerReview(b).nextActions.includes('CHECK_FFPROBE_AND_ENCODED_DURATION'));
});

test('fabricated private receipt or publication flags fail closed',()=>{
 for(const mutate of [
  a=>{a.receipt.providerGetPerformedNow=true},
  a=>{a.receipt.sqliteWritesPerformed=true},
  a=>{a.receipt.safeToRepeatPayment=true},
  a=>{a.receipt.status='LIVE_CAPTURE_REPLAYED'},
  a=>{a.judge.safety.paymentPosts=1},
  a=>{a.judge.publicationD.status='SUBMITTED'},
  a=>{a.candidate.authorizedToPublish=true},
  a=>{a.freeze.submissionEligible=true}
 ]){
   const val=fixture();mutate(val);
   assert.throws(()=>summarizeOwnerReview(val));
 }
});

test('injected one-command runner uses only existing local evidence paths, never video or external API',async()=>{
 const calls=[];
 const val=fixture();
 const result=await prepareOwnerReview({
   write:false,directory:'/owner-private-path-test',
   runJudge:async o=>{calls.push(['judge',o.write]);return val.judge},
   makeCandidate:async()=>{calls.push(['candidate']);return val.candidate},
   checkFreeze:async o=>{calls.push(['freeze',o.write]);return val.freeze},
   inspectReceipt:async o=>{calls.push(['receipt',o.directory]);return val.receipt}
 });
 assert.equal(result.status,'OWNER_LOCAL_REVIEW_PREPARED_NOT_SUBMITTED');
 assert.deepEqual(calls,[['judge',true],['candidate'],['freeze',true],
   ['receipt','/owner-private-path-test']]);
});

test('CLI on fresh synthetic HOME is reproducible, secret-safe and remains unsubmitted',()=>{
 const dir=mkdtempSync(join(tmpdir(),'paypal-owner-preflight-'));
 try{
  const script=fileURLToPath(new URL('../scripts/prepare_owner_review_brief.mjs',import.meta.url));
  const res=spawnSync(process.execPath,['--experimental-sqlite',script],{
    encoding:'utf8',timeout:30000,maxBuffer:1024*1024,
    env:{PATH:process.env.PATH||'',HOME:dir,USERPROFILE:dir}
  });
  assert.equal(res.status,0,res.stderr||res.stdout);
  const report=JSON.parse(res.stdout);
  assert.equal(report.status,'OWNER_LOCAL_REVIEW_PREPARED_NOT_SUBMITTED');
  assert.equal(report.originalPrivateReceiptStatus,'NO_LOCAL_ATTEMPT');
  assert.equal(report.localTechnicalReplay,'SYNTHETIC_PASS');
  assert.equal(report.livePayPalAndGeminiJudgeReplay,'NOT_INDEPENDENTLY_VERIFIED');
  assert.equal(report.devpostSubmitted,false);
  assert.equal(report.publishingAuthorized,false);
  assert.ok(report.nextActions.some(x=>x.includes('VIDEO')));
  const output=JSON.parse(readFileSync(new URL('../output/submission/owner_review_brief.json',import.meta.url),'utf8'));
  assert.deepEqual(report,output);
  assert.doesNotMatch(res.stdout,/PayerID|access_token|checkoutnow/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
