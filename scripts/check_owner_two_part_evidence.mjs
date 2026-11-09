// Read-only owner-side comparison of EXISTING private Part1/Part2 SQLite data.
// Default = legacy $270 flow; explicitly opt into the quote-bound $1.50 pilot.
// No credentials, no HTTP, no provider GET/POST, no SQLite creation or writes.
import {homedir} from 'node:os';
import {join} from 'node:path';
import {argv,env,stdout} from 'node:process';
import {inspectOwnerTwoPartEvidence}
 from '../src/owner_private_two_part_evidence.mjs';
import {resolveOwnerSandbox150QuoteScope}
 from '../src/owner_private_a2a_quote_binding.mjs';
import {inspectOwnerSandbox150CrossPartReadiness}
 from '../src/owner_private_crosspart_readiness.mjs';

const args=argv.slice(2);
const sandbox=args.length===1&&args[0]==='--sandbox-pilot-150';
const exact=args.length===0||sandbox;
const output=(status,fields={})=>stdout.write(JSON.stringify({
 status,networkRequests:0,fileWritesPerformed:false,paymentAuthorized:false,
 ...fields
})+'\n');

const base=join(homedir(),'.paypal-ai-pilot-private');
let pilotScope=null;
if(exact&&sandbox){
 try{pilotScope=resolveOwnerSandbox150QuoteScope({
  environment:env,privateDirectory:base
 })}catch{/* Missing or conflicting private identity: never inspect data. */}
}
if(!exact){
 output('READ_ONLY_UNSUPPORTED_ARGUMENTS');
 process.exitCode=2;
}else if(sandbox&&!pilotScope){
 output('PRIVATE_SANDBOX_QUOTE_SCOPE_REQUIRED');
 process.exitCode=2;
}else{
 try{
  if(sandbox){
   // This pilot uses a NEW independent Part1 quote, NOT the historical
   // receipt in ~/.paypal-ai-mvp-private. Amount equality with that old
   // payment is never proof of a shared quote or transaction.
   const view=inspectOwnerSandbox150CrossPartReadiness({
    privateDirectory:base,quoteScope:pilotScope,
    part2Filename:join(base,'part2-owner-sandbox150.sqlite'),
    budgetFilename:join(base,'part2-owner-sandbox150-quota.sqlite')
   });
   output('OWNER_SANDBOX150_LOCAL_SAME_QUOTE_REVIEW_READY_NOT_PAYMENT',{
    part1:{status:'OWNER_LOCAL_150_QUOTE_APPROVED',
     quoteId:view.quoteId,quoteVersion:view.quoteVersion,
     quoteFingerprint:view.quoteFingerprint,amountMinor:view.amountMinor},
    part2:{status:'PRIVATE_A2A_SQLITE_RESULT_NOT_GEMINI_ATTESTED',
     transcriptSha256:view.transcriptSha256,consentId:view.consentId,
     consentRevision:view.consentRevision},
    locallySameQuoteBound:true,sameTransactionProven:false,
    crossPartReviewLinked:false,trustedBuyerSessionVerified:false,
    sharedMerchantAuthorityProven:false,
    livePayPalVerifiedNow:false,liveGeminiVerifiedNow:false,
    paypalCreatePerformed:false,paypalCapturePerformed:false,
    geminiPostPerformed:false
   });
  }else{
   const result=inspectOwnerTwoPartEvidence({
    ownerDirectory:join(homedir(),'.paypal-ai-mvp-private'),
    part2Filename:join(base,'part2-owner-lab.sqlite'),
    budgetFilename:join(base,'part2-owner-quota.sqlite'),
    scope:{actor:'operator_owner',merchant:'fictional_merchant',
     job:'part2_demo_once'},sandboxPilotQuoteId:null
   });
   stdout.write(JSON.stringify(result)+'\n');
   if(['BOTH_PARTS_NEED_REVIEW','PART1_NOT_VERIFIED','PART2_NOT_VERIFIED']
    .includes(result.status))process.exitCode=2;
  }
 }catch(e){
  output(sandbox?'OWNER_SANDBOX150_LOCAL_REVIEW_NOT_READY':
   'PRIVATE_TWO_PART_EVIDENCE_REVIEW_REQUIRED',{
    ...(sandbox?{reasonCode:typeof e?.code==='string'&&
     /^OWNER_[A-Z0-9_]{3,100}$/.test(e.code)?
      e.code:'PRIVATE_REVIEW_UNVERIFIED'}:{})
  });
  process.exitCode=2;
 }
}
