import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {basename} from 'node:path';
import {readFileSync} from 'node:fs';
import {inspectOwnerFinalBatchReadiness} from '../scripts/check_owner_final_batch_readiness.mjs';

const cmd=fileURLToPath(new URL('../scripts/check_owner_final_batch_readiness.mjs',import.meta.url));
const cases={
 'check_reviewer_repro.mjs':{status:0,data:{status:'REVIEWER_LOCAL_READY',
   ready:true,twoPartReproductionVerified:true,submissionEligible:false,
   externalProviderEvidence:false,providerNetworkCalls:0,paymentPostRequests:0}},
 'build_devpost_form_fields.mjs':{status:0,data:{status:'OWNER_REVIEW_REQUIRED_NOT_SUBMITTED',
   toolDescriptionsReady:true,output:'VALIDATED_NO_WRITE',publicYouTubeUrl:null,
   devpostReceiptUrl:null,ownerAuthorizedPublication:false,devpostSubmitted:false}},
 'check_owner_sandbox150_backend_gate.mjs':{status:0,data:{status:'DRY_RUN_NO_FILE_NO_NETWORK',
   quoteAmountMinor:150,currency:'USD',networkRequests:0,fileWritesPerformed:false,
   providerPostsPerformed:false,paymentAuthorized:false,productionReady:false,autoRetry:false}},
 'check_hosting_preflight.mjs':{status:2,data:{status:'DEPLOYMENT_BLOCKED',
   mayDeploy:false,blocked:true,external:{productionUrl:'NOT_TESTED',
    realPayPal:'NOT_TESTED',realAI:'NOT_TESTED'}}},
 'check_submission_evidence.mjs':{status:2,data:{
  status:'SUBMISSION_BLOCKED_EXTERNAL_EVIDENCE',submissionEligible:false,
  ownerSubmissionAuthorized:false,providerNetworkCalls:0,
  externalGates:[{name:'VIDEO_PUBLIC_LINK',status:'NOT_SUBMITTED'},
    {name:'DEVPOST_SUBMISSION_RECEIPT',status:'NOT_SUBMITTED'}]}}
};
function fakeRunner(patch={},calls=[]){
 return (_bin,args,opts)=>{
  const name=basename(args.find(x=>x.endsWith('.mjs')));
  calls.push({name,args,opts});
  const sample=patch[name]??cases[name];
  return {status:sample.status,stdout:JSON.stringify(sample.data)};
 };
}
test('one read-only command consolidates five real readiness sources and keeps release blocked',()=>{
 const calls=[];
 const report=inspectOwnerFinalBatchReadiness({runner:fakeRunner({},calls),
  environment:{PATH:'SAFE_ONLY'}});
 assert.equal(calls.length,5);
 assert.deepEqual(calls.map(x=>x.name),Object.keys(cases));
 for(const call of calls){
  assert.equal(call.opts.shell,false);
  assert.equal(call.opts.env.PATH,'SAFE_ONLY');
  assert.equal(call.opts.timeout,25000);
 }
 assert.equal(report.localChecksPassed,true);
 assert.equal(report.releaseHold,true);
 assert.equal(report.submissionEligible,false);
 assert.equal(report.productionReady,false);
 assert.equal(report.providerNetworkCallsByThisCommand,0);
 assert.equal(report.paymentPostsByThisCommand,0);
 assert.equal(report.privateOwnerFilesInspected,false);
 assert.equal(report.privateOwnerFilesWritten,false);
 assert.equal(report.persistentOutputArtifactsWritten,false);
 assert.equal(report.checks.length,5);
 assert.equal(report.nextOwnerBatch.length,4);
});
test('unexpected hosting success cannot ever unlock a release or skip safety gates',()=>{
 const calls=[];
 const fake={...cases['check_hosting_preflight.mjs'],status:0,
  data:{status:'READY',mayDeploy:true,blocked:false,external:{}}};
 const r=inspectOwnerFinalBatchReadiness({runner:fakeRunner({
  'check_hosting_preflight.mjs':fake},calls)});
 assert.equal(r.localChecksPassed,false);
 assert.equal(r.releaseHold,true);
 assert.equal(r.submissionEligible,false);
 assert.equal(calls.length,4);
 assert.equal(r.checks.at(-1).status,'FAILED_CLOSED');
});
test('untrusted provider proof or malformed child output fails closed without exposing it',()=>{
 const casesBad=[
  {...cases['check_reviewer_repro.mjs'],
   data:{...cases['check_reviewer_repro.mjs'].data,providerNetworkCalls:1}},
  {status:0,stdout:'SECRET_DO_NOT_ECHO',data:{}}
 ];
 for(const item of casesBad){
  const calls=[];
  const runner=(bin,args,opts)=>{
   calls.push(args);
   return item.stdout?{status:item.status,stdout:item.stdout}:
    {status:item.status,stdout:JSON.stringify(item.data)};
  };
  const r=inspectOwnerFinalBatchReadiness({runner});
  assert.equal(calls.length,1);
  assert.equal(r.localChecksPassed,false);
  assert.equal(JSON.stringify(r).includes('SECRET_DO_NOT_ECHO'),false);
  assert.equal(r.releaseHold,true);
 }
});
test('actual local reviewer and draft preflight runs without provider access or publishing',()=>{
 const run=spawnSync(process.execPath,[cmd,'--check'],{
  encoding:'utf8',timeout:90000,maxBuffer:1024*1024,
  env:{...process.env,PAYPAL_SANDBOX_CLIENT_SECRET:'MOCK_ONLY',
   GEMINI_API_KEY:'MOCK_ONLY'}
 });
 assert.equal(run.status,0,run.stderr+'\n'+run.stdout);
 const parsed=JSON.parse(run.stdout);
 assert.equal(parsed.localChecksPassed,true);
 assert.equal(parsed.checks.length,5);
 assert.equal(parsed.releaseHold,true);
 assert.equal(parsed.publicVideoApproved,false);
 assert.equal(parsed.devpostSubmitted,false);
 assert.equal(parsed.providerNetworkCallsByThisCommand,0);
 assert.doesNotMatch(run.stdout,/MOCK_ONLY/);
 assert.equal(parsed.checks[3].id,'HOSTING_RELEASE_HOLD');
 assert.equal(parsed.checks[4].id,'SUBMISSION_RELEASE_HOLD');
});
test('CLI rejects all actions except --check, without executing preflight',()=>{
 for(const flag of ['--execute','--inspect','--publish']){
  const p=spawnSync(process.execPath,[cmd,flag],{encoding:'utf8',timeout:5000});
  assert.equal(p.status,2);
  assert.equal(p.stdout,'');
  assert.match(p.stderr,/OWNER_BATCH_PREFLIGHT_CHECK_ONLY/);
 }
 const source=readFileSync(cmd,'utf8');
 assert.doesNotMatch(source,/fetch\s*\(/);
 assert.doesNotMatch(source,/set-cookie/);
});
