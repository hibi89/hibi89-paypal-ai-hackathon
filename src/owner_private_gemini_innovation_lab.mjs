// Private owner-operated Part2 A2A: an already consented Gemini transport is injected.
// No HTTP route or default demo activation; no payment or implicit provider calls.
import {isAbsolute,relative,resolve,sep} from 'node:path';
import {createA2ABudgetStore} from './gemini_a2a_budget_store.mjs';
import {createDurableGeminiA2ARoles} from './gemini_a2a_durable_roles.mjs';
import {createInnovationLab} from './innovation_lab.mjs';

const ID=/^[A-Za-z0-9_-]{1,64}$/;
const deny=code=>{const e=new TypeError(code);e.code=code;throw e;};
const inside=(file,cwd)=>{
 const r=relative(resolve(cwd),resolve(file));
 return r===''||(!r.startsWith('..'+sep)&&r!=='..'&&!isAbsolute(r));
};
export function createOwnerPrivateGeminiInnovationLab({
 filename,budgetFilename,scope,apiKey,fetchImpl,
 ownerAuthorized=false,freeTierConfirmed=false,operatorConfirmed=false,
 sandboxPilotSellerFloorMinor=27000,cwd=process.cwd()
}={}){
 // All consent signals belong to the trusted operator, never to a browser body.
 if(ownerAuthorized!==true||freeTierConfirmed!==true||operatorConfirmed!==true)
  deny('OWNER_PRIVATE_GEMINI_A2A_APPROVAL_REQUIRED');
 if(!Number.isSafeInteger(sandboxPilotSellerFloorMinor)||
    (sandboxPilotSellerFloorMinor!==27000&&
     (sandboxPilotSellerFloorMinor<100||sandboxPilotSellerFloorMinor>200)))
  deny('OWNER_PRIVATE_A2A_SANDBOX_PILOT_FLOOR_REQUIRED');
 if(!scope||!['actor','merchant','job'].every(k=>ID.test(scope[k]??''))||
    typeof filename!=='string'||typeof budgetFilename!=='string'||
    !isAbsolute(filename)||!isAbsolute(budgetFilename)||
    resolve(filename)===resolve(budgetFilename)||
    inside(filename,cwd)||inside(budgetFilename,cwd))
  deny('OWNER_PRIVATE_GEMINI_A2A_SCOPE_AND_FILES_REQUIRED');
 // The quota database is durable and deliberately distinct from the Part2 state.
 const quota=createA2ABudgetStore({filename:budgetFilename,dayLimit:8,
  attemptLimit:4,dayTokens:20480,reservedPerCall:2560});
 let lab;
 try{
  const agents=createDurableGeminiA2ARoles({
   budgetStore:quota,budgetScope:scope,apiKey,fetchImpl,
   ownerAuthorized:true,freeTierConfirmed:true,
   maxRequests:4,maxTotalTokens:3000,maxOutputTokens:128,timeoutMs:6500
  });
  lab=createInnovationLab({filename,agentsFactory:()=>agents,
   agentTransport:'PRIVATE_INJECTED_UNVERIFIED',
   a2aMaxTurns:4,a2aTurnTimeoutMs:8000,
   a2aSellerFloorMinor:sandboxPilotSellerFloorMinor});
 }catch(e){try{quota.close()}catch{}throw e;}
 let closed=false;
 return Object.freeze({
  mode:'OWNER_PRIVATE_GEMINI_A2A_NOT_PROVIDER_ATTESTED',
  publicHttpEnabled:false,defaultDemoEnabled:false,
  paypalPaymentAuthorized:false,liveProviderVerifiedByThisFactory:false,
  delegate:({key,maxMinor,expiresInMinutes}={})=>lab.delegate({
   actor:scope.actor,merchant:scope.merchant,key,category:'services',
   maxMinor,expiresInMinutes}),
  negotiate:({key,consentId}={})=>lab.a2a({
   actor:scope.actor,merchant:scope.merchant,key,consentId}),
  state:()=>lab.state({actor:scope.actor,merchant:scope.merchant}),
  quotaStatus:()=>quota.status(scope),
  close:()=>{if(closed)return;closed=true;try{lab.close()}finally{quota.close()}}
 });
}
