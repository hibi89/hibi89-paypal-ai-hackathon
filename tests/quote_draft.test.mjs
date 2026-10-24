import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteLedger } from '../src/sqlite_ledger.mjs';
import { createQuoteApi } from '../src/quote_api.mjs';
import { createOfflineMockDraftProvider } from '../src/quote_draft.mjs';

const base='https://demo.example';
const draftBody={scope:'Build an accessible and responsive freelancer portfolio landing page',
  expectedVersion:2};
const headers={'content-type':'application/json','x-csrf-token':'server-csrf',origin:base};
const request=(method,path,data=draftBody,over={})=>new Request(base+path,{
  method, ...(method==='POST' ? {
    headers:{...headers,...over},body:JSON.stringify(data),
  } : {headers:over}),
});
function fixture() {
  const dir=mkdtempSync(join(tmpdir(),'paypal-draft-'));
  const db=createSqliteLedger({filename:join(dir,'data.db')});
  const handle=createQuoteApi({repository:db,resolveSession:async()=>({
    verified:true,actorId:'owner',csrfToken:'server-csrf',
  }),draftProvider:createOfflineMockDraftProvider()});
  return {db,handle,close(){db.close();rmSync(dir,{recursive:true,force:true});}};
}
async function seeded(run) {
  const x=fixture();
  try {
    await x.db.insertQuote({id:'q1',ownerId:'owner',merchantId:'merchant',
      version:2,aiSuggestedMinor:9900});
    await run(x);
  } finally { x.close(); }
}
const draft='/api/quotes/q1/draft';
const approve='/api/quotes/q1/approve';
test('mock provider explicitly says NOT AI, deterministic for same scope',async()=>{
  const provider=createOfflineMockDraftProvider();
  const a=await provider({scope:draftBody.scope,currency:'USD'});
  assert.equal(a.source,'OFFLINE_MOCK');
  assert.ok(a.suggestedMinor>0);
  assert.deepEqual(a,await provider({scope:draftBody.scope,currency:'USD'}));
});
test('draft POST updates durable quote and bumps version',()=>seeded(async({db,handle})=>{
  const r=await handle(request('POST',draft));
  assert.equal(r.status,200);
  const x=await r.json();
  assert.equal(x.provider,'OFFLINE_MOCK');
  assert.match(x.warning,/not a live AI/i);
  assert.equal(x.quote.version,3);
  assert.equal(x.quote.status,'PROPOSED');
  assert.equal(x.quote.scope,draftBody.scope);
  assert.equal(x.quote.suggestionSource,'OFFLINE_MOCK');
  assert.equal((await db.get('q1')).version,3);
}));
test('draft changes invalidate older version approval and require new explicit human approval',()=>seeded(async({db,handle})=>{
  await db.approve({id:'q1',actorId:'owner',expectedVersion:2,amountMinor:1500});
  const result=await handle(request('POST',draft));
  assert.equal(result.status,200);
  const q=await db.get('q1');
  assert.equal(q.approval,null);
  assert.equal(q.status,'PROPOSED');
  const stale=await handle(request('POST',approve,
    {expectedVersion:2,confirmed:true,amountMinor:1500}));
  assert.equal(stale.status,409);
  const fresh=await handle(request('POST',approve,
    {expectedVersion:3,confirmed:true,amountMinor:2500}));
  assert.equal(fresh.status,200);
  assert.equal((await db.get('q1')).approval.amountMinor,2500);
}));
test('after payment claim quote cannot be revised even if approved',()=>seeded(async({db,handle})=>{
  await db.approve({id:'q1',actorId:'owner',expectedVersion:2,amountMinor:1500});
  await db.claimOperation({quoteId:'q1',actorId:'owner',merchantId:'merchant',operation:'create'});
  const resp=await handle(request('POST',draft));
  assert.equal(resp.status,409);
  assert.equal((await resp.json()).error,'PAYMENT_ATTEMPT_EXISTS');
  assert.equal((await db.get('q1')).version,2);
}));
test('GET and refresh never generate drafts or advance versions',()=>seeded(async({db,handle})=>{
  for(let i=0;i<5;i++) assert.equal((await handle(request('GET','/api/quotes/q1'))).status,200);
  const q=await db.get('q1');
  assert.equal(q.version,2);
  assert.equal(q.scope,null);
}));
test('draft requires CSRF protection, verified owner and matching version',()=>seeded(async({db,handle})=>{
  assert.equal((await handle(request('POST',draft,draftBody,{'x-csrf-token':'forged'}))).status,403);
  assert.equal((await handle(request('POST',draft,{...draftBody,expectedVersion:1}))).status,409);
  assert.equal((await db.get('q1')).version,2);
}));
test('invalid scope and control characters rejected without a version change',()=>seeded(async({db,handle})=>{
  for(const scope of ['', 'a', 'X'.repeat(501), 'scope with '+String.fromCharCode(0)]) {
    const resp=await handle(request('POST',draft,{...draftBody,scope}));
    assert.equal(resp.status,400);
  }
  assert.equal((await db.get('q1')).version,2);
}));
test('replayed draft POST for same expectedVersion cannot re-run revision',()=>seeded(async({db,handle})=>{
  assert.equal((await handle(request('POST',draft))).status,200);
  const r=await handle(request('POST',draft));
  assert.equal(r.status,409);
  assert.equal((await db.get('q1')).version,3);
}));
test('same SQLite file opened again keeps mock source, scope and revised version',()=>seeded(async({db,handle})=>{
  await handle(request('POST',draft));
  const value=await db.get('q1');
  assert.equal(value.suggestionSource,'OFFLINE_MOCK');
  assert.equal(value.scope,draftBody.scope);
}));
test('unconfigured AI provider fail-closed and no quote revision',()=>seeded(async({db})=>{
  const disabled=createQuoteApi({repository:db,resolveSession:async()=>({
    verified:true,actorId:'owner',csrfToken:'server-csrf',
  })});
  const r=await disabled(request('POST',draft));
  assert.equal(r.status,503);
  assert.equal((await r.json()).error,'DRAFT_PROVIDER_NOT_CONFIGURED');
  assert.equal((await db.get('q1')).version,2);
}));
test('payment POST remains 503, no provider request enabled',()=>seeded(async({db,handle})=>{
  await handle(request('POST',draft));
  await handle(request('POST',approve,{expectedVersion:3,confirmed:true,amountMinor:1500}));
  const r=await handle(request('POST','/api/quotes/q1/orders',{}));
  assert.equal(r.status,503);
  assert.equal((await db.listAttempts('q1')).length,0);
}));
