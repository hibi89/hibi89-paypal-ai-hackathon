// Private command: dry-run unless exact owner action and private TTY.
// NEVER contacts Gemini/PayPal or mutates the historical checkout database.
import {argv,env,stdin,stderr,stdout} from 'node:process';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {resolveOwnerSandbox150QuoteScope}
 from '../src/owner_private_a2a_quote_binding.mjs';
import {inspectOwnerSandbox150ApprovalReadiness,approveOwnerSandbox150Quote}
 from '../src/owner_sandbox_150_quote_approval.mjs';

const args=argv.slice(2);
const mode=args.length===1?args[0]:null;
const write=(status,fields={})=>stdout.write(JSON.stringify({
 status,mode:'OWNER_PRIVATE_EXACT_150_QUOTE_APPROVAL',
 networkRequests:0,paymentAuthorized:false,paypalCreatePerformed:false,
 paypalCapturePerformed:false,...fields
})+'\n');
if(!['--review','--approve-exact-150'].includes(mode)){
 write('DRY_RUN_NO_DISK_NO_NETWORK',{
  reviewOnlyFlag:'--review',explicitApprovalFlag:'--approve-exact-150',
  approvalRequiresPrivateTTY:true,approvalRequiresTypedQuoteId:true
 });
}else if(mode==='--approve-exact-150'&&(!stdin.isTTY||!stderr.isTTY)){
 write('PRIVATE_TTY_REQUIRED',{fileWritesPerformed:false});
 process.exitCode=2;
}else{
 const base=join(homedir(),'.paypal-ai-pilot-private');
 try{
  const quoteScope=resolveOwnerSandbox150QuoteScope({
   environment:env,privateDirectory:base
  });
  const options={
   privateDirectory:base,quoteScope,
   part2Filename:join(base,'part2-owner-sandbox150.sqlite'),
   budgetFilename:join(base,'part2-owner-sandbox150-quota.sqlite')
  };
  const review=inspectOwnerSandbox150ApprovalReadiness(options);
  if(mode==='--review'){
   stdout.write(JSON.stringify(review)+'\n');
  }else{
   write('PRIVATE_EXACT_QUOTE_CONSENT_PREVIEW',{
    quoteId:review.quoteId,quoteVersion:review.quoteVersion,
    quoteFingerprint:review.quoteFingerprint,amountMinor:150,currency:'USD',
    fileWritesPerformed:false,independentGeminiAttestation:false
   });
   const rl=createInterface({input:stdin,output:stderr,terminal:true});
   let confirmed=false;
   try{
    const phrase='APPROVE PRIVATE QUOTE '+review.quoteId+' USD 1.50';
    const response=await rl.question(
     'Approve ONLY this already-reviewed local quote; no payment or AI calls. '+
     'Type '+phrase+': '
    );
    confirmed=response===phrase;
   }finally{rl.close()}
   if(!confirmed){
    write('OPERATOR_DECLINED',{fileWritesPerformed:false});
    process.exitCode=2;
   }else{
    const result=await approveOwnerSandbox150Quote({
     ...options,explicitOwnerConsent:true
    });
    stdout.write(JSON.stringify(result)+'\n');
   }
  }
 }catch(e){
  // No file paths, environment values, private transcript or token strings.
  write('OWNER_SANDBOX150_APPROVAL_REVIEW_REQUIRED',{
   errorClass:typeof e?.code==='string'&&/^[A-Z0-9_]{3,100}$/.test(e.code)
    ?e.code:'PRIVATE_REVIEW_UNVERIFIED',
   fileWritesPerformed:false,localDataCouldHaveChanged:mode==='--approve-exact-150'
  });
  process.exitCode=2;
 }
}
