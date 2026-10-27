// Internal composition for authorized skill-only Gemini classification.
// A trusted backend must provide a real identity resolver and per-call user
// authorization; no public route, loopback synthetic login, or implicit HTTP.
import {createHash} from 'node:crypto';
import {validateMarketplaceBrief,validateMarketplaceSkills} from './gemini_marketplace_provider.mjs';
import {matchSyntheticMarketplaceSkills} from './marketplace_match.mjs';

const deny=code=>{const e=new Error(code);e.code=code;throw e;};
const ID=/^[A-Za-z0-9_-]{1,128}$/;
export function createOwnerMarketplaceAiService({store,provider,
  resolveTrustedActor,authorizeRequest}={}){
  if(store?.mode!=='DURABLE_ONE_SHOT_NO_IMPLICIT_NETWORK'||
     typeof store.claim!=='function'||typeof store.commit!=='function'||
     typeof store.markUnknown!=='function'||typeof provider!=='function'||
     provider.requiresExternalConsent!==true||
     typeof resolveTrustedActor!=='function'||typeof authorizeRequest!=='function')
    deny('TRUSTED_MARKETPLACE_AI_DEPENDENCIES_REQUIRED');
  async function classify({sessionHandle,brief}={}){
    validateMarketplaceBrief(brief);
    const actor=await resolveTrustedActor(sessionHandle);
    if(actor?.verified!==true||typeof actor.actorId!=='string'||!ID.test(actor.actorId)||
       typeof actor.merchantId!=='string'||!ID.test(actor.merchantId))
      deny('VERIFIED_MARKETPLACE_OWNER_REQUIRED');
    const scope={actorId:actor.actorId,merchantId:actor.merchantId,brief};
    // Explicit human action must happen before durable reservation and provider.
    const permitted=await authorizeRequest(Object.freeze({
      action:'GEMINI_SKILL_CLASSIFICATION_ONCE',
      actorId:actor.actorId,merchantId:actor.merchantId,
      briefHash:createHash('sha256').update(brief).digest('hex')
    }));
    if(permitted!==true)deny('MARKETPLACE_AI_CONSENT_REQUIRED');
    store.claim(scope);
    try{
      const result=await provider({brief});
      if(result?.source!=='GEMINI_API')deny('AI_MARKETPLACE_SOURCE_MISMATCH');
      const skills=validateMarketplaceSkills({skills:result.skills});
      const candidates=matchSyntheticMarketplaceSkills(skills,{source:'GEMINI_API'});
      store.commit(scope);
      return Object.freeze({...candidates,ai:{source:'GEMINI_API',
        role:'CLASSIFY_SKILLS_ONLY',humanApprovalRequired:true,
        pricePredictionAllowed:false,paymentAuthority:false}});
    }catch{
      // The third-party call may have been sent or billed. Never reissue it
      // automatically, even after restart, timeout, or malformed schema.
      try{store.markUnknown(scope);}catch{}
      deny('MARKETPLACE_AI_RESULT_UNKNOWN_NO_AUTO_RETRY');
    }
  }
  return Object.freeze({classify,mode:'INTERNAL_GEMINI_SKILLS_ONLY',
    publicHttpEnabled:false,defaultDemoEnabled:false,
    implicitNetworkEnabled:false});
}
