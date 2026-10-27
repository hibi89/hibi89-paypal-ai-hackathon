// Private command-line bridge to the real, consent-gated Gemini skill classifier.
// A local operator consent is NOT authenticated web login or production readiness.
// No HTTP server, public endpoint, PayPal action, payment amount, or model fallback.
import {mkdirSync} from 'node:fs';
import {dirname,isAbsolute,relative,resolve,sep} from 'node:path';
import {createGeminiMarketplaceSkillProvider} from './gemini_marketplace_provider.mjs';
import {createOwnerMarketplaceAiService} from './owner_marketplace_ai_service.mjs';
import {createMarketplaceAiBudgetStore} from './marketplace_ai_budget.mjs';
import {GEMINI_P0_MODEL} from './gemini_p0_model.mjs';

export const LOCAL_GEMINI_BRIEF =
  'Build a fictional ecommerce website with PayPal checkout and QA testing.';
const MODE='PRIVATE_LOCAL_OPERATOR_ONLY_NOT_PRODUCTION_AUTH';
const report=(status,more={})=>Object.freeze({mode:MODE,status,
  productionAuthVerified:false,accountFreeTierVerified:false,
  paypalConnected:false,autoRetry:false,...more});
const insideRepo=(file,cwd)=>{
  const rel=relative(resolve(cwd),resolve(file));
  return rel===''||(!rel.startsWith('..'+sep)&&rel!=='..'&&!isAbsolute(rel));
};
export function parseOwnerGeminiPilotArgs(args=[]){
  const required=['--execute','--owner-authorized','--free-tier-confirmed'];
  return Object.freeze({valid:Array.isArray(args)&&args.length===3&&
    new Set(args).size===3&&required.every(x=>args.includes(x))});
}
export async function runOwnerGeminiLocalPilot({
  execute=false,ownerAuthorized=false,freeTierConfirmed=false,
  operatorConfirmed=false,apiKey,budgetFilename,fetchImpl,
  cwd=process.cwd()
}={}){
  // No key, disk or network access on unapproved/default routes.
  if(execute!==true||ownerAuthorized!==true||freeTierConfirmed!==true||
     operatorConfirmed!==true)
    return report('EXPLICIT_LOCAL_OPERATOR_CONSENT_REQUIRED',{networkRequests:0});
  if(typeof apiKey!=='string'||!apiKey.trim())
    return report('PRIVATE_GEMINI_KEY_REQUIRED',{networkRequests:0});
  if(typeof fetchImpl!=='function')
    return report('FETCH_TRANSPORT_REQUIRED',{networkRequests:0});
  if(typeof budgetFilename!=='string'||!isAbsolute(budgetFilename)||
     insideRepo(budgetFilename,cwd))
    return report('PRIVATE_ABSOLUTE_BUDGET_FILE_REQUIRED',{networkRequests:0});
  // Persist a single reservation outside the repository, including after restart.
  let store;
  try{
    mkdirSync(dirname(budgetFilename),{recursive:true,mode:0o700});
    store=createMarketplaceAiBudgetStore({filename:budgetFilename});
  }catch{return report('PRIVATE_BUDGET_STORE_UNAVAILABLE',{networkRequests:0});}
  try{
    const provider=createGeminiMarketplaceSkillProvider({
      apiKey,ownerAuthorized:true,freeTierConfirmed:true,fetchImpl
    });
    // A process-private capability. No claim of externally authenticated users.
    const handle=Object.freeze(Object.create(null));
    const service=createOwnerMarketplaceAiService({
      store,provider,
      resolveTrustedActor:async supplied=>supplied===handle
        ?{verified:true,actorId:'local_cli_operator',merchantId:'fictional_merchant'}
        :null,
      authorizeRequest:async action=>action.action==='GEMINI_SKILL_CLASSIFICATION_ONCE'&&
        action.actorId==='local_cli_operator'&&action.merchantId==='fictional_merchant'&&
        operatorConfirmed===true
    });
    const result=await service.classify({sessionHandle:handle,brief:LOCAL_GEMINI_BRIEF});
    return report('GEMINI_SKILLS_PERSISTED_LOCAL_ONLY',{
      model:GEMINI_P0_MODEL,skillSource:result.skillSource,
      requestedSkills:result.requestedSkills,
      syntheticMatches:result.profiles.filter(x=>x.eligible).map(x=>x.id),
      priceStatus:result.price.status,paymentStatus:result.paypal.status,
      networkRequests:1,providerProof:'IN_PROCESS_GEMINI_RESPONSE_VALIDATED',
      authorizationScope:'TERMINAL_OPERATOR_ONLY'
    });
  }catch(e){
    // Reservation is consumed/UNKNOWN on ambiguous remote operation.
    const code=String(e?.code??'');
    return report(code==='MARKETPLACE_AI_BUDGET_USED'?
      'ONE_SHOT_BUDGET_ALREADY_USED_NO_RETRY':
      'PROVIDER_OR_RESULT_UNKNOWN_NO_RETRY',{
      networkRequests:code==='MARKETPLACE_AI_BUDGET_USED'?0:'NOT_PROVEN',
      providerProof:'NOT_ESTABLISHED'
    });
  }finally{try{store.close();}catch{}}
}
