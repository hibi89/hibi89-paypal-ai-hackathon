import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseP0ProbeArgs,runP0OneShotProbe} from '../src/p0_one_shot_probe.mjs';
const env={PAYPAL_SANDBOX_CLIENT_ID:'test_local_id',
 PAYPAL_SANDBOX_CLIENT_SECRET:['synthetic','private','secret'].join('_'),
 GEMINI_API_KEY:'synthetic_ai_key'};
const opts={execute:true,ownerAuthorized:true,env};
function fakeResponse(body,status=200){return {status,async json(){return body}};}
const goodPayPal={access_token:'synthetic_not_real',token_type:'Bearer',
 expires_in:3600};
const goodAI={candidates:[{finishReason:'STOP',content:{parts:[{text:'A simple page.'}]}}]};
test('default is offline and ignores credentials',async()=>{
 let calls=0;
 const r=await runP0OneShotProbe({provider:'paypal',env,
  fetchImpl:async()=>{calls++;throw Error('unreachable')}});
 assert.equal(r.networkCalls,0);assert.equal(calls,0);
 assert.equal(r.status,'DRY_RUN_OWNER_APPROVAL_REQUIRED');
});
test('single approval flag does not permit any remote calls',async()=>{
 let calls=0;
 for(const q of [{execute:true},{ownerAuthorized:true}]){
  const r=await runP0OneShotProbe({provider:'paypal',env,...q,
   fetchImpl:async()=>{calls++;return fakeResponse(goodPayPal)}});
  assert.equal(r.networkCalls,0);
 }
 assert.equal(calls,0);
});
test('Gemini additionally needs explicit free-tier confirmation',async()=>{
 let calls=0;
 const r=await runP0OneShotProbe({provider:'gemini',...opts,
  fetchImpl:async()=>{calls++;return fakeResponse(goodAI)}});
 assert.equal(r.status,'FREE_TIER_OWNER_CONFIRMATION_REQUIRED');assert.equal(calls,0);
});
test('missing private credentials fails closed before fetch',async()=>{
 const r=await runP0OneShotProbe({provider:'paypal',
  ...opts,env:{PAYPAL_SANDBOX_CLIENT_ID:'x'},fetchImpl:async()=>{throw Error('unexpected')}});
 assert.equal(r.status,'PRIVATE_CREDENTIALS_NOT_CONFIGURED');
 assert.equal(r.networkCalls,0);
});
test('PayPal OAuth uses single strict Sandbox URL and token never appears in output',async()=>{
 const calls=[];
 const report=await runP0OneShotProbe({provider:'paypal',...opts,
  fetchImpl:async(url,request)=>{
   calls.push({url,request});
   return fakeResponse(goodPayPal);
  }});
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://api-m.sandbox.paypal.com/v1/oauth2/token');
 assert.equal(calls[0].request.method,'POST');
 assert.equal(calls[0].request.redirect,'error');
 assert.equal(calls[0].request.body,'grant_type=client_credentials');
 assert.equal(report.status,'SANDBOX_OAUTH_REACHED');
 assert.equal(report.externalEvidence,true);
 const result=JSON.stringify(report);
 for(const secret of [...Object.values(env),goodPayPal.access_token]){
  assert.equal(result.includes(secret),false);
 }
});
test('Gemini one real-request contract has static synthetic prompt and fixed model',async()=>{
 const calls=[];
 const report=await runP0OneShotProbe({provider:'gemini',...opts,
  freeTierConfirmed:true,
  fetchImpl:async(url,request)=>{calls.push({url,request});return fakeResponse(goodAI)}});
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent');
 assert.equal(calls[0].request.redirect,'error');
 assert.equal(calls[0].request.headers['x-goog-api-key'],env.GEMINI_API_KEY);
 const req=JSON.parse(calls[0].request.body);
 assert.ok(req.contents[0].parts[0].text.includes('fictional website'));
 assert.equal(req.generationConfig.maxOutputTokens,96);
 assert.equal(report.externalEvidence,true);
 assert.equal(report.accountFreeTierVerified,false);
 assert.equal(report.status,'GEMINI_TEXT_GENERATED');
 const encoded=JSON.stringify(report);
 assert.equal(encoded.includes('A simple page.'),false);
 assert.equal(encoded.includes(env.GEMINI_API_KEY),false);
});
test('non-2xx response produces only sanitized HTTP code and no secret body',async()=>{
 const r=await runP0OneShotProbe({provider:'paypal',...opts,
  fetchImpl:async()=>fakeResponse({error:'synthetic secret in payload'},401)});
 assert.equal(r.status,'REMOTE_HTTP_NOT_SUCCESS');assert.equal(r.httpStatus,401);
 assert.equal(JSON.stringify(r).includes('synthetic secret'),false);
});
test('network failure and malformed JSON are sanitized without retry',async()=>{
 let count=0;
 const net=await runP0OneShotProbe({provider:'paypal',...opts,
  fetchImpl:async()=>{count++;throw Error('token=private_secret')}});
 assert.equal(count,1);assert.equal(net.status,'REMOTE_NETWORK_FAILED');
 const bad=await runP0OneShotProbe({provider:'gemini',...opts,freeTierConfirmed:true,
  fetchImpl:async()=>({status:200,async json(){throw Error('key goes here')}})});
 assert.equal(bad.status,'REMOTE_JSON_INVALID');
});
test('invalid success responses do not count as authenticated or generated evidence',async()=>{
 const r=await runP0OneShotProbe({provider:'paypal',...opts,
  fetchImpl:async()=>fakeResponse({access_token:'abc',token_type:'Wrong'})});
 assert.equal(r.externalEvidence,false);
 const a=await runP0OneShotProbe({provider:'gemini',...opts,freeTierConfirmed:true,
  fetchImpl:async()=>fakeResponse({candidates:[{finishReason:'MAX_TOKENS',
   content:{parts:[{text:'Hello'}]}}]})});
 assert.equal(a.externalEvidence,false);
});
test('parser refuses ambiguous or unknown provider args',()=>{
 assert.equal(parseP0ProbeArgs([]).provider,'unspecified');
 assert.equal(parseP0ProbeArgs(['--paypal','--gemini']).provider,'unspecified');
 assert.equal(parseP0ProbeArgs(['--paypal','--confirm-live']).provider,'unspecified');
 assert.equal(parseP0ProbeArgs(['--paypal','--execute','--owner-authorized']).provider,'paypal');
});
test('CLI default refuses network and exits 2, without dumping environment secrets',()=>{
 const path=fileURLToPath(new URL('../scripts/p0_one_shot_probe.mjs',import.meta.url));
 for(const argv of [[],['--paypal'],['--gemini','--execute']]){
  const child=spawnSync(process.execPath,[path,...argv],{
   encoding:'utf8',timeout:10000,env:{...process.env,...env}
  });
  assert.equal(child.status,2,child.stderr);
  const output=child.stdout+child.stderr;
  for(const value of Object.values(env))assert.equal(output.includes(value),false);
  const r=JSON.parse(child.stdout);
  assert.equal(r.networkCalls,0);assert.equal(r.externalEvidence,false);
 }
});
