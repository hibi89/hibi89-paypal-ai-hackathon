// Owner-PC release readiness summary. No real API, payment, video recording,
// publication, network tunnel, private database writes, or secret export.
// Runs existing local loopback + fake transports, reviews an immutable private
// SQLite receipt (if present), and checks the current locally recorded WebM.
import {mkdirSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectOwnerMvpReceipt} from '../src/owner_mvp_receipt.mjs';
import {runJudgeReproduction} from './run_judge_reproduction.mjs';
import {prepareSubmissionCandidate} from './prepare_submission_candidate.mjs';
import {checkPrivateFreeze} from './check_private_freeze.mjs';

const SUMMARY=new URL('../output/submission/owner_review_brief.json',import.meta.url);
const SAFE_RECEIPT_STATES=new Set([
  'LOCAL_PROVIDER_RESULT_RECORDED_NOT_FRESH_GET',
  'LOCAL_EVIDENCE_REVIEW_REQUIRED','NO_LOCAL_ATTEMPT'
]);
const insist=(condition,code)=>{if(!condition)throw Error(code)};
export function summarizeOwnerReview({judge,candidate,freeze,receipt}={}){
  insist(judge?.status==='JUDGE_OFFLINE_REPRODUCED_NOT_SUBMITTED'&&
    judge?.reproducibleB?.actualProviderCalls===0&&
    judge?.safety?.paymentPosts===0&&judge?.safety?.publicUploads===0&&
    judge?.historicalC?.status==='OWNER_REPORTED_NOT_INDEPENDENTLY_ATTESTED'&&
    judge?.publicationD?.status==='NOT_SUBMITTED','LOCAL_REPLAY_NOT_VERIFIED');
  insist(freeze?.status==='PRIVATE_RELEASE_BLOCKED_NOT_SUBMITTED'&&
    freeze?.publishingAuthorized===false&&freeze?.submissionEligible===false&&
    freeze?.externalProviderRequests===0&&freeze?.paymentPosts===0,
    'PRIVATE_FREEZE_NOT_FAIL_CLOSED');
  insist(candidate?.authorizedToPublish===false&&
    candidate?.devpostReceipt==='NOT_SUBMITTED'&&
    candidate?.publicSourceRelease==='NOT_APPROVED','PRIVATE_CANDIDATE_RELEASE_CLAIM');
  insist(SAFE_RECEIPT_STATES.has(receipt?.status)&&
    receipt?.providerGetPerformedNow===false&&
    receipt?.providerPostPerformedNow===false&&
    receipt?.geminiCallPerformedNow===false&&
    receipt?.sqliteWritesPerformed===false&&
    receipt?.freshRemotePaymentProof===false&&
    receipt?.safeToRepeatPayment===false&&
    receipt?.ownerReportedLiveRunNotIndependentlyAttested===true,
    'PRIVATE_RECEIPT_UNSAFE_OR_UNCLASSIFIED');
  const localSourceReady=freeze.sourceVerified===true&&
    freeze.localJudgeTechnicalEvidenceVerified===true;
  const technicalVideo=freeze.privateSyntheticVideoTechnicallyVerified===true;
  const receiptStatus=receipt.status;
  const needVideo=!technicalVideo;
  const nextActions=[];
  if(!localSourceReady)nextActions.push('VERIFY_CLEAN_GIT_CHECKOUT_AND_REPLAY');
  if(needVideo){
    const name=candidate?.privateVideo?.status;
    if(name==='LOCAL_VIDEO_NOT_RECORDED')
      nextActions.push('RECORD_PRIVATE_OWNER_VIDEO_ONCE');
    else if(candidate?.videoSourceMatch!=='MATCHED_CLEAN_SOURCE')
      nextActions.push('RECORD_VIDEO_FROM_CURRENT_CLEAN_SHA');
    else if(candidate?.privateVideoDuration?.status!=='ENCODED_MEDIA_UNDER_THREE_MINUTES')
      nextActions.push('CHECK_FFPROBE_AND_ENCODED_DURATION');
    else nextActions.push('REVIEW_LOCAL_VIDEO_EVIDENCE');
  }
  if(receiptStatus!=='LOCAL_PROVIDER_RESULT_RECORDED_NOT_FRESH_GET')
    nextActions.push('REVIEW_HISTORICAL_OWNER_RECEIPT_WITHOUT_RETRY');
  nextActions.push('OWNER_WATCH_AND_REDACT_FINAL_VIDEO',
    'OWNER_DECIDE_PUBLIC_SOURCE_LICENSE_AND_REAL_PROVIDER_JUDGE_PATH',
    'OWNER_AUTHORIZE_PUBLIC_YOUTUBE_AND_DEVPOST_SEPARATELY');
  return Object.freeze({
    status:'OWNER_LOCAL_REVIEW_PREPARED_NOT_SUBMITTED',
    sourceSha:freeze.commitSha||null,
    localTechnicalReplay:localSourceReady?'SYNTHETIC_PASS':'NEEDS_REVIEW',
    localVideo:technicalVideo?'SOURCE_MATCHED_UNDER_180_SECONDS':'NEEDS_REVIEW',
    historicalOwnerEvidence:receiptStatus==='LOCAL_PROVIDER_RESULT_RECORDED_NOT_FRESH_GET'?
      'PRIVATE_SQLITE_CONSISTENT_NOT_REMOTE_ATTESTATION':
      'OWNER_REPORTED_HISTORY_NOT_LOCALLY_RECONFIRMED',
    originalPrivateReceiptStatus:receiptStatus,
    livePayPalAndGeminiJudgeReplay:'NOT_INDEPENDENTLY_VERIFIED',
    realProviderCalls:0,paymentPosts:0,privateSqliteWrites:0,
    privateIdentifiersExported:false,publicUploads:0,devpostSubmitted:false,
    publishingAuthorized:false,
    nextActions:Object.freeze(nextActions)
  });
}
export async function prepareOwnerReview({
  runJudge=runJudgeReproduction,
  makeCandidate=prepareSubmissionCandidate,
  checkFreeze=checkPrivateFreeze,
  inspectReceipt=inspectOwnerMvpReceipt,
  directory=join(homedir(),'.paypal-ai-mvp-private'),
  write=true
}={}){
  // Never start video recording or issue Gemini/PayPal requests here.
  const judge=await runJudge({write:true});
  const candidate=await makeCandidate();
  const freeze=await checkFreeze({write:true});
  const receipt=await inspectReceipt({directory});
  const result=summarizeOwnerReview({judge,candidate,freeze,receipt});
  if(write){
    mkdirSync(new URL('../output/submission/',import.meta.url),{recursive:true});
    writeFileSync(SUMMARY,JSON.stringify(result,null,2)+'\n',{encoding:'utf8'});
  }
  return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length!==2){
    process.stdout.write(JSON.stringify({status:'OWNER_REVIEW_REJECTED_ARGUMENTS',
      realProviderCalls:0,paymentPosts:0,publishingAuthorized:false})+'\n');
    process.exitCode=2;
  }else{
    try{
      const result=await prepareOwnerReview();
      process.stdout.write(JSON.stringify(result,null,2)+'\n');
    }catch{
      process.stdout.write(JSON.stringify({status:'OWNER_LOCAL_REVIEW_BLOCKED',
        realProviderCalls:'NOT_ATTESTED',paymentPosts:'NOT_ATTESTED',
        publishingAuthorized:false,devpostSubmitted:false})+'\n');
      process.exitCode=1;
    }
  }
}
