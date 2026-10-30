import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {decideRecording,runOwnerFinalFastpath}
  from '../scripts/run_owner_final_fastpath.mjs';

const fixture=(video='NEEDS_REVIEW',next='RECORD_PRIVATE_OWNER_VIDEO_ONCE')=>({
  status:'OWNER_LOCAL_REVIEW_PREPARED_NOT_SUBMITTED',
  sourceSha:'a'.repeat(40),localTechnicalReplay:'SYNTHETIC_PASS',
  localVideo:video,livePayPalAndGeminiJudgeReplay:'NOT_INDEPENDENTLY_VERIFIED',
  realProviderCalls:0,paymentPosts:0,publishingAuthorized:false,devpostSubmitted:false,
  nextActions:[next,'OWNER_WATCH_AND_REDACT_FINAL_VIDEO']
});
test('without explicit flag does not record or publish, even if video missing',async()=>{
  let calls=0;
  const result=await runOwnerFinalFastpath({
    review:async()=>fixture(),record:async()=>{calls++;return true;}
  });
  assert.equal(calls,0);
  assert.equal(result.recordingAttempted,false);
  assert.equal(result.recommendation,'PRIVATE_SYNTHETIC_RECORDING_NEEDED');
  assert.equal(result.publishingAuthorized,false);
  assert.equal(result.devpostSubmitted,false);
});
test('explicit flag records at most once only after clean technical replay',async()=>{
  let recordings=0,reviews=0;
  const result=await runOwnerFinalFastpath({
    recordIfMissing:true,review:async()=>++reviews===1?fixture():
      fixture('SOURCE_MATCHED_UNDER_180_SECONDS','OWNER_WATCH_AND_REDACT_FINAL_VIDEO'),
    record:async()=>{recordings++;return true;}
  });
  assert.equal(recordings,1);
  assert.equal(reviews,2);
  assert.equal(result.status,'PRIVATE_TECHNICAL_PACKET_READY_OWNER_REVIEW_REQUIRED');
  assert.equal(result.ownerMustWatchAndApproveVideo,true);
  assert.equal(result.ownerMustApproveReleaseAndDevpost,true);
  assert.equal(result.exactHeadGithubCiCheckedByThisCommand,false);
});
test('existing video or missing ffprobe never triggers unnecessary rerecording',async()=>{
  for(const input of [
    fixture('SOURCE_MATCHED_UNDER_180_SECONDS','OWNER_WATCH_AND_REDACT_FINAL_VIDEO'),
    fixture('NEEDS_REVIEW','CHECK_FFPROBE_AND_ENCODED_DURATION')
  ]){
    let count=0;
    const result=await runOwnerFinalFastpath({
      recordIfMissing:true,review:async()=>input,
      record:async()=>{count++;return true;}
    });
    assert.equal(count,0);
    assert.equal(result.recordingAttempted,false);
    assert.equal(result.publishingAuthorized,false);
  }
});
test('cannot record when synthetic checkout is unverified or media state is unsafe',async()=>{
  const notReady=fixture();
  notReady.localTechnicalReplay='NEEDS_REVIEW';
  const decision=decideRecording(notReady);
  assert.equal(decision,'LOCAL_SYNTHETIC_REPLAY_REQUIRED');
  let calls=0;
  const result=await runOwnerFinalFastpath({
    recordIfMissing:true,review:async()=>notReady,
    record:async()=>{calls++;return true;}
  });
  assert.equal(calls,0);
  assert.equal(result.status,'PRIVATE_FINAL_REVIEW_ACTION_REQUIRED');
  for(const mutate of [
    v=>{v.publishingAuthorized=true;},
    v=>{v.paymentPosts=1;},
    v=>{v.realProviderCalls=1;},
    v=>{v.devpostSubmitted=true;},
    v=>{v.livePayPalAndGeminiJudgeReplay='REAL_LIVE'},
    v=>{v.nextActions=null;}
  ]){
    const x=fixture();mutate(x);
    assert.throws(()=>decideRecording(x));
  }
});
test('failed recorder makes no synthetic-ready or publication claim',async()=>{
  let count=0;
  const status=await runOwnerFinalFastpath({
    recordIfMissing:true,review:async()=>{count++;return fixture();},
    record:async()=>false
  });
  assert.equal(count,1);
  assert.equal(status.recordingSucceeded,false);
  assert.equal(status.recommendation,'LOCAL_PRIVATE_RECORDING_FAILED');
  assert.equal(status.publishingAuthorized,false);
  assert.equal(status.status,'PRIVATE_FINAL_REVIEW_ACTION_REQUIRED');
});
test('CLI help/invalid arguments have no recording or private SQLite side effects',()=>{
  const file=fileURLToPath(new URL('../scripts/run_owner_final_fastpath.mjs',import.meta.url));
  for(const [args,exit] of [[['--help'],0],[['--invalid'],2],
      [['--record-if-missing','--help'],2]]){
    const run=spawnSync(process.execPath,['--experimental-sqlite',file,...args],{
      encoding:'utf8',timeout:8000,
      env:{PATH:process.env.PATH||'',HOME:'/does-not-exist',
        GEMINI_API_KEY:'NEVER_PRINT_KEY',PAYPAL_SANDBOX_CLIENT_SECRET:'NEVER_PRINT_KEY'}
    });
    assert.equal(run.status,exit,run.stderr||run.stdout);
    assert.doesNotMatch(run.stdout+run.stderr,/NEVER_PRINT_KEY/);
    assert.doesNotMatch(run.stdout,/RECORDING_FAILED|Preparing isolated Python/);
  }
  const packageJson=JSON.parse(readFileSync(new URL('../package.json',import.meta.url)));
  assert.equal(packageJson.scripts['owner:final:local'],
    'node --experimental-sqlite scripts/run_owner_final_fastpath.mjs');
});
