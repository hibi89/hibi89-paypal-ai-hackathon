// Manual OWNER-ONLY optional proof recheck.
// Without exact flags, a local interactive TTY and separate typed consent:
// ZERO private SQLite reads, credentials or external provider requests.
// Does not create/approve/capture any payment, invoke Gemini or publish.
import {stdin,stderr,stdout,argv,env} from 'node:process';
import {createInterface} from 'node:readline/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {recheckExistingSandboxGet} from '../src/owner_sandbox_get_recheck.mjs';

const EXPECTED=['--execute','--owner-authorized','--sandbox-only','--existing-order-get-only'];
const args=argv.slice(2);
if(args.length!==EXPECTED.length||new Set(args).size!==EXPECTED.length||
   !EXPECTED.every(x=>args.includes(x))||!stdin.isTTY||!stderr.isTTY){
  stdout.write(JSON.stringify({
    status:'OWNER_AUTHORIZATION_REQUIRED_NO_NETWORK',sandboxGetVerified:false,
    oauthPosts:0,orderGetRequests:0,paymentPosts:0,geminiCalls:0,
    privateFilesRead:false,submissionEligible:false
  })+'\n');
  process.exitCode=2;
}else{
  const rl=createInterface({input:stdin,output:stderr,terminal:true});
  try{
    const phrase='READ EXISTING SANDBOX ORDER ONLY';
    const answer=await rl.question('One OAuth POST (not payment) plus ONE PayPal Sandbox Orders GET of the already captured historical order. No new order or Capture. This can contact PayPal. Type '+phrase+' to authorize: ');
    if(answer!==phrase){
      stdout.write(JSON.stringify({status:'OWNER_DECLINED_NO_NETWORK',
        providerCalls:0,paymentPosts:0,submissionEligible:false})+'\n');
      process.exitCode=2;
    }else{
      // Read only after explicit consent. No credentials or provider IDs logged.
      const report=await recheckExistingSandboxGet({
        authorized:true,
        directory:join(homedir(),'.paypal-ai-mvp-private'),
        clientId:env.PAYPAL_SANDBOX_CLIENT_ID,
        clientSecret:env.PAYPAL_SANDBOX_CLIENT_SECRET,
        fetchImpl:globalThis.fetch
      });
      stdout.write(JSON.stringify(report)+'\n');
      if(report.sandboxGetVerified!==true)process.exitCode=2;
    }
  }catch{
    stdout.write(JSON.stringify({status:'OWNER_READONLY_RECHECK_FAILED_REVIEW_REQUIRED',
      sandboxGetVerified:false,paymentPosts:0,submissionEligible:false})+'\n');
    process.exitCode=2;
  }finally{rl.close()}
}
