// Owner-only opt-in Part2 Gemini pilot. No flags -> no disk or network.
// Never start this from a public route or a synthetic local browser session.
import {mkdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {argv,env,stdin,stderr,stdout} from 'node:process';
import {createOwnerPrivateGeminiInnovationLab} from '../src/owner_private_gemini_innovation_lab.mjs';

const flags=['--execute','--owner-authorized','--free-tier-confirmed'];
const supplied=argv.slice(2);
const exact=supplied.length===flags.length&&
 new Set(supplied).size===flags.length&&flags.every(x=>supplied.includes(x));
const info=(status,more={})=>stdout.write(JSON.stringify({
 status,mode:'PRIVATE_PART2_GEMINI_OPERATOR_ONLY',
 networkRequests:0,paymentState:'NOT_PAID',...more
})+'\n');
if(!exact){
 info('DRY_RUN_NO_NETWORK',{
  requiresExactFlags:flags,requiresPrivateTTY:true,
  requiresTypedConsent:true,providerAccountFreeTierVerified:false
 });
}else if(!stdin.isTTY||!stderr.isTTY){
 info('PRIVATE_TTY_REQUIRED');process.exitCode=2;
}else{
 const rl=createInterface({input:stdin,output:stderr,terminal:true});
 let approved=false;
 try{
  const answer=await rl.question('Confirm Google AI Studio Free Tier access. '+
   'This may send up to FOUR Gemini requests for FICTIONAL buyer/seller A2A, '+
   'with no PayPal or real purchase. Type AUTHORIZE PRIVATE PART2 FOUR GEMINI CALLS: ');
  approved=answer==='AUTHORIZE PRIVATE PART2 FOUR GEMINI CALLS';
 }finally{rl.close();}
 if(!approved){info('OPERATOR_DECLINED');process.exitCode=2;}
 else if(typeof env.GEMINI_API_KEY!=='string'||env.GEMINI_API_KEY.length<12){
  info('PRIVATE_GEMINI_KEY_REQUIRED');process.exitCode=2;
 }else{
  const dir=join(homedir(),'.paypal-ai-pilot-private');
  let app;
  try{
   mkdirSync(dir,{recursive:true,mode:0o700});
   app=createOwnerPrivateGeminiInnovationLab({
    filename:join(dir,'part2-owner-lab.sqlite'),
    budgetFilename:join(dir,'part2-owner-quota.sqlite'),
    scope:{actor:'operator_owner',merchant:'fictional_merchant',job:'part2_demo_once'},
    apiKey:env.GEMINI_API_KEY,fetchImpl:(...args)=>globalThis.fetch(...args),
    ownerAuthorized:true,freeTierConfirmed:true,operatorConfirmed:true
   });
   // Fixed request keys are irreversible: a second execution reads persisted
   // state; it NEVER silently spends an additional Gemini budget.
   const mandate=app.delegate({key:'one_mandate',maxMinor:30000,expiresInMinutes:30});
   const outcome=await app.negotiate({key:'one_negotiation',consentId:mandate.consentId});
   const budget=app.quotaStatus();
   info('PRIVATE_PART2_ATTEMPT_PERSISTED',{
    agreementState:outcome.status,accepted:outcome.accepted===true,
    agreedMinor:outcome.agreedMinor??null,
    a2aReplay:outcome.replayed===true,
    quotaClaims:budget.requestsClaimed,
    quotaStates:budget.records.map(x=>x.state),
    providerEvidence:'NO_LIVE_PROVIDER_ATTESTATION_BY_THIS_CLI',
    providerNetworkClaims:'UNVERIFIED',
    paymentAuthorized:false,paypalCapturePerformed:false,
    localEvidenceLocation:'PRIVATE_OWNER_HOME_ONLY'
   });
  }catch(e){
   // Never output paths, secrets or provider response bodies.
   info('PRIVATE_PART2_FAILED_NO_AUTO_RETRY',{errorClass:String(e?.code||'UNKNOWN')});
   process.exitCode=2;
  }finally{try{app?.close()}catch{}}
 }
}
