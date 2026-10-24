import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createQuoteApi} from '../src/quote_api.mjs';
import {createOfflineMockDraftProvider} from '../src/quote_draft.mjs';

const SCOPE='Design a responsive synthetic portfolio website for review';
const draft={scope:SCOPE,expectedVersion:2,externalAiConsent:true};
const req=(data=draft, id='q1')=>new Request('https://safe.test/api/quotes/'+id+'/draft',{
 method:'POST',headers:{'content-type':'application/json','origin':'https://safe.test',
 'x-csrf-token':'synthetic-csrf'},body:JSON.stringify(data)
});
function provider(fn){
 const p=async args=>fn(args);
 Object.defineProperty(p,'requiresExternalConsent',{value:true});
 return p;
}
const good=provider(async()=>({source:'GEMINI_API',suggestedMinor:20000}));
const api=(repo,p=good,actor='owner')=>createQuoteApi({repository:repo,
 resolveSession:async()=>({verified:true,actorId:actor,csrfToken:'synthetic-csrf'}),
 draftProvider:p});
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'ai-cas-'));
 const filename=join(dir,'data.sqlite');
 const db=createSqliteLedger({filename});
 return {db,filename,close(){db.close();rmSync(dir,{recursive:true,force:true});}};
}
const seed=async(db,id='q1',owner='owner')=>db.insertQuote({id,ownerId:owner,
 merchantId:'synthetic-merchant',version:2});
test('external provider requires durable claim and unknown-mark interfaces at construction',()=>{
 const fake={get:async()=>null,approve:async()=>null,revise:async()=>null};
 assert.throws(()=>api(fake),/DURABLE_AI_RESERVATION/);
});
test('missing consent or invalid CSRF cannot reserve or call external provider',async()=>{
 const f=fixture();
 try{
  await seed(f.db);let calls=0;
  const p=provider(async()=>{calls++;return good();});
  const handler=api(f.db,p);
  assert.equal((await handler(req({...draft,externalAiConsent:false}))).status,403);
  const bad=new Request('https://safe.test/api/quotes/q1/draft',{
   method:'POST',headers:{'content-type':'application/json','origin':'https://safe.test',
    'x-csrf-token':'wrong'},body:JSON.stringify(draft)});
  assert.equal((await handler(bad)).status,403);
  assert.equal(calls,0);
  assert.equal(await f.db.getAiDraftAttempt({id:'q1',expectedVersion:2}),null);
 }finally{f.close();}
});
test('two simultaneous draft submissions commit once, external call once, second returns 409',async()=>{
 const f=fixture();
 try{
  await seed(f.db);let calls=0,release;
  const waiting=new Promise(resolve=>{release=resolve;});
  const p=provider(async()=>{calls++;await waiting;return {source:'GEMINI_API',suggestedMinor:25000};});
  const h=api(f.db,p);
  const first=h(req());
  // First reaches pending provider only after its SQLite transaction.
  for(let i=0;i<10&&calls===0;i++)await Promise.resolve();
  assert.equal(calls,1);
  const duplicate=await h(req());
  assert.equal(duplicate.status,409);
  assert.equal((await duplicate.json()).error,'AI_DRAFT_ALREADY_CLAIMED');
  assert.equal(calls,1);
  release();
  const result=await first;
  assert.equal(result.status,200);
  assert.equal((await f.db.get('q1')).version,3);
  assert.equal((await f.db.getAiDraftAttempt({id:'q1',expectedVersion:2})).state,'COMMITTED');
  assert.equal(calls,1);
 }finally{f.close();}
});
test('after provider error, claim remains UNKNOWN and manual replay never calls provider again',async()=>{
 const f=fixture();
 try{
  await seed(f.db);let calls=0;
  const h=api(f.db,provider(async()=>{calls++;throw Error('private provider error');}));
  const first=await h(req());
  assert.equal(first.status,503);
  assert.equal((await first.json()).error,'DRAFT_PROVIDER_UNAVAILABLE');
  assert.equal((await f.db.getAiDraftAttempt({id:'q1',expectedVersion:2})).state,'UNKNOWN');
  const again=await h(req());
  assert.equal(again.status,409);assert.equal(calls,1);
  assert.equal((await f.db.get('q1')).version,2);
 }finally{f.close();}
});
test('process restart keeps RESERVED after crash; no new provider call',async()=>{
 const f=fixture();
 try{
  await seed(f.db);
  await f.db.claimAiDraft({id:'q1',actorId:'owner',expectedVersion:2});
  f.db.close();
  const reopened=createSqliteLedger({filename:f.filename});
  try{
   let calls=0;
   const h=api(reopened,provider(async()=>{calls++;return {source:'GEMINI_API',suggestedMinor:25000};}));
   assert.equal((await h(req())).status,409);
   assert.equal(calls,0);
   assert.equal((await reopened.getAiDraftAttempt({id:'q1',expectedVersion:2})).state,'RESERVED');
  }finally{reopened.close();}
 }finally{rmSync(f.filename,{force:true});rmSync(f.filename+'-wal',{force:true});rmSync(f.filename+'-shm',{force:true});}
});
test('global pilot budget is one reservation per persistent SQLite file',async()=>{
 const f=fixture();
 try{
  await seed(f.db,'q1');await seed(f.db,'q2');
  const h=api(f.db);
  assert.equal((await h(req())).status,200);
  const second=await h(req(draft,'q2'));
  assert.equal(second.status,429);
  assert.equal((await second.json()).error,'AI_DRAFT_BUDGET_EXHAUSTED');
  assert.equal((await f.db.get('q2')).version,2);
 }finally{f.close();}
});
test('stale version, wrong owner, approved quote never reserve an external request',async()=>{
 const f=fixture();
 try{
  await seed(f.db);
  let calls=0;
  const p=provider(async()=>{calls++;return {source:'GEMINI_API',suggestedMinor:20000};});
  const h=api(f.db,p);
  assert.equal((await h(req({...draft,expectedVersion:1}))).status,409);
  assert.equal((await api(f.db,p,'other')(req())).status,404);
  await f.db.approve({id:'q1',actorId:'owner',expectedVersion:2,amountMinor:20000});
  assert.equal((await h(req())).status,409);
  assert.equal(calls,0);
  assert.equal(await f.db.getAiDraftAttempt({id:'q1',expectedVersion:2}),null);
 }finally{f.close();}
});
test('mock revision cannot race pending external claim; existing mock demo otherwise intact',async()=>{
 const f=fixture();
 try{
  await seed(f.db);
  await f.db.claimAiDraft({id:'q1',actorId:'owner',expectedVersion:2});
  const mock=api(f.db,createOfflineMockDraftProvider());
  const response=await mock(req({...draft,externalAiConsent:false}));
  assert.equal(response.status,409);
  assert.equal((await response.json()).error,'AI_DRAFT_IN_FLIGHT');
  assert.equal((await f.db.get('q1')).version,2);
  // Simulated failed request can be resolved by owner choosing a mock-only new version.
  await f.db.markAiDraftUnknown({id:'q1',actorId:'owner',expectedVersion:2});
  assert.equal((await mock(req({...draft,externalAiConsent:false}))).status,200);
 }finally{f.close();}
});
test('manual approval blocked while external AI is RESERVED',async()=>{
 const f=fixture();
 try{
  await seed(f.db);
  await f.db.claimAiDraft({id:'q1',actorId:'owner',expectedVersion:2});
  await assert.rejects(f.db.approve({id:'q1',actorId:'owner',expectedVersion:2,amountMinor:25000}),
    {code:'AI_DRAFT_IN_FLIGHT'});
 }finally{f.close();}
});
test('forged GEMINI source without valid claim cannot persist',async()=>{
 const f=fixture();
 try{
  await seed(f.db);
  await assert.rejects(f.db.revise({id:'q1',actorId:'owner',expectedVersion:2,
   scope:SCOPE,suggestedMinor:20000,suggestionSource:'GEMINI_API'}),
   {code:'AI_DRAFT_CLAIM_REQUIRED'});
 }finally{f.close();}
});
