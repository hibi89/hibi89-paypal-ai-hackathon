// Safe default: status/usage only, zero local writes and provider calls.
// Explicit human terminal consent creates ONLY a brand-new private quote DB.
import {stdin,stderr,stdout,argv,env} from 'node:process';
import {createInterface} from 'node:readline/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {prepareFreshOwnerSandbox150Quote}
 from '../src/owner_sandbox_150_quote_prepare.mjs';

const write=(status,more={})=>stdout.write(JSON.stringify({
 status,mode:'PRIVATE_OWNER_SANDBOX150_QUOTE_PREPARE',
 networkRequests:0,paymentAuthorized:false,geminiPostPerformed:false,
 paypalCreatePerformed:false,paypalCapturePerformed:false,
 ...more
})+'\n');
const flags=argv.slice(2);
if(flags.length!==1||flags[0]!=='--create-fresh-proposal'){
 write('DRY_RUN_NO_DISK_NO_NETWORK',{
  createFlag:'--create-fresh-proposal',newQuoteOnly:true,
  requiresPrivateTTY:true,requiresTypedConsent:true
 });
}else if(!stdin.isTTY||!stderr.isTTY){
 write('PRIVATE_TTY_REQUIRED');process.exitCode=2;
}else{
 const rl=createInterface({input:stdin,output:stderr,terminal:true});
 let consent;
 try{
  consent=await rl.question(
   'Create a NEW owner-local $1.50 PROPOSED quote DB only. '+
   'No AI, PayPal, approved quote, or payment. Existing DBs are never modified. '+
   'Type CREATE NEW PRIVATE UNAPPROVED 150 QUOTE: '
  );
 }finally{rl.close()}
 if(consent!=='CREATE NEW PRIVATE UNAPPROVED 150 QUOTE'){
  write('OPERATOR_DECLINED');process.exitCode=2;
 }else{
  // Read only nonsecret operator identifiers after explicit terminal consent.
  const merchant=env.WORKNOVA_SANDBOX_MERCHANT_ID||
   env.PAYPAL_SANDBOX_MERCHANT_ID;
  const conflict=env.WORKNOVA_SANDBOX_MERCHANT_ID&&
   env.PAYPAL_SANDBOX_MERCHANT_ID&&
   env.WORKNOVA_SANDBOX_MERCHANT_ID!==env.PAYPAL_SANDBOX_MERCHANT_ID;
  if(conflict){
   write('OWNER_SANDBOX150_MERCHANT_ENV_CONFLICT');process.exitCode=2;
  }else{
   try{
    const result=await prepareFreshOwnerSandbox150Quote({
     privateDirectory:join(homedir(),'.paypal-ai-pilot-private'),
     merchantId:merchant,
     actorId:env.WORKNOVA_OWNER_ACTOR_ID||'operator_owner',
     quoteId:env.WORKNOVA_PILOT_QUOTE_ID||'worknova_a2a_150_once'
    });
    stdout.write(JSON.stringify(result)+'\n');
   }catch(e){
    // No directory path, merchant ID, provider credential or raw exception.
    write('PRIVATE_PROPOSAL_PREPARATION_FAILED_NO_RETRY',{
     errorClass:e?.code??'UNKNOWN'
    });
    process.exitCode=2;
   }
  }
 }
}
