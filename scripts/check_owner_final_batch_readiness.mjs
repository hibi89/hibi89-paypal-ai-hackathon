// Local, no-provider owner handoff preflight. Never sends credentials, orders,
// captures, AI prompts, videos, or Devpost data. Only the reviewer smoke test
// creates a temporary 127.0.0.1 fixture (deleted by the existing runner).
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';

const ROOT=resolve(fileURLToPath(new URL('../',import.meta.url)));
const STEPS=Object.freeze([
 {id:'REVIEWER_LOOPBACK',script:'check_reviewer_repro.mjs',
  flags:['--experimental-sqlite'],exit:0,
  ok:r=>r.status==='REVIEWER_LOCAL_READY'&&r.ready===true&&
   r.twoPartReproductionVerified===true&&r.submissionEligible===false&&
   r.externalProviderEvidence===false&&r.providerNetworkCalls===0&&
   r.paymentPostRequests===0},
 {id:'DEVPOST_EDITABLE_DRAFT',script:'build_devpost_form_fields.mjs',
  args:['--check'],exit:0,
  ok:r=>r.status==='OWNER_REVIEW_REQUIRED_NOT_SUBMITTED'&&
   r.toolDescriptionsReady===true&&r.output==='VALIDATED_NO_WRITE'&&
   r.publicYouTubeUrl===null&&r.devpostReceiptUrl===null&&
   r.ownerAuthorizedPublication===false&&r.devpostSubmitted===false},
 {id:'QUOTE_150_DRY_RUN',script:'check_owner_sandbox150_backend_gate.mjs',exit:0,
  ok:r=>r.status==='DRY_RUN_NO_FILE_NO_NETWORK'&&r.quoteAmountMinor===150&&
   r.currency==='USD'&&r.networkRequests===0&&
   r.fileWritesPerformed===false&&r.providerPostsPerformed===false&&
   r.paymentAuthorized===false&&r.productionReady===false&&r.autoRetry===false},
 {id:'HOSTING_RELEASE_HOLD',script:'check_hosting_preflight.mjs',exit:2,
  ok:r=>r.status==='DEPLOYMENT_BLOCKED'&&r.mayDeploy===false&&
   r.blocked===true&&r.external?.productionUrl==='NOT_TESTED'&&
   r.external?.realPayPal==='NOT_TESTED'&&r.external?.realAI==='NOT_TESTED'},
 {id:'SUBMISSION_RELEASE_HOLD',script:'check_submission_evidence.mjs',exit:2,
  ok:r=>r.status==='SUBMISSION_BLOCKED_EXTERNAL_EVIDENCE'&&
   r.submissionEligible===false&&r.ownerSubmissionAuthorized===false&&
   r.providerNetworkCalls===0&&
   r.externalGates?.some(x=>x.name==='VIDEO_PUBLIC_LINK'&&x.status==='NOT_SUBMITTED')&&
   r.externalGates?.some(x=>x.name==='DEVPOST_SUBMISSION_RECEIPT'&&x.status==='NOT_SUBMITTED')}
]);
function safeEnvironment(){
 return {PATH:process.env.PATH??'',...(process.platform==='win32'?
  {SystemRoot:process.env.SystemRoot??'',TEMP:process.env.TEMP??'',
   TMP:process.env.TMP??''}:{})};
}
function result(checks,valid){
 return Object.freeze({
  mode:'WORKNOVA_OWNER_BATCH_LOCAL_READINESS_ONLY',
  status:valid?'LOCAL_REVIEW_PREPARED_EXTERNAL_GATES_STILL_BLOCKED':
   'LOCAL_PREFLIGHT_FAILED_EXTERNAL_GATES_STILL_BLOCKED',
  localChecksPassed:valid,releaseHold:true,submissionEligible:false,
  productionReady:false,publicVideoApproved:false,devpostSubmitted:false,
  realProviderEvidence:'NOT_PERFORMED',
  providerNetworkCallsByThisCommand:0,paymentPostsByThisCommand:0,
  privateOwnerFilesInspected:false,privateOwnerFilesWritten:false,
  temporaryLoopbackFixtureUsed:true,persistentOutputArtifactsWritten:false,
  sourceVerification:'LOCAL_WORKTREE_ONLY_NOT_REMOTE_HEAD_ATTESTED',
  checks:Object.freeze(checks),
  nextOwnerBatch:Object.freeze([
   'VERIFY_REAL_OIDC_BUYER_AND_SANDBOX_MERCHANT_PRIVATELY',
   'SEPARATELY_APPROVE_GEMINI_AND_SANDBOX_CREATE_CAPTURE_ACTIONS',
   'VERIFY_FINAL_UNDER_180S_FILM_AND_APPROVE_YOUTUBE_PUBLICATION',
   'APPROVE_ENGLISH_DEVPOST_AND_VERIFY_SUBMISSION_RECEIPT'
  ])
 });
}
export function inspectOwnerFinalBatchReadiness({
 runner=spawnSync,root=ROOT,environment=safeEnvironment()
}={}){
 const checks=[];
 for(const spec of STEPS){
  const args=[...(spec.flags??[]),join(root,'scripts',spec.script),...(spec.args??[])];
  let child;
  try{child=runner(process.execPath,args,{
   cwd:root,encoding:'utf8',shell:false,windowsHide:true,
   timeout:25000,maxBuffer:64*1024,env:environment
  })}catch{}
  let payload;
  try{
   if(child?.status===spec.exit&&typeof child.stdout==='string'&&
      child.stdout.length<64*1024)payload=JSON.parse(child.stdout);
  }catch{}
  const ok=payload!==undefined&&spec.ok(payload)===true;
  checks.push(Object.freeze({id:spec.id,
   status:ok?'EXPECTED_LOCAL_RESULT_CONFIRMED':'FAILED_CLOSED'}));
  if(!ok)break;
 }
 return result(checks,checks.length===STEPS.length&&
  checks.every(c=>c.status==='EXPECTED_LOCAL_RESULT_CONFIRMED'));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 if(args.length>1||(args.length===1&&args[0]!=='--check')){
  console.error('OWNER_BATCH_PREFLIGHT_CHECK_ONLY');
  process.exitCode=2;
 }else{
  const report=inspectOwnerFinalBatchReadiness();
  console.log(JSON.stringify(report,null,2));
  if(!report.localChecksPassed)process.exitCode=1;
 }
}
