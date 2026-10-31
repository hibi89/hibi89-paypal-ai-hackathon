import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeminiA2ARoleAgents} from '../src/gemini_a2a_adapter.mjs';
import {runBoundedA2A} from '../src/agentic_a2a_protocol.mjs';

const KEY='FAKE_TEST_KEY_NOT_A_REAL_TOKEN';
const body=(action,amountMinor,tokenCount=40)=>new Response(JSON.stringify({
 candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({action,amountMinor})}]}}],
 usageMetadata:{totalTokenCount:tokenCount}
}),{status:200,headers:{'content-type':'application/json'}});
const setup=(fetchImpl,more={})=>createGeminiA2ARoleAgents({
 apiKey:KEY,fetchImpl,ownerAuthorized:true,freeTierConfirmed:true,...more
});
const sellerView={role:'seller',turn:1,ownLimitMinor:27000,history:[],lastOffer:null};
const buyerView={role:'buyer',turn:2,ownLimitMinor:30000,
 history:[{role:'seller',action:'OFFER',amountMinor:29000}],
 lastOffer:{role:'seller',action:'OFFER',amountMinor:29000}};
test('consent and provider quota prerequisites block before any network',async()=>{
 let called=0;
 const fake=async()=>{called++;return body('OFFER',29000);};
 for(const opts of [{},{ownerAuthorized:true},{ownerAuthorized:true,freeTierConfirmed:true}])
  assert.throws(()=>createGeminiA2ARoleAgents({...opts,fetchImpl:fake,apiKey:
    opts.freeTierConfirmed? 'short':KEY}),/GEMINI_A2A_/);
 assert.equal(called,0);
 assert.throws(()=>setup(globalThis.fetch),/GEMINI_A2A_INVALID_PRIVATE_CONFIGURATION/);
 assert.throws(()=>setup(fake,{maxRequests:99}),/GEMINI_A2A_INVALID_PRIVATE_CONFIGURATION/);
});
test('real REST body contract uses scoped role limits and strict JSON output; no payment tools',async()=>{
 const reqs=[];
 const adapter=setup(async(url,init)=>{
  reqs.push({url,init});
  return body(reqs.length===1?'OFFER':'ACCEPT',29000,40);
 });
 const result=await runBoundedA2A({
  ...adapter,buyerMaxMinor:30000,sellerMinMinor:27000,maxTurns:4,turnTimeoutMs:2000
 });
 assert.equal(result.status,'AGREED_OFFLINE_CONTRACT');
 assert.equal(result.agreedMinor,29000);
 assert.equal(result.paymentAuthorized,false);
 assert.equal(reqs.length,2);
 assert.match(reqs[0].url,/generativelanguage\.googleapis\.com/);
 assert.equal(reqs[0].init.redirect,'error');
 assert.equal(reqs[0].init.method,'POST');
 assert.equal(reqs[0].init.headers['x-goog-api-key'],KEY);
 assert.equal(JSON.stringify(reqs.map(x=>x.init.body)).includes('capture-order'),false);
 const a=JSON.parse(reqs[0].init.body);
 const b=JSON.parse(reqs[1].init.body);
 assert.equal(a.generationConfig.responseMimeType,'application/json');
 assert.equal(a.generationConfig.maxOutputTokens,128);
 assert.match(a.contents[0].parts[0].text,/Own lowest allowed price.*27000/);
 assert.doesNotMatch(a.contents[0].parts[0].text,/Own maximum delegated contract price/);
 assert.match(b.contents[0].parts[0].text,/Own maximum delegated contract price.*30000/);
 assert.equal(adapter.status().requestsAttempted,2);
 assert.equal(adapter.status().verifiedTokens,80);
 assert.equal(adapter.status().circuitOpen,false);
});
test('budget cap preclaims requests before any fetch and refuses excess',async()=>{
 let calls=0;
 const adapter=setup(async()=>{calls++;return body('OFFER',29900);},{maxRequests:1});
 assert.equal((await adapter.sellerAgent(sellerView)).amountMinor,29900);
 await assert.rejects(()=>adapter.buyerAgent(buyerView),e=>e.code==='GEMINI_A2A_BUDGET_EXHAUSTED');
 assert.equal(calls,1);
 assert.equal(adapter.status().requestsAttempted,1);
});
test('observed token cap opens circuit permanently without retry',async()=>{
 let calls=0;
 const adapter=setup(async()=>{calls++;return body('OFFER',29900,400);},{maxTotalTokens:300});
 await assert.rejects(()=>adapter.sellerAgent(sellerView),e=>e.code==='GEMINI_A2A_BUDGET_EXCEEDED');
 await assert.rejects(()=>adapter.sellerAgent(sellerView),e=>e.code==='GEMINI_A2A_CIRCUIT_OPEN');
 assert.equal(calls,1);
});
test('provider 429, 500, transport failures fail closed and never repeat the POST',async()=>{
 for(const [reply,reason] of [
  [new Response('quota',{status:429}),'GEMINI_A2A_PROVIDER_QUOTA_BLOCKED'],
  [new Response('server token leak',{status:500}),'GEMINI_A2A_PROVIDER_HTTP_FAILED'],
  [new Error('provider-secret-should-not-appear'),'GEMINI_A2A_TRANSPORT_UNKNOWN']
 ]){
  let calls=0;
  const adapter=setup(async()=>{calls++;if(reply instanceof Error)throw reply;return reply;});
  await assert.rejects(()=>adapter.sellerAgent(sellerView),e=>
   e.code===reason&&!e.message.includes('provider-secret')&&!e.message.includes(KEY));
  await assert.rejects(()=>adapter.sellerAgent(sellerView),e=>e.code==='GEMINI_A2A_CIRCUIT_OPEN');
  assert.equal(calls,1);
 }
});
test('schema injection, malformed JSON, missing usage and multiple candidates fail closed',async()=>{
 const examples=[
  {candidates:[{finishReason:'STOP',content:{parts:[{text:'{"action":"OFFER","amountMinor":29000,"paymentAuthorized":true}'}]}}],usageMetadata:{totalTokenCount:35}},
  {candidates:[{finishReason:'STOP',content:{parts:[{text:'not json'}]}}],usageMetadata:{totalTokenCount:35}},
  {candidates:[{finishReason:'STOP',content:{parts:[{text:'{"action":"OFFER","amountMinor":29000}'}]}}]},
  {candidates:[{finishReason:'STOP',content:{parts:[{text:'{"action":"OFFER","amountMinor":29000}'}]}} ,{finishReason:'STOP',content:{parts:[{text:'{}'}]}}],usageMetadata:{totalTokenCount:30}}
 ];
 for(const obj of examples){
  const adapter=setup(async()=>new Response(JSON.stringify(obj),{status:200}));
  await assert.rejects(()=>adapter.sellerAgent(sellerView),e=>e.code.startsWith('GEMINI_A2A_'));
  assert.equal(adapter.status().circuitOpen,true);
 }
});
test('oversized response declared or streamed, unsafe trusted context and invalid role are rejected',async()=>{
 let calls=0;
 const oversized=setup(async()=>{calls++;return new Response('x'.repeat(17000),{status:200});});
 await assert.rejects(()=>oversized.sellerAgent(sellerView),e=>e.code==='GEMINI_A2A_RESPONSE_TOO_LARGE');
 assert.equal(calls,1);
 const invalid=setup(async()=>{calls++;return body('OFFER',30000)});
 await assert.rejects(()=>invalid.sellerAgent({...sellerView,role:'buyer'}),e=>e.code==='GEMINI_A2A_INVALID_TRUSTED_CONTEXT');
 assert.equal(calls,1);
});
test('abort before fetch cannot send and closes the private circuit',async()=>{
 let calls=0;const controller=new AbortController();controller.abort();
 const adapter=setup(async()=>{calls++;return body('OFFER',29000);});
 await assert.rejects(()=>adapter.sellerAgent({...sellerView,signal:controller.signal}),e=>e.code==='GEMINI_A2A_ABORTED_BEFORE_SEND');
 assert.equal(calls,0);
 assert.equal(adapter.status().circuitOpen,true);
});
test('malicious extra amount/role fields and lack of true STOP cannot pass to A2A protocol',async()=>{
 for(const candidate of [
  {finishReason:'MAX_TOKENS',content:{parts:[{text:'{"action":"OFFER","amountMinor":29000}'}]}},
  {finishReason:'STOP',content:{parts:[{text:'{"action":"ACCEPT","amountMinor":29000,"role":"seller"}'}]}}
 ]){
  const adapter=setup(async()=>new Response(JSON.stringify({candidates:[candidate],usageMetadata:{totalTokenCount:30}}),{status:200}));
  const out=await runBoundedA2A({...adapter,buyerMaxMinor:30000,sellerMinMinor:27000,
   maxTurns:4,turnTimeoutMs:2000});
  assert.equal(out.status,'BLOCKED');
  assert.equal(out.reason,'AGENT_EXECUTION_FAILED');
  assert.equal(out.paymentAuthorized,false);
  assert.equal(adapter.status().circuitOpen,true);
 }
});
