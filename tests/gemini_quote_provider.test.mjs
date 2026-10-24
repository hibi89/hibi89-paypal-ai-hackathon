import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createGeminiQuoteDraftProvider} from '../src/gemini_quote_provider.mjs';
import {GEMINI_P0_MODEL,GEMINI_P0_ENDPOINT} from '../src/gemini_p0_model.mjs';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createQuoteApi} from '../src/quote_api.mjs';

const scope='Build a responsive landing page for a fictional local business';
const good=()=>({status:200,json:async()=>({candidates:[{finishReason:'STOP',
 content:{parts:[{text:'{"suggestedMinor":25000}' }]}}]})});
const opts={apiKey:'SYNTHETIC_NONSECRET',ownerAuthorized:true,freeTierConfirmed:true};
const req=data=>new Request('https://sample.test/api/quotes/q1/draft',{
 method:'POST',headers:{'content-type':'application/json','origin':'https://sample.test',
 'x-csrf-token':'synthetic-csrf'},body:JSON.stringify(data)
});
const draft={scope,expectedVersion:2};
test('real adapter requires explicit owner Free Tier and a private injected transport',()=>{
 for(const x of [{...opts,ownerAuthorized:false,fetchImpl:good},
  {...opts,freeTierConfirmed:false,fetchImpl:good},
  {...opts,apiKey:'',fetchImpl:good},{...opts}])
  assert.throws(()=>createGeminiQuoteDraftProvider(x));
});
test('single fixed Gemini JSON-schema request; no arbitrary endpoint or output leak',async()=>{
 const calls=[];
 const fn=createGeminiQuoteDraftProvider({...opts,fetchImpl:async(url,o)=>{
   calls.push({url,o});return good();}});
 const r=await fn({scope,currency:'USD'});
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
 assert.equal(calls[0].o.method,'POST');assert.equal(calls[0].o.redirect,'error');
 assert.ok(calls[0].o.signal instanceof AbortSignal);
 const payload=JSON.parse(calls[0].o.body);
 assert.equal(payload.generationConfig.responseMimeType,'application/json');
 assert.deepEqual(payload.generationConfig.responseSchema.required,['suggestedMinor']);
 assert.equal(payload.generationConfig.maxOutputTokens,256);
 assert.ok(payload.contents[0].parts[0].text.includes(scope));
 assert.equal(r.source,'GEMINI_API');assert.equal(r.suggestedMinor,25000);
 assert.equal(JSON.stringify(r).includes(opts.apiKey),false);
 assert.equal(JSON.stringify(r).includes(scope),false);
});
test('invalid scopes and currencies never reach provider',async()=>{
 let calls=0;
 const fn=createGeminiQuoteDraftProvider({...opts,fetchImpl:async()=>{calls++;return good();}});
 for(const x of [{scope:'x',currency:'USD'},{scope,currency:'EUR'},
  {scope:scope+'\u0000',currency:'USD'}])await assert.rejects(fn(x));
 assert.equal(calls,0);
});
test('provider returns invalid or incomplete result: refuse quote',async()=>{
 for(const data of [
  {candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{"suggestedMinor":25000}'}]}}]},
  {candidates:[{finishReason:'STOP',content:{parts:[{text:'not json'}]}}]},
  {candidates:[{finishReason:'STOP',content:{parts:[{text:'{"suggestedMinor":1}'}]}}]},
  {candidates:[{finishReason:'STOP',content:{parts:[{text:'{"suggestedMinor":1.2}'}]}}]}
 ]){
  const fn=createGeminiQuoteDraftProvider({...opts,fetchImpl:async()=>({status:200,json:async()=>data})});
  await assert.rejects(fn({scope,currency:'USD'}));
 }
});
test('transport, provider HTTP and JSON failures sanitize output',async()=>{
 for(const transport of [async()=>{throw Error('PRIVATE_RESPONSE');},
   async()=>({status:429,json:async()=>({error:'PRIVATE_RESPONSE'})}),
   async()=>({status:200,json:async()=>{throw Error('PRIVATE_RESPONSE');}})]){
  const fn=createGeminiQuoteDraftProvider({...opts,fetchImpl:transport});
  await assert.rejects(fn({scope,currency:'USD'}),err=>{
    assert.equal(String(err).includes('PRIVATE_'),false);return true;});
 }
});
async function withQuote(transport,fn){
 const dir=mkdtempSync(join(tmpdir(),'ppl-ai-'));
 const db=createSqliteLedger({filename:join(dir,'test.sqlite')});
 try{
  await db.insertQuote({id:'q1',ownerId:'owner',merchantId:'merchant',version:2});
  const api=createQuoteApi({repository:db,
   resolveSession:async()=>({verified:true,actorId:'owner',csrfToken:'synthetic-csrf'}),
   draftProvider:createGeminiQuoteDraftProvider({...opts,fetchImpl:transport})});
  await fn({api,db});
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
}
test('no per-request external consent means no AI call or quote edit',async()=>{
 let calls=0;
 await withQuote(async()=>{calls++;return good();},async({api,db})=>{
  const r=await api(req(draft));
  assert.equal(r.status,403);
  assert.equal((await r.json()).error,'EXTERNAL_AI_CONSENT_REQUIRED');
  assert.equal(calls,0);assert.equal((await db.get('q1')).version,2);
 });
});
test('consented real AI quote stays proposed until human approves; no payment request',async()=>{
 await withQuote(async()=>good(),async({api,db})=>{
  const r=await api(req({...draft,externalAiConsent:true}));
  assert.equal(r.status,200);
  const body=await r.json();
  assert.equal(body.provider,'GEMINI_API');
  assert.equal(body.quote.suggestionSource,'GEMINI_API');
  assert.equal(body.quote.version,3);assert.equal(body.quote.status,'PROPOSED');
  assert.equal(body.quote.approval,null);
  assert.equal((await db.listAttempts('q1')).length,0);
 });
});
test('remote failure is safe 503 with no quote revision or sensitive text',async()=>{
 await withQuote(async()=>{throw Error('PRIVATE_RESPONSE');},async({api,db})=>{
  const r=await api(req({...draft,externalAiConsent:true}));
  assert.equal(r.status,503);
  const b=await r.json();
  assert.equal(b.error,'DRAFT_PROVIDER_UNAVAILABLE');
  assert.equal(JSON.stringify(b).includes('PRIVATE_'),false);
  assert.equal((await db.get('q1')).version,2);
 });
});

test('new-project candidate stays pinned even with arbitrary model and endpoint options',async()=>{
 assert.equal(GEMINI_P0_MODEL,'gemini-3.5-flash-lite');
 assert.equal(GEMINI_P0_ENDPOINT,'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
 let attempts=0;
 const f=createGeminiQuoteDraftProvider({...opts,model:'gemini-4-argon',
  endpoint:'https://unknown.test',fetchImpl:async url=>{
   attempts++;assert.equal(url,GEMINI_P0_ENDPOINT);return good();
  }});
 await f({scope,currency:'USD'});
 assert.equal(attempts,1);
});
test('model-denied requests stop without paid or old-model fallback',async()=>{
 const requests=[];
 const f=createGeminiQuoteDraftProvider({...opts,fetchImpl:async url=>{
  requests.push(url);return {status:404};
 }});
 await assert.rejects(f({scope,currency:'USD'}),{message:'AI_HTTP_FAILED'});
 assert.deepEqual(requests,[GEMINI_P0_ENDPOINT]);
});
