// Trusted-owner, read-only re-use of an earlier consented Gemini SKILLS result.
// This bridge NEVER calls classify(), the Gemini provider, PayPal or network.
// No public route. Fake test transports are not proof of actual provider identity.
import {createHash} from 'node:crypto';
import {matchSyntheticMarketplaceSkills} from './marketplace_match.mjs';

const fail=(code,status=400)=>{const e=new Error(code);e.code=code;e.status=status;throw e;};
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const actorKey=principal=>createHash('sha256')
  .update(JSON.stringify([principal.actorId,principal.merchantId]))
  .digest('hex').slice(0,40);
const same=(a,b)=>a.actorId===b.actorId&&a.merchantId===b.merchantId;
export function createOwnerMarketplaceRecommendationBridge({
  aiService,store,resolveTrustedActor
}={}){
  if(aiService?.mode!=='INTERNAL_GEMINI_SKILLS_ONLY'||
     aiService.publicHttpEnabled!==false||
     aiService.implicitNetworkEnabled!==false||
     typeof aiService.readSaved!=='function'||
     typeof store?.start!=='function'||typeof store?.get!=='function'||
     typeof store?.next!=='function'||typeof resolveTrustedActor!=='function')
    fail('TRUSTED_READ_ONLY_AI_MATCH_DEPENDENCIES_REQUIRED');
  async function verified(handle){
    const principal=await resolveTrustedActor(handle);
    if(principal?.verified!==true||!ID.test(principal.actorId??'')||
       !ID.test(principal.merchantId??''))
      fail('VERIFIED_OWNER_REQUIRED',403);
    return {actorId:principal.actorId,merchantId:principal.merchantId};
  }
  function present(row){
    if(!row||row.vertical!=='ai_work'||!Array.isArray(row.roster)||
       row.roster.length!==3)fail('AI_MATCH_SESSION_NOT_FOUND',404);
    const matches=round=>matchSyntheticMarketplaceSkills(row.skills,{
      source:'GEMINI_API',round,profileIds:row.roster[round]
    });
    const current=matches(row.round);
    return Object.freeze({
      status:'RESTORED_AI_SKILLS_MATCHED_TO_SYNTHETIC_ONLY',
      source:'DURABLE_AI_SKILLS_SNAPSHOT',
      providerEvidence:'PROVIDER_TRANSPORT_NOT_ATTESTED_BY_THIS_BRIDGE',
      realProviderCallsThisOperation:0,
      paypalCalls:0,paymentAuthorized:false,aiPricePrediction:false,
      sessionId:row.id,round:row.round+1,maxRounds:3,
      remainingRefreshes:2-row.round,
      ...current,
      history:Array.from({length:row.round+1},(_,round)=>({
        round:round+1,profiles:matches(round).profiles
      })),
    });
  }
  async function restore({sessionHandle,brief}={}){
    const original=await verified(sessionHandle);
    // readSaved is identity-scoped and never spends the Gemini one-shot budget.
    const saved=await aiService.readSaved({sessionHandle,brief});
    const current=await verified(sessionHandle);
    if(!same(original,current))fail('OWNER_CHANGED_DURING_RESTORE',403);
    if(saved?.status!=='RESTORED')
      return Object.freeze({status:'AI_SKILLS_NOT_RESTORABLE',
        savedStatus:saved?.status||'UNAVAILABLE',
        providerPostPerformed:false,realProviderCallsThisOperation:0,
        paypalCalls:0,paymentAuthorized:false});
    const result=saved.result;
    if(result?.mode!=='GEMINI_ASSISTED_SYNTHETIC_PROFILES'||
       result.skillSource!=='GEMINI_API'||
       !Array.isArray(result.requestedSkills))
      fail('SAVED_AI_SKILLS_INVALID');
    const key=actorKey(current);
    const row=store.start(key,'ai_work',brief,result.requestedSkills);
    if(JSON.stringify(row.skills)!==JSON.stringify(result.requestedSkills))
      fail('SAVED_AI_MATCH_SCOPE_CONFLICT',409);
    return present(row);
  }
  async function history({sessionHandle,sessionId}={}){
    const principal=await verified(sessionHandle);
    return present(store.get(actorKey(principal),sessionId));
  }
  async function next({sessionHandle,sessionId,expectedRound}={}){
    const principal=await verified(sessionHandle);
    return present(store.next(actorKey(principal),sessionId,expectedRound));
  }
  return Object.freeze({
    mode:'PRIVATE_OWNER_SAVED_AI_RECOMMENDATION_BRIDGE',
    publicHttpEnabled:false,implicitNetworkEnabled:false,
    classifyEnabled:false,paypalEnabled:false,
    restore,history,next
  });
}
