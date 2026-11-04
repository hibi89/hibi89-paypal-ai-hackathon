// Owner-only, unmounted private A2A proof. No network or disk unless every gate passes.
import {mkdirSync} from 'node:fs';
import {dirname,isAbsolute,relative,resolve,sep} from 'node:path';
import {GEMINI_P0_MODEL} from './gemini_p0_model.mjs';
import {createA2ABudgetStore} from './gemini_a2a_budget_store.mjs';
import {createDurableGeminiA2ARoles} from './gemini_a2a_durable_roles.mjs';
import {runBoundedA2A} from './agentic_a2a_protocol.mjs';

const APPROVED=['--execute','--owner-authorized','--free-tier-confirmed'];
const MODE='OWNER_LOCAL_ONLY_NO_PUBLIC_ROUTE';
const report=(status,fields={})=>Object.freeze({
 status,mode:MODE,model:GEMINI_P0_MODEL,accountFreeTierVerifiedByThisRun:false,
 productionAuthVerified:false,realGeminiVerifiedByThisRun:false,
 paypalConnected:false,paymentState:'NOT_PAID',autoRetry:false,...fields
});
const insideRepo=(file,cwd)=>{
 const r=relative(resolve(cwd),resolve(file));
 return r===''||(!r.startsWith('..'+sep)&&r!=='..'&&!isAbsolute(r));
};
export function parseGeminiA2APilotArgs(args=[]){
 return Object.freeze({valid:Array.isArray(args)&&args.length===APPROVED.length&&
  new Set(args).size===APPROVED.length&&APPROVED.every(x=>args.includes(x))});
}
export function inspectGeminiA2APilotReadiness(){
 // No secrets, account discovery, provider call or external tier inference.
 return report('AWAITING_OPERATOR_FREE_TIER_AND_MODEL_ACCESS_PROOF',{
  networkRequests:0,modelListedOfficially:true,
  verifiedAccountQuota:false,requiresExactFlags:[...APPROVED],
  requiresPrivateTTY:true,requiresTypedConsent:true,
  requiresSyntheticOnly:true,providerOperation:'GENERATE_CONTENT_ONLY',
  providerPaymentAuthority:false
 });
}
export async function runOwnerGeminiA2APilot({
 execute=false,ownerAuthorized=false,freeTierConfirmed=false,
 operatorConfirmed=false,apiKey,fetchImpl,budgetFilename,
 cwd=process.cwd()
}={}){
 if(execute!==true||ownerAuthorized!==true||
    freeTierConfirmed!==true||operatorConfirmed!==true)
  return report('EXPLICIT_LOCAL_OPERATOR_APPROVAL_REQUIRED',{networkRequests:0});
 if(typeof apiKey!=='string'||apiKey.length<12||apiKey.length>1024)
  return report('PRIVATE_GEMINI_KEY_REQUIRED',{networkRequests:0});
 if(typeof fetchImpl!=='function')
  return report('INJECTED_PRIVATE_TRANSPORT_REQUIRED',{networkRequests:0});
 if(typeof budgetFilename!=='string'||!isAbsolute(budgetFilename)||
    insideRepo(budgetFilename,cwd))
  return report('PRIVATE_BUDGET_LOCATION_REQUIRED',{networkRequests:0});
 let ledger;
 try{
  mkdirSync(dirname(budgetFilename),{recursive:true,mode:0o700});
  ledger=createA2ABudgetStore({filename:budgetFilename,dayLimit:8,
   attemptLimit:4,dayTokens:20480,reservedPerCall:2560});
 }catch{return report('BUDGET_STORE_UNAVAILABLE',{networkRequests:0});}
 try{
  const scope={actor:'owner_cli',merchant:'fictional_seller',job:'owner_a2a_one_shot'};
  if(ledger.status(scope).requestsClaimed!==0)
   return report('A2A_PREVIOUS_CLAIM_NO_AUTO_RETRY',{networkRequests:0});
  // Absolute maximum four Gemini messages; a fresh process cannot repeat a
  // claimed turn. Model availability and actual Free Tier must be checked by owner.
  const agents=createDurableGeminiA2ARoles({
   budgetStore:ledger,budgetScope:scope,apiKey,fetchImpl,
   ownerAuthorized:true,freeTierConfirmed:true,
   maxRequests:4,maxTotalTokens:3000,maxOutputTokens:128,timeoutMs:6500
  });
  const negotiation=await runBoundedA2A({
   ...agents,buyerMaxMinor:30000,sellerMinMinor:27000,
   maxTurns:4,turnTimeoutMs:8000
  });
  const evidence=ledger.status(scope);
  if(evidence.records.some(x=>x.state!=='DONE'))
   return report('PROVIDER_OR_RESULT_UNKNOWN_NO_RETRY',{
    networkRequests:'NOT_ATTESTED',claimedRequests:evidence.requestsClaimed,
    auditState:evidence.records.map(x=>({role:x.role,turn:x.turn,state:x.state})),
    provenance:'NO_PROVIDER_PROOF'
   });
  const outcome=negotiation.status;
  return report(outcome==='AGREED_OFFLINE_CONTRACT'
   ?'PRIVATE_A2A_OFFLINE_CONTRACT_ONLY'
   :'PRIVATE_A2A_NO_PAYMENT',{
   negotiationStatus:outcome,reason:negotiation.reason,
   transcriptSha256:negotiation.transcriptSha256,
   messages:negotiation.messages,syntheticBudgetMinor:30000,
   claimedRequests:evidence.requestsClaimed,
   measuredTokens:evidence.measuredTokens,
   reservedTokens:evidence.reservedTokens,
   auditState:evidence.records.map(x=>({role:x.role,turn:x.turn,
    state:x.state,promptHash:x.promptHash,outputHash:x.outputHash||null})),
   provenance:'LOCAL_INJECTED_TRANSPORT_NO_EXTERNAL_ATTESTATION',
   livePaymentAuthorized:false
  });
 }catch(e){
  // A previous PENDING/UNKNOWN remains a consumed, unretryable reservation.
  const status=String(e?.code||'');
  const noRepeat=/A2A_LEDGER_REPLAY_BLOCKED|A2A_LEDGER_PRIOR_UNKNOWN/.test(status);
  const quota=status==='A2A_LEDGER_QUOTA_EXHAUSTED';
  return report(noRepeat?'A2A_PREVIOUS_CLAIM_NO_AUTO_RETRY':
    quota?'A2A_DURABLE_BUDGET_EXHAUSTED':'PROVIDER_OR_RESULT_UNKNOWN_NO_RETRY',{
    networkRequests:'NOT_ATTESTED',errorClass:noRepeat?'REPLAY':quota?'QUOTA':'UNKNOWN',
    provenance:'NO_PROVIDER_PROOF'
  });
 }finally{try{ledger.close()}catch{}}
}
