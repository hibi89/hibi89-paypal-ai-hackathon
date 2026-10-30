import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMarketplaceAiBudgetStore} from '../src/marketplace_ai_budget.mjs';
import {createMarketplaceRecommendationStore} from '../src/marketplace_recommendation_store.mjs';
import {createOwnerMarketplaceAiService} from '../src/owner_marketplace_ai_service.mjs';
import {createGeminiMarketplaceSkillProvider} from '../src/gemini_marketplace_provider.mjs';
import {createOwnerMarketplaceRecommendationBridge} from '../src/owner_marketplace_recommendation_bridge.mjs';

const brief='Build an accessible web dashboard with QA testing';
const principal={verified:true,actorId:'owner-a',merchantId:'merchant-a'};
function setup(){
  const dir=mkdtempSync(join(tmpdir(),'proofline-ai-roster-'));
  const aiStore=createMarketplaceAiBudgetStore({filename:join(dir,'ai.sqlite')});
  const rosterStore=createMarketplaceRecommendationStore(join(dir,'roster.sqlite'));
  const calls=[];
  const provider=createGeminiMarketplaceSkillProvider({
    apiKey:'FAKE_TEST_KEY',ownerAuthorized:true,freeTierConfirmed:true,
    fetchImpl:async(url,opts)=>{
      calls.push({url,method:opts.method});
      return {status:200,json:async()=>({candidates:[{
        finishReason:'STOP',content:{parts:[{
          text:JSON.stringify({skills:['web','qa']})
        }]}
      }]})};
    }
  });
  const handle=Object.freeze({});
  let actor=principal;
  const resolveTrustedActor=async candidate=>candidate===handle?actor:null;
  const aiService=createOwnerMarketplaceAiService({
    store:aiStore,provider,resolveTrustedActor,
    authorizeRequest:async()=>true
  });
  const bridge=createOwnerMarketplaceRecommendationBridge({
    aiService,store:rosterStore,resolveTrustedActor
  });
  return {dir,calls,handle,aiService,bridge,rosterStore,
    changeActor:newActor=>actor=newActor,
    close(){aiStore.close();rosterStore.close();rmSync(dir,{recursive:true,force:true})}
  };
}
test('saved consented skill result is reused for 3x3 without any second Gemini request',async()=>{
  const f=setup();
  try{
    const missing=await f.bridge.restore({sessionHandle:f.handle,brief});
    assert.equal(missing.status,'AI_SKILLS_NOT_RESTORABLE');
    assert.equal(missing.realProviderCallsThisOperation,0);
    assert.equal(f.calls.length,0);
    const classified=await f.aiService.classify({sessionHandle:f.handle,brief});
    assert.equal(classified.mode,'GEMINI_ASSISTED_SYNTHETIC_PROFILES');
    assert.equal(f.calls.length,1); // explicitly injected fake, NOT a real Gemini request
    const first=await f.bridge.restore({sessionHandle:f.handle,brief});
    assert.equal(first.status,'RESTORED_AI_SKILLS_MATCHED_TO_SYNTHETIC_ONLY');
    assert.equal(first.skillSource,'GEMINI_API');
    assert.equal(first.providerEvidence,'PROVIDER_TRANSPORT_NOT_ATTESTED_BY_THIS_BRIDGE');
    assert.deepEqual(first.requestedSkills,['web','qa']);
    assert.deepEqual(first.profiles.map(p=>p.id),
      ['synthetic-commerce','synthetic-ui','synthetic-tester']);
    assert.equal(first.profiles.every(p=>p.eligible),true);
    assert.equal(first.round,1);
    assert.equal(first.remainingRefreshes,2);
    assert.equal(first.aiPricePrediction,false);
    assert.equal(first.paymentAuthorized,false);
    assert.equal(first.paypalCalls,0);
    const again=await f.bridge.restore({sessionHandle:f.handle,brief});
    assert.equal(again.sessionId,first.sessionId);
    assert.equal(again.round,1);
    assert.equal(f.calls.length,1);
    const second=await f.bridge.next({sessionHandle:f.handle,
      sessionId:first.sessionId,expectedRound:1});
    assert.equal(second.round,2);
    assert.deepEqual(second.history[0].profiles.map(p=>p.id),
      first.profiles.map(p=>p.id));
    const third=await f.bridge.next({sessionHandle:f.handle,
      sessionId:first.sessionId,expectedRound:2});
    assert.equal(third.round,3);
    assert.equal(third.remainingRefreshes,0);
    assert.equal(new Set(third.history.flatMap(x=>x.profiles.map(p=>p.id))).size,9);
    const old=await f.bridge.history({sessionHandle:f.handle,sessionId:first.sessionId});
    assert.deepEqual(old.history,third.history);
    await assert.rejects(f.bridge.next({sessionHandle:f.handle,
      sessionId:first.sessionId,expectedRound:3}),{code:'REFRESH_LIMIT_REACHED'});
    assert.equal(f.calls.length,1);
  }finally{f.close()}
});
test('untrusted handles, changed identity and foreign history fail without provider traffic',async()=>{
  const f=setup();
  try{
    await assert.rejects(f.bridge.restore({sessionHandle:{verified:true},brief}),
      {code:'VERIFIED_OWNER_REQUIRED'});
    await assert.rejects(f.bridge.history({sessionHandle:{verified:true},
      sessionId:'c'.repeat(32)}),{code:'VERIFIED_OWNER_REQUIRED'});
    await f.aiService.classify({sessionHandle:f.handle,brief});
    const original=await f.bridge.restore({sessionHandle:f.handle,brief});
    f.changeActor({verified:true,actorId:'owner-b',merchantId:'merchant-a'});
    await assert.rejects(f.bridge.history({sessionHandle:f.handle,
      sessionId:original.sessionId}),{code:'AI_MATCH_SESSION_NOT_FOUND'});
    await assert.rejects(f.bridge.next({sessionHandle:f.handle,
      sessionId:original.sessionId,expectedRound:1}),{code:'RECOMMENDATION_SESSION_NOT_FOUND'});
    assert.equal(f.calls.length,1);
  }finally{f.close()}
});
test('the bridge cannot be mounted with a fake service lacking internal consent contract',()=>{
 const f=setup();
 try{
   assert.equal(f.bridge.publicHttpEnabled,false);
   assert.equal(f.bridge.implicitNetworkEnabled,false);
   assert.equal(f.bridge.classifyEnabled,false);
   assert.equal(f.bridge.paypalEnabled,false);
   assert.throws(()=>createOwnerMarketplaceRecommendationBridge({
     aiService:{readSaved:async()=>({status:'RESTORED'})},
     store:f.rosterStore,resolveTrustedActor:async()=>principal
   }),{code:'TRUSTED_READ_ONLY_AI_MATCH_DEPENDENCIES_REQUIRED'});
 }finally{f.close()}
});
