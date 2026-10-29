// Safe internal freeze gate. Cannot authorize release or attest external providers.
// Only reads gitignored synthetic evidence and the current tracked Git checkout.
import {readFileSync,existsSync,lstatSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectLocalCheckout,inspectTrackedTreeClean} from './prepare_submission_candidate.mjs';
const ROOT=resolve(fileURLToPath(new URL('../',import.meta.url)));
const shaOk=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const same=x=>x===true;
const reportFile=name=>new URL('../output/submission/'+name,import.meta.url);
const safeRead=name=>{
  const url=reportFile(name);
  try{
    if(!existsSync(url))return null;
    const stat=lstatSync(url);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size<2||stat.size>256*1024)return null;
    const data=JSON.parse(readFileSync(url,'utf8'));
    return data&&typeof data==='object'&&!Array.isArray(data)?data:null;
  }catch{return null}
};
export function assessPrivateFreeze({checkout,clean,judge,candidate}={}){
  const sha=shaOk(checkout?.commitSha)?checkout.commitSha:null;
  const sourceValid=sha!==null&&same(clean);
  const judgeValid=sourceValid&&
    judge?.source?.commitSha===sha&&same(judge?.source?.trackedFilesClean)&&
    judge.status==='JUDGE_OFFLINE_REPRODUCED_NOT_SUBMITTED'&&
    judge.reproducibleA?.status==='ACTUAL_LOOPBACK_HTTP_VERIFIED_SYNTHETIC_ONLY'&&
    judge.reproducibleA?.categories?.length===2&&
    judge.reproducibleA.categories[0].vertical==='ai_work'&&
    judge.reproducibleA.categories[1].vertical==='general_services'&&
    judge.reproducibleA?.paymentEndpointStatus===503&&
    judge.reproducibleA?.quoteMutations===0&&
    judge.reproducibleB?.status==='VERIFIED_WITH_FAKE_INJECTED_TRANSPORT'&&
    judge.reproducibleB?.fakeGetReconciliation===true&&
    judge.historicalC?.status==='OWNER_REPORTED_NOT_INDEPENDENTLY_ATTESTED'&&
    judge.publicationD?.status==='NOT_SUBMITTED'&&
    judge.safety?.scope==='LOCALHOST_AND_INJECTED_FAKE_TRANSPORTS_ONLY'&&
    judge.safety?.realGeminiCalls===0&&judge.safety?.realPayPalCalls===0&&
    judge.safety?.paymentPosts===0&&
    judge.safety?.publicUploads===0&&
    judge.safety?.submissionEligible===false;
  const videoValid=sourceValid&&
    candidate?.localCheckout?.commitSha===sha&&
    candidate?.videoSourceMatch==='MATCHED_CLEAN_SOURCE'&&
    candidate?.privateVideo?.sourceCommitSha===sha&&
    candidate?.privateVideo?.sourceTrackedClean===true&&
    candidate?.privateVideoDuration?.status==='ENCODED_MEDIA_UNDER_THREE_MINUTES'&&
    candidate?.privateVideoDuration?.seconds>0&&
    candidate.privateVideoDuration.seconds<180&&
    candidate?.technicalVideoReady===true&&
    candidate?.ownerReviewReady===true&&
    candidate?.authorizedToPublish===false&&
    candidate?.devpostReceipt==='NOT_SUBMITTED'&&
    candidate?.publicSourceRelease==='NOT_APPROVED';
  const blockers=[];
  if(!sourceValid)blockers.push('CHECKOUT_NOT_VERIFIED_OR_TRACKED_DIRTY');
  if(!judgeValid)blockers.push('JUDGE_LOCAL_REPLAY_NEEDS_EXACT_SHA_VERIFICATION');
  if(!videoValid)blockers.push('OWNER_VIDEO_NOT_PROVEN_SOURCE_MATCHED_AND_UNDER_180_SECONDS');
  // Deliberately unfulfillable automatically. Owner and platform approvals
  // must never be inferred from locally writable files.
  blockers.push('EXACT_HEAD_GITHUB_ACTIONS_REVIEW_REQUIRED',
    'OWNER_EDITORIAL_AND_PRIVACY_APPROVAL_REQUIRED',
    'PUBLIC_REPO_LICENSE_AND_RELEASE_APPROVAL_REQUIRED',
    'PUBLIC_YOUTUBE_URL_REQUIRED',
    'DEVPOST_RECEIPT_REQUIRED');
  return Object.freeze({
    status:'PRIVATE_RELEASE_BLOCKED_NOT_SUBMITTED',
    project:'Proofline — PayPal + AI Hackathon',
    commitSha:sha,
    sourceVerified:sourceValid,
    localJudgeTechnicalEvidenceVerified:judgeValid,
    privateSyntheticVideoTechnicallyVerified:videoValid,
    externalRealProviderEvidenceIndependentlyVerified:false,
    externalProviderRequests:0,
    paymentPosts:0,
    publishingAuthorized:false,
    submissionEligible:false,
    blockers:Object.freeze(blockers)
  });
}
export function checkPrivateFreeze({write=false}={}){
  const checkout=inspectLocalCheckout(ROOT);
  const report=assessPrivateFreeze({
    checkout,clean:inspectTrackedTreeClean(ROOT),
    judge:safeRead('judge_reproduction_receipt.json'),
    candidate:safeRead('submission_candidate_status.json')
  });
  if(write){
    const dir=new URL('../output/submission/',import.meta.url);
    mkdirSync(dir,{recursive:true});
    writeFileSync(reportFile('private_freeze_status.json'),
      JSON.stringify(report,null,2)+'\n',{encoding:'utf8',flag:'w'});
  }
  return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{process.stdout.write(JSON.stringify(checkPrivateFreeze({write:true}),null,2)+'\n')}
  catch{
    process.stdout.write(JSON.stringify({status:'PRIVATE_FREEZE_CHECK_FAILED',
      publishingAuthorized:false,submissionEligible:false})+'\n');
    process.exitCode=1;
  }
}
