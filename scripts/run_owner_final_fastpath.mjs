// Owner-PC-only final technical review. Does not release, publish, charge, or call providers.
// Optional explicit flag may install pinned free local recording tools, and record a
// wholly SYNTHETIC localhost walkthrough. No private receipt or buyer data is exported.
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareOwnerReview} from './prepare_owner_review_brief.mjs';

const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const safeEnvironment=()=>Object.fromEntries(Object.entries(process.env).filter(
  ([name])=>!/(SECRET|TOKEN|PASSWORD|CREDENTIAL|API_KEY|CLIENT_ID|MERCHANT_ID|GEMINI|PAYPAL|OPENAI|AUTHORIZATION|PRIVATE_KEY|NODE_OPTIONS)/i.test(name)
));
const recordPrivateSyntheticVideo=()=>{
  const result=spawnSync(process.execPath,['scripts/prepare_and_record_video.mjs'],{
    cwd:root,env:safeEnvironment(),shell:false,windowsHide:true,
    stdio:'inherit',timeout:240000
  });
  return result.error==null&&result.status===0;
};
export function decideRecording(summary){
  if(summary?.status!=='OWNER_LOCAL_REVIEW_PREPARED_NOT_SUBMITTED'||
     summary?.publishingAuthorized!==false||
     summary?.devpostSubmitted!==false||
     summary?.realProviderCalls!==0||
     summary?.paymentPosts!==0||
     summary?.livePayPalAndGeminiJudgeReplay!=='NOT_INDEPENDENTLY_VERIFIED'||
     !Array.isArray(summary?.nextActions))
    throw Error('UNTRUSTED_OWNER_REVIEW_SUMMARY');
  // Without immutable, valid source provenance, neither a pre-existing WebM
  // nor a fresh capture can be represented as a release-review candidate.
  if(!/^[a-f0-9]{40}$/.test(summary.sourceSha||''))
    return 'SOURCE_SHA_UNVERIFIED';
  if(summary.localVideo==='SOURCE_MATCHED_UNDER_180_SECONDS')
    return 'EXISTING_VIDEO_TECHNICALLY_READY';
  if(summary.localVideo!=='NEEDS_REVIEW')
    throw Error('UNKNOWN_PRIVATE_VIDEO_STATUS');
  if(summary.localTechnicalReplay!=='SYNTHETIC_PASS')
    return 'LOCAL_SYNTHETIC_REPLAY_REQUIRED';
  if(summary.nextActions.includes('RECORD_PRIVATE_OWNER_VIDEO_ONCE')||
     summary.nextActions.includes('RECORD_VIDEO_FROM_CURRENT_CLEAN_SHA'))
    return 'PRIVATE_SYNTHETIC_RECORDING_NEEDED';
  if(summary.nextActions.includes('CHECK_FFPROBE_AND_ENCODED_DURATION'))
    return 'INDEPENDENT_MEDIA_DURATION_CHECK_NEEDED';
  return 'OWNER_VIDEO_EVIDENCE_REVIEW_NEEDED';
}
export async function runOwnerFinalFastpath({
  recordIfMissing=false,review=prepareOwnerReview,record=recordPrivateSyntheticVideo
}={}){
  let summary=await review();
  let recommendation=decideRecording(summary);
  const initialSourceSha=summary.sourceSha;
  let recordingAttempted=false,recordingSucceeded=false;
  // Never record automatically on plain invocation. An explicit opt-in
  // is still insufficient unless the exact clean source replay passed.
  if(recordIfMissing&&recommendation==='PRIVATE_SYNTHETIC_RECORDING_NEEDED'){
    recordingAttempted=true;
    recordingSucceeded=await record()===true;
    if(recordingSucceeded){
      summary=await review(); // Includes a fresh ffprobe/source/media check.
      // Even if both independently look clean, do not approve a recording
      // when the source SHA changed across the recording boundary.
      recommendation=summary.sourceSha===initialSourceSha?
        decideRecording(summary):'SOURCE_CHANGED_DURING_PRIVATE_RECORDING';
    }else recommendation='LOCAL_PRIVATE_RECORDING_FAILED';
  }
  const technicalReady=/^[a-f0-9]{40}$/.test(summary.sourceSha||'')&&
    summary.localTechnicalReplay==='SYNTHETIC_PASS'&&
    recommendation==='EXISTING_VIDEO_TECHNICALLY_READY';
  return Object.freeze({
    status:technicalReady?'PRIVATE_TECHNICAL_PACKET_READY_OWNER_REVIEW_REQUIRED':
      'PRIVATE_FINAL_REVIEW_ACTION_REQUIRED',
    sourceSha:typeof summary.sourceSha==='string'?summary.sourceSha:null,
    localReplay:summary.localTechnicalReplay,
    localVideo:summary.localVideo,
    recommendation,recordingAttempted,recordingSucceeded,
    toolkitDownloadsPossible:recordingAttempted,
    liveProviderCalls:0,paymentPosts:0,publicUploads:0,
    publishingAuthorized:false,devpostSubmitted:false,
    ownerMustWatchAndApproveVideo:true,
    ownerMustApproveReleaseAndDevpost:true,
    exactHeadGithubCiCheckedByThisCommand:false
  });
}
const calledAsCli=process.argv[1]&&
  resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(calledAsCli){
  const args=process.argv.slice(2);
  if(args.length===1&&(args[0]==='--help'||args[0]==='-h')){
    process.stdout.write(
      'Usage: npm run owner:final:local -- [--record-if-missing]\n'+
      'Default: local synthetic replay, immutable/read-only historical receipt, source and video checks.\n'+
      '--record-if-missing: opt in to ONE private offline recording if needed.\n'+
      'May download free Playwright/ffmpeg tooling; never calls Gemini/PayPal, publishes or submits.\n'
    );
  }else if(args.length>1||(args.length===1&&args[0]!=='--record-if-missing')){
    process.stdout.write(JSON.stringify({status:'INVALID_OWNER_FINAL_FLAGS',
      publishingAuthorized:false,devpostSubmitted:false})+'\n');
    process.exitCode=2;
  }else{
    try{
      const outcome=await runOwnerFinalFastpath({
        recordIfMissing:args[0]==='--record-if-missing'
      });
      process.stdout.write(JSON.stringify(outcome,null,2)+'\n');
      if(outcome.status!=='PRIVATE_TECHNICAL_PACKET_READY_OWNER_REVIEW_REQUIRED')
        process.exitCode=2;
    }catch{
      // Never print raw private SQLite/protocol data, stack, paths or keys.
      process.stdout.write(JSON.stringify({status:'OWNER_FINAL_REVIEW_FAILED_CLOSED',
        publishingAuthorized:false,devpostSubmitted:false,
        providerCalls:'NOT_ATTESTED',paymentPosts:'NOT_ATTESTED'})+'\n');
      process.exitCode=1;
    }
  }
}
