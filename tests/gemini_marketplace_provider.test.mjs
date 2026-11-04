import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeminiMarketplaceSkillProvider,validateMarketplaceBrief,
  validateMarketplaceSkills} from '../src/gemini_marketplace_provider.mjs';
import {GEMINI_P0_ENDPOINT} from '../src/gemini_p0_model.mjs';
import {matchSyntheticMarketplaceSkills} from '../src/marketplace_match.mjs';

const brief='Build an ecommerce website with PayPal checkout';
const options={apiKey:'INJECTED_FAKE_KEY_ONLY',ownerAuthorized:true,freeTierConfirmed:true};
const response=(payload,reason='STOP')=>({status:200,json:async()=>({
  candidates:[{finishReason:reason,content:{parts:[{text:JSON.stringify(payload)}]}}]
})});
test('Gemini matcher requires explicit owner permission/free tier and injected transport',()=>{
 for(const x of [
  {...options,ownerAuthorized:false,fetchImpl:async()=>response({skills:[]})},
  {...options,freeTierConfirmed:false,fetchImpl:async()=>response({skills:[]})},
  {...options,apiKey:'',fetchImpl:async()=>response({skills:[]})},
  options,
 ])assert.throws(()=>createGeminiMarketplaceSkillProvider(x),
   {code:'PRIVATE_AI_CONSENT_AND_FREE_TIER_REQUIRED'});
});
test('one fixed typed Gemini classification request; returned skills constrained to taxonomy',async()=>{
 const calls=[];
 const provider=createGeminiMarketplaceSkillProvider({...options,
  fetchImpl:async(url,config)=>{calls.push({url,config});
    return response({skills:['payments','web']});}});
 const output=await provider({brief});
 assert.deepEqual(output,{source:'GEMINI_API',skills:['web','payments']});
 assert.equal(provider.requiresExternalConsent,true);
 assert.equal(calls.length,1);assert.equal(calls[0].url,GEMINI_P0_ENDPOINT);
 assert.equal(calls[0].config.method,'POST');
 assert.equal(calls[0].config.redirect,'error');
 assert.ok(calls[0].config.signal instanceof AbortSignal);
 const body=JSON.parse(calls[0].config.body);
 assert.equal(body.generationConfig.responseMimeType,'application/json');
 assert.equal(body.generationConfig.temperature,0);
 assert.deepEqual(body.generationConfig.responseSchema.required,['skills']);
 assert.equal(body.generationConfig.responseSchema.properties.skills.items.enum.length,6);
 assert.equal(body.generationConfig.maxOutputTokens,256);
 assert.ok(body.contents[0].parts[0].text.includes(JSON.stringify(brief)));
 assert.ok(!JSON.stringify(output).includes(options.apiKey));
 assert.ok(!JSON.stringify(output).includes(brief));
 const matches=matchSyntheticMarketplaceSkills(output.skills,{source:'GEMINI_API'});
 assert.equal(matches.mode,'GEMINI_ASSISTED_SYNTHETIC_PROFILES');
 assert.equal(matches.profiles[0].id,'synthetic-web');
 assert.equal(matches.profiles[0].eligible,true);
 assert.equal(matches.price.status,'DATA_INSUFFICIENT');
 assert.equal(matches.price.amountMinor,null);
 assert.equal(matches.paypal.capturePerformed,false);
});
test('strict schema excludes invented skills/price/merchant/injection/duplicate output',()=>{
 for(const output of [
  {skills:['web','javascript']},{skills:['web','web']},
  {skills:['web'],price:200},{skills:'web'},
  {skills:['web',2]},null,[],{}, {skills:Array(7).fill('web')}
 ])assert.throws(()=>validateMarketplaceSkills(output),
   {code:'AI_MARKETPLACE_SCHEMA_INVALID'});
 assert.deepEqual(validateMarketplaceSkills({skills:[]}),[]);
 assert.deepEqual(validateMarketplaceSkills({skills:['qa','web']}),['web','qa']);
});
test('invalid briefs reject before external request',async()=>{
 let calls=0;
 const provider=createGeminiMarketplaceSkillProvider({...options,
  fetchImpl:async()=>{calls++;return response({skills:['web']})}});
 for(const bad of ['', 'tiny', '\n'+brief, brief+'\u0000','x'.repeat(501),null,{}]){
  assert.throws(()=>validateMarketplaceBrief(bad));
  await assert.rejects(provider({brief:bad}),{code:'INVALID_MARKETPLACE_AI_BRIEF'});
 }
 assert.equal(calls,0);
});
test('malformed remote results and unsafe responses fail closed with no reroute/retry',async()=>{
 const invalid=[
  response({skills:['web']},'MAX_TOKENS'),
  response({skills:['untrusted']}),
  response({skills:['web'],merchantId:'REAL_SELLER'}),
  {status:200,json:async()=>({candidates:[{finishReason:'STOP',
    content:{parts:[{text:'<untrusted>'}]}}]})},
  {status:200,json:async()=>({candidates:[]})},
  {status:429,json:async()=>({error:'PRIVATE_API_FAILURE'})},
  {status:200,json:async()=>{throw Error('SECRET_JSON_ERROR')}}
 ];
 for(const simulated of invalid){
  const calls=[];
  const provider=createGeminiMarketplaceSkillProvider({...options,
   fetchImpl:async url=>{calls.push(url);return simulated;}});
  await assert.rejects(provider({brief}),e=>{
    assert.ok(/^AI_MARKETPLACE_/.test(e.code));
    assert.ok(!String(e).includes('SECRET'));
    assert.ok(!String(e).includes('PRIVATE_API'));
    return true;
  });
  assert.deepEqual(calls,[GEMINI_P0_ENDPOINT]);
 }
 let count=0;
 const network=createGeminiMarketplaceSkillProvider({...options,
  fetchImpl:async()=>{count++;throw Error('SECRET_TRANSPORT_FAILURE')}});
 await assert.rejects(network({brief}),{code:'AI_MARKETPLACE_NETWORK_UNKNOWN'});
 assert.equal(count,1);
});
test('caller cannot redirect Gemini requests through override object',async()=>{
 const called=[];
 const provider=createGeminiMarketplaceSkillProvider({...options,
  model:'gemini-different',endpoint:'https://malicious.example',
  fetchImpl:async u=>{called.push(u);return response({skills:['data']});}});
 await provider({brief});
 assert.deepEqual(called,[GEMINI_P0_ENDPOINT]);
});
