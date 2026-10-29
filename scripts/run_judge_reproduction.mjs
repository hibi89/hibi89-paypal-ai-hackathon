// Reviewer-safe one-command technical evidence. No credentials, paid services,
// public network, real provider requests, real payment or submission.
// Exercises the real loopback server and real orchestrator with injected fake APIs.
// This does NOT prove a connected live Gemini/PayPal browser transaction.
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';
import {runOfflineOperatorMvpSmoke} from '../src/offline_operator_mvp_smoke.mjs';
import {summarizeSyntheticJudgeTrace} from './build_judge_evidence_report.mjs';
import {inspectLocalCheckout,inspectTrackedTreeClean} from './prepare_submission_candidate.mjs';

const ROOT=resolve(fileURLToPath(new URL('../',import.meta.url)));
const DEST=new URL('../output/submission/judge_reproduction_receipt.json',import.meta.url);
const fail=(ok,code)=>{if(!ok)throw Error(code);};
const read=async(url,headers={})=>{
  const response=await fetch(url,{method:'GET',headers,redirect:'error',
    signal:AbortSignal.timeout(8000)});
  fail(response.status===200,'LOCAL_READ_FAILED');
  return response;
};
export function validateSyntheticMarketplaceResponse(value,vertical,expectedProfile){
  fail(value&&typeof value==='object'&&!Array.isArray(value),
    'LOCAL_MATCH_RESPONSE_INVALID');
  fail(value.vertical===vertical&&value.mode==='OFFLINE_SYNTHETIC_NO_AI'&&
    value.skillSource==='OFFLINE_REGEX'&&value.profileCount===3&&
    Array.isArray(value.profiles)&&value.profiles.length===3,
    'LOCAL_MARKETPLACE_NOT_SYNTHETIC');
  fail(value.profiles.every(x=>x.source==='SYNTHETIC_PROFILE')&&
    value.profiles[0].id===expectedProfile&&
    value.profiles[0].eligible===true&&
    value.profiles.every(x=>typeof x.id==='string'&&/^synthetic-[a-z]+$/.test(x.id)),
    'LOCAL_SYNTHETIC_CANDIDATE_INVALID');
  fail(value.price?.status==='DATA_INSUFFICIENT'&&
    value.price?.amountMinor===null&&
    value.paypal?.status==='NOT_CONNECTED'&&
    value.paypal?.capturePerformed===false,
    'LOCAL_MARKETPLACE_PAYMENT_PROOF_FALSE');
  return Object.freeze({vertical,mode:value.mode,profileCount:3,
    firstEligibleFictionalProfile:expectedProfile,
    realSellerPopulationVerified:false,realAiCalled:false,paymentCaptured:false});
}
async function inspectTwoLocalCategories(){
  const app=await startOfflineDemo();
  try{
    fail(/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(app.url),
      'LOCALHOST_ONLY_REQUIRED');
    const page=await (await read(app.url+'/')).text();
    fail(page.includes('marketplace-vertical')&&
      page.includes('OFFLINE'),'LOCAL_BROWSER_ENTRY_INVALID');
    const session=await (await read(app.url+'/demo/session')).json();
    fail(session.mode==='OFFLINE_MOCK'&&session.role==='owner'&&
      session.quoteId==='sample-project'&&
      typeof session.csrfToken==='string'&&session.csrfToken.length>10,
      'SYNTHETIC_OWNER_SESSION_REQUIRED');
    const url=app.url+'/api/quotes/sample-project';
    const before=(await (await read(url)).json()).quote;
    fail(before?.status==='PROPOSED'&&before.version===1,
      'LOCAL_QUOTE_NOT_INITIAL');
    const fixtures=[
      ['ai_work','Build an ecommerce website with PayPal checkout','synthetic-web'],
      ['general_services','Design a new logo and brand identity','synthetic-creative']
    ];
    const matched=[];
    for(const [vertical,brief,expected] of fixtures){
      // Only the loopback matcher is POSTed: NO payment, Gemini or PayPal POST.
      const response=await fetch(app.url+'/api/demo/marketplace',{
        method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),
        headers:{'content-type':'application/json',
          'x-csrf-token':session.csrfToken},
        body:JSON.stringify({vertical,brief})
      });
      fail(response.status===200,'LOCAL_MATCH_HTTP_FAILED');
      matched.push(validateSyntheticMarketplaceResponse(
        await response.json(),vertical,expected));
    }
    const payment=await fetch(url+'/payment',{method:'GET',redirect:'error',
      signal:AbortSignal.timeout(8000)});
    fail(payment.status===503,'OFFLINE_PAYMENT_MUST_REMAIN_DISABLED');
    const after=(await (await read(url)).json()).quote;
    fail(after.status==='PROPOSED'&&after.version===before.version&&
      after.approval===null,
      'MATCHING_MUST_NOT_APPROVE_OR_CHARGE');
    return Object.freeze({
      status:'ACTUAL_LOOPBACK_HTTP_VERIFIED_SYNTHETIC_ONLY',
      browserAutomationExecuted:false,realProviderCalls:0,
      localMarketplacePosts:2,paymentPosts:0,quoteMutations:0,
      paymentEndpointStatus:503,
      categories:Object.freeze(matched)
    });
  }finally{await app.close();}
}
export async function runJudgeReproduction({write=false}={}){
  const loopback=await inspectTwoLocalCategories();
  const trace=summarizeSyntheticJudgeTrace(await runOfflineOperatorMvpSmoke());
  fail(trace.verifiedFromThisCommand.actualProviderCalls===0&&
    trace.verifiedFromThisCommand.actualPaymentCaptured===false&&
    trace.evidence[2].status==='OWNER_REPORTED_NOT_INDEPENDENTLY_ATTESTED'&&
    trace.evidence[3].status==='NOT_SUBMITTED',
    'JUDGE_SOURCE_CLASSES_MUST_REMAIN_SEPARATE');
  const checkout=inspectLocalCheckout(ROOT);
  const report=Object.freeze({
    status:'JUDGE_OFFLINE_REPRODUCED_NOT_SUBMITTED',
    project:'Proofline — AI Work + Global Services',
    source:{commitSha:checkout.commitSha||null,branch:checkout.branch||null,
      trackedFilesClean:inspectTrackedTreeClean(ROOT),publicReleaseVerified:false},
    reproducibleA:loopback,
    reproducibleB:{
      status:trace.evidence[1].status,
      mode:'INJECTED_FAKE_GEMINI_AND_PAYPAL_ONLY',
      syntheticSkillSource:'INJECTED_FAKE_GEMINI',
      humanApprovedSyntheticAmount:'USD 1.50',
      fakePayPalCreatePosts:trace.verifiedFromThisCommand.fakePayPalOrderCreateRequests,
      fakePayPalCapturePosts:trace.verifiedFromThisCommand.fakePayPalCaptureRequests,
      fakeGetReconciliation:trace.verifiedFromThisCommand.fakeProviderGetReconciliation,
      fakeApiProtocol:trace.verifiedFromThisCommand.fakeApiProtocol,
      syntheticSqliteClaims:trace.verifiedFromThisCommand.persistedSyntheticSqliteClaims,
      actualProviderCalls:0,actualPaymentCaptured:false
    },
    historicalC:{status:'OWNER_REPORTED_NOT_INDEPENDENTLY_ATTESTED',
      note:'2026-10-28 owner-local Gemini and PayPal Sandbox report; no new provider request or private receipt read'},
    publicationD:{status:'NOT_SUBMITTED',publicVideoUrl:null,
      devpostReceipt:null,ownerApprovalForPublication:false},
    safety:{scope:'LOCALHOST_AND_INJECTED_FAKE_TRANSPORTS_ONLY',
      realGeminiCalls:0,realPayPalCalls:0,paymentPosts:0,
      realPaymentCaptured:false,ownerPrivateReceiptRead:false,
      publicUploads:0,submissionEligible:false}
  });
  if(write){
    mkdirSync(new URL('../output/submission/',import.meta.url),{recursive:true});
    writeFileSync(DEST,JSON.stringify(report,null,2)+'\n',
      {encoding:'utf8',flag:'w'});
  }
  return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const result=await runJudgeReproduction({write:true});
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }catch{
    process.stdout.write(JSON.stringify({
      status:'JUDGE_OFFLINE_REPRODUCTION_BLOCKED',
      realProviderCalls:'NOT_ATTESTED',submitted:false})+'\n');
    process.exitCode=1;
  }
}
