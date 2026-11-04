// Internal composition for authorized skill-only Gemini classification.
// A trusted backend must provide a real identity resolver and per-call user
// authorization; no public route, loopback synthetic login, or implicit HTTP.
import {createHash} from 'node:crypto';
import {validateMarketplaceBrief,validateMarketplaceSkills} from './gemini_marketplace_provider.mjs';
import {matchSyntheticMarketplaceSkills} from './marketplace_match.mjs';

const deny=code=>{const e=new Error(code);e.code=code;throw e;};
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const decorate=skills=>Object.freeze({...matchSyntheticMarketplaceSkills(skills,{source:'GEMINI_API'}),
  ai:Object.freeze({source:'GEMINI_API',role:'CLASSIFY_SKILLS_ONLY',
    humanApprovalRequired:true,pricePredictionAllowed:false,paymentAuthority:false})});
export function createOwnerMarketplaceAiService({store,provider,
  resolveTrustedActor,authorizeRequest}={}){
  if(store?.mode!=='DURABLE_ONE_SHOT_NO_IMPLICIT_NETWORK'||
     typeof store.claim!=='function'||typeof store.commit!=='function'||
     typeof store.markUnknown!=='function'||typeof store.readResult!=='function'||
     typeof provider!=='function'||provider.requiresExternalConsent!==true||
     typeof resolveTrustedActor!=='function'||typeof authorizeRequest!=='function')
    deny('TRUSTED_MARKETPLACE_AI_DEPENDENCIES_REQUIRED');
  async function checkedScope(sessionHandle,brief){
    validateMarketplaceBrief(brief);
    // Synthetic caller-provided objects and query/cookie/body claims are never authority.
    const actor=await resolveTrustedActor(sessionHandle);
    if(actor?.verified!==true||typeof actor.actorId!=='string'||!ID.test(actor.actorId)||
       typeof actor.merchantId!=='string'||!ID.test(actor.merchantId))
      deny('VERIFIED_MARKETPLACE_OWNER_REQUIRED');
    return {actorId:actor.actorId,merchantId:actor.merchantId,brief};
  }
  async function classify({sessionHandle,brief}={}){
    const scope=await checkedScope(sessionHandle,brief);
    // Explicit host-verified human consent before first durable reservation.
    const permitted=await authorizeRequest(Object.freeze({
      action:'GEMINI_SKILL_CLASSIFICATION_ONCE',
      actorId:scope.actorId,merchantId:scope.merchantId,
      briefHash:createHash('sha256').update(brief).digest('hex')
    }));
    if(permitted!==true)deny('MARKETPLACE_AI_CONSENT_REQUIRED');
    // Consent can await an external UI. Recheck the trusted host session after
    // that await, before spending the one-shot budget or sending model text.
    const current=await checkedScope(sessionHandle,brief);
    if(current.actorId!==scope.actorId||current.merchantId!==scope.merchantId)
      deny('MARKETPLACE_AI_SCOPE_CHANGED_DURING_CONSENT');
    store.claim(scope);
    try{
      const result=await provider({brief});
      if(result?.source!=='GEMINI_API')deny('AI_MARKETPLACE_SOURCE_MISMATCH');
      const skills=validateMarketplaceSkills({skills:result.skills});
      const candidates=decorate(skills);
      // Persist the validated result in the same atomic state transition;
      // success must never be returned if SQLite commit fails.
      store.commit({...scope,skills});
      return candidates;
    }catch{
      // Third-party work may already be billed/sent; no blind rerun.
      try{store.markUnknown(scope);}catch{}
      deny('MARKETPLACE_AI_RESULT_UNKNOWN_NO_AUTO_RETRY');
    }
  }
  async function readSaved({sessionHandle,brief}={}){
    const scope=await checkedScope(sessionHandle,brief);
    // Read-only: not even OAuth, Gemini authorization callback, or claim.
    const saved=store.readResult(scope);
    if(!saved)return Object.freeze({status:'NOT_STARTED',providerPostPerformed:false});
    if(!saved.restorable)
      return Object.freeze({status:'UNAVAILABLE',reason:saved.reason,
        reservationState:saved.state,providerPostPerformed:false,
        autoRetry:false});
    return Object.freeze({status:'RESTORED',result:decorate(saved.skills),
      providerPostPerformed:false,readOnly:true});
  }
  return Object.freeze({classify,readSaved,mode:'INTERNAL_GEMINI_SKILLS_ONLY',
    publicHttpEnabled:false,defaultDemoEnabled:false,
    implicitNetworkEnabled:false});
}
