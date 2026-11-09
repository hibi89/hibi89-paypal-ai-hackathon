// Owner-only opt-in Part2 Gemini pilot. No flags -> no disk or network.
// Never start this from a public route or a synthetic local browser session.
import {mkdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {argv,env,stdin,stderr,stdout} from 'node:process';
import {createOwnerPrivateGeminiInnovationLab} from '../src/owner_private_gemini_innovation_lab.mjs';
import {inspectOwnerProposedA2AQuote} from '../src/owner_private_a2a_quote_binding.mjs';

const flags=['--execute','--owner-authorized','--free-tier-confirmed'];
const sandboxFlag='--sandbox-pilot-150';
const supplied=argv.slice(2);
const sandboxPilot=supplied.includes(sandboxFlag);
const expected=sandboxPilot?[...flags,sandboxFlag]:flags;
const exact=supplied.length===expected.length&&
 new Set(supplied).size===expected.length&&expected.every(x=>supplied.includes(x));
const info=(status,more={})=>stdout.write(JSON.stringify({
 status,mode:'PRIVATE_PART2_GEMINI_OPERATOR_ONLY',
 networkRequests:0,paymentState:'NOT_PAID',...more
})+'\n');
if(!exact){
 info('DRY_RUN_NO_NETWORK',{
  requiresExactFlags:flags,optionalSmallPilotFlag:sandboxFlag,
  requiresPrivateTTY:true,requiresTypedConsent:true,
  providerAccountFreeTierVerified:false,networkRequests:0
 });
}else if(!stdin.isTTY||!stderr.isTTY){
 info('PRIVATE_TTY_REQUIRED');process.exitCode=2;
}else{
 const rl=createInterface({input:stdin,output:stderr,terminal:true});
 let approved=false;
 try{
  const phrase=sandboxPilot
   ?'AUTHORIZE PRIVATE PART2 SANDBOX 150 FOUR GEMINI CALLS'
   :'AUTHORIZE PRIVATE PART2 FOUR GEMINI CALLS';
  const answer=await rl.question('Confirm Google AI Studio Free Tier access. '+
   (sandboxPilot
    ?'Private $1.50 seller-floor and buyer-cap A2A, '
    :'Private original A2A, ')+
   'up to FOUR Gemini requests for FICTIONAL roles only; no PayPal or purchase. '+
   'Type '+phrase+': ');
  approved=answer===phrase;
 }finally{rl.close();}
 if(!approved){info('OPERATOR_DECLINED');process.exitCode=2;}
 else if(typeof env.GEMINI_API_KEY!=='string'||env.GEMINI_API_KEY.length<12){
  info('PRIVATE_GEMINI_KEY_REQUIRED');process.exitCode=2;
 }else{
  const dir=join(homedir(),'.paypal-ai-pilot-private');
  let app,attemptStarted=false;
  try{
   // A $1.50 negotiation must be traceable to an existing same-owner,
   // same-merchant, still-PROPOSED Part1 quote before any Gemini call.
   // Read-only preflight never creates or changes Part1 data.
   const binding=sandboxPilot?inspectOwnerProposedA2AQuote({
    filename:env.WORKNOVA_OWNER_LEDGER_PATH||
     join(dir,'owner-sandbox150-part1.sqlite'),
    actorId:env.WORKNOVA_OWNER_ACTOR_ID||'operator_owner',
    merchantId:env.WORKNOVA_SANDBOX_MERCHANT_ID||
     env.PAYPAL_SANDBOX_MERCHANT_ID,
    quoteId:env.WORKNOVA_PILOT_QUOTE_ID||'worknova_a2a_150_once'
   }):null;
   mkdirSync(dir,{recursive:true,mode:0o700});
   app=createOwnerPrivateGeminiInnovationLab({
    // Separate never-reused scope/DBs protect the existing $270 pilot.
    // Both modes retain fixed request keys: no repeat provider POST on restart.
    filename:join(dir,sandboxPilot
     ?'part2-owner-sandbox150.sqlite':'part2-owner-lab.sqlite'),
    budgetFilename:join(dir,sandboxPilot
     ?'part2-owner-sandbox150-quota.sqlite':'part2-owner-quota.sqlite'),
    scope:{actor:binding?.actorId??'operator_owner',
     merchant:binding?.merchantId??'fictional_merchant',
     job:sandboxPilot?'part2_sandbox_150_once':'part2_demo_once'},
    apiKey:env.GEMINI_API_KEY,fetchImpl:(...args)=>globalThis.fetch(...args),
    ownerAuthorized:true,freeTierConfirmed:true,operatorConfirmed:true,
    sandboxPilotSellerFloorMinor:sandboxPilot?150:27000,
    quoteBinding:binding
   });
   // Fixed request keys are irreversible: a second execution reads persisted
   // state; it NEVER silently spends an additional Gemini budget.
   const mandate=app.delegate({key:'one_mandate',
    maxMinor:sandboxPilot?150:30000,expiresInMinutes:sandboxPilot?15:30});
   attemptStarted=true;
   const outcome=await app.negotiate({key:'one_negotiation',consentId:mandate.consentId});
   const budget=app.quotaStatus();
   // The quote can change while the LLM answers. Never imply that its result
   // is linked if the original proposal changed during the async calls.
   const current=sandboxPilot?inspectOwnerProposedA2AQuote({
    filename:env.WORKNOVA_OWNER_LEDGER_PATH,
    actorId:binding.actorId,merchantId:binding.merchantId,
    quoteId:binding.quoteId
   }):null;
   if(binding&&current.quoteFingerprint!==binding.quoteFingerprint)
    throw Object.assign(new Error('STALE_QUOTE'),{
     code:'OWNER_A2A_QUOTE_CHANGED_DURING_NEGOTIATION'
    });
   info('PRIVATE_PART2_ATTEMPT_PERSISTED',{
    networkRequests:'NOT_ATTESTED',
    pilotMode:sandboxPilot?'SANDBOX_150_A2A_ONLY':'LEGACY_270_A2A_ONLY',
    sandboxPilotAmountMinor:sandboxPilot?150:null,
    boundQuoteId:binding?.quoteId??null,
    boundQuoteVersion:binding?.quoteVersion??null,
    quoteFingerprint:binding?.quoteFingerprint??null,
    quoteHumanApproved:false,
    agreementState:outcome.status,accepted:outcome.accepted===true,
    agreedMinor:outcome.agreedMinor??null,
    transcriptSha256:outcome.transcriptSha256??null,
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
   info('PRIVATE_PART2_FAILED_NO_AUTO_RETRY',{
    networkRequests:attemptStarted?'NOT_ATTESTED':0,
    errorClass:String(e?.code||'UNKNOWN')
   });
   process.exitCode=2;
  }finally{try{app?.close()}catch{}}
 }
}
