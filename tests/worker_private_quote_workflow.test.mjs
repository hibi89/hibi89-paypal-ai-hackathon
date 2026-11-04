import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createWorkerPrivateQuoteWorkflow} from '../src/worker_private_quote_workflow.mjs';
const ORIGIN='https://owner.proofline-review.dev',NOW=1793710000000;
const TOKEN='a'.repeat(43),BIND='c'.repeat(64),ISS='https://login.proofline-review.dev';
const CID='0047f90c-96d4-4fca-a28c-f6e9a78fd193';
const sha=x=>createHash('sha256').update(x).digest('hex');
function fixture(){
 const db=new DatabaseSync(':memory:');
 const names=['0001_payment_claims.sql','0002_worker_private_sessions.sql',
  '0003_worker_private_oidc.sql','0004_worker_private_binding_epoch.sql'];
 for(const name of names)db.exec(readFileSync(new URL('../migrations/d1/'+name,import.meta.url),'utf8'));
 db.prepare('INSERT INTO worker_private_oidc_bindings (issuer,subject_hmac,actor_id,merchant_id,role,active) VALUES(?,?,?,?,?,1)')
  .run(ISS,BIND,'owner-1','merchant-1','OWNER');
 db.prepare('INSERT INTO worker_private_sessions (token_sha256,actor_id,merchant_id,role,issuer,issuer_verified_at_ms,expires_at_ms,binding_subject_hmac,binding_revision) VALUES(?,?,?,?,?,?,?,?,?)')
  .run(sha(TOKEN),'owner-1','merchant-1','OWNER',ISS,NOW-1000,NOW+60000,BIND,1);
 let beforeWrite=()=>{};
 const wrapper={withSession(mode){
  assert.equal(mode,'first-primary');
  return {prepare(sql){
   if(sql.startsWith('INSERT INTO quotes ')||sql.startsWith('UPDATE quotes SET status=')||
      sql.startsWith('UPDATE quotes SET version='))beforeWrite(sql);
   return {bind(...params){
    const st=db.prepare(sql);
    return {async first(){return st.get(...params)},
     async all(){return {results:st.all(...params)}},
     async run(){return {meta:{changes:st.run(...params).changes}}}};
   }};
  }};
 }};
 return {db,handler:createWorkerPrivateQuoteWorkflow({db:wrapper,allowedOrigin:ORIGIN,now:()=>NOW}),
  setBeforeWrite:fn=>{beforeWrite=fn}};
}
function request(path,method='GET',body,options={}){
 const headers={cookie:'__Host-proofline_session='+TOKEN,
  'sec-fetch-site':'same-origin',origin:ORIGIN,
  ...(method==='POST'?{'content-type':'application/json',
   'x-proofline-intent':path.endsWith('/approve')?'quote-approve':
    path.endsWith('/revise')?'quote-revise':'quote-draft'}:{}),
  ...options};
 return new Request(ORIGIN+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
}
const draft={clientRequestId:CID,scopeText:'Build verified client project dashboard and submit source files'};
test('D1 owner quote GET is scoped; anonymous/cross-site/non-GET denied',async()=>{
 const {handler,db}=fixture();
 assert.deepEqual((await (await handler.fetch(request('/__private/quotes'))).json()).quotes,[]);
 assert.equal((await handler.fetch(new Request(ORIGIN+'/__private/quotes'))).status,401);
 assert.equal((await handler.fetch(request('/__private/quotes','GET',undefined,{'sec-fetch-site':'cross-site'}))).status,403);
 assert.equal((await handler.fetch(request('/__private/quotes?limit=99'))).status,400);
 assert.equal((await handler.fetch(request('/__private/quotes?limit=20'))).status,200);
 assert.equal((await handler.fetch(request('/api/paypal/capture','POST',{}))).status,404);
 db.close();
});
test('draft stores real quote and repeated ID cannot duplicate/change it',async()=>{
 const f=fixture();
 const r=await f.handler.fetch(request('/__private/quotes','POST',draft));
 assert.equal(r.status,201);const data=await r.json();
 assert.equal(data.quote.status,'PROPOSED');assert.equal(data.quote.source,'HUMAN_DRAFT_NO_AI');
 assert.equal(data.providerCalls,0);assert.equal(data.paymentAuthorized,false);
 assert.match(data.quote.quoteId,/^q_[a-f0-9]{32}$/);
 const replay=await f.handler.fetch(request('/__private/quotes','POST',draft));
 assert.equal(replay.status,200);assert.equal((await replay.json()).idempotentReplay,true);
 assert.equal((await f.handler.fetch(request('/__private/quotes','POST',{
  ...draft,scopeText:'A completely different scope text'}))).status,409);
 assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM quotes').get().n,1);
 f.db.close();
});
test('explicit human approval: version/amount CAS, replay safe and no payment attempts',async()=>{
 const f=fixture();
 const q=(await (await f.handler.fetch(request('/__private/quotes','POST',draft))).json()).quote;
 const path='/__private/quotes/'+q.quoteId+'/approve';
 assert.equal((await f.handler.fetch(request(path,'POST',{expectedVersion:1,amountMinor:12000},
  {'origin':'https://evil.dev'}))).status,403);
 const r=await f.handler.fetch(request(path,'POST',{expectedVersion:1,amountMinor:12000}));
 assert.equal(r.status,200);const data=await r.json();
 assert.equal(data.approved,true);assert.equal(data.humanApproval,true);
 assert.equal(data.quote.approvedAmountMinor,12000);assert.equal(data.paymentAuthorized,false);
 const repeat=await f.handler.fetch(request(path,'POST',{expectedVersion:1,amountMinor:12000}));
 assert.equal((await repeat.json()).idempotentReplay,true);
 assert.equal((await f.handler.fetch(request(path,'POST',{expectedVersion:1,amountMinor:13000}))).status,409);
 assert.equal((await f.handler.fetch(request(path,'POST',{expectedVersion:2,amountMinor:12000}))).status,409);
 const row=f.db.prepare('SELECT status,approval_amount_minor,approval_actor FROM quotes').get();
 assert.equal(row.status,'APPROVED');assert.equal(row.approval_amount_minor,12000);
 assert.equal(row.approval_actor,'owner-1');
 assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM payment_attempts').get().n,0);
 f.db.close();
});
test('mid-request binding revocation blocks atomic D1 quote mutation',async()=>{
 const f=fixture();
 f.setBeforeWrite(()=>f.db.prepare('UPDATE worker_private_oidc_bindings SET active=0 WHERE issuer=?').run(ISS));
 assert.equal((await f.handler.fetch(request('/__private/quotes','POST',draft))).status,503);
 assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM quotes').get().n,0);
 assert.equal((await f.handler.fetch(request('/__private/quotes','POST',draft))).status,401);
 f.db.close();
});
test('invalid body and cross-origin write never create quote',async()=>{
 const f=fixture();
 for(const body of [{...draft,scopeText:'tiny'},{...draft,clientRequestId:'bad'},
   {...draft,ownerId:'evil'},{...draft,scopeText:'bad\nscope'}])
  assert.equal((await f.handler.fetch(request('/__private/quotes','POST',body))).status,400);
 assert.equal((await f.handler.fetch(request('/__private/quotes','POST',draft,
  {'x-proofline-intent':'wrong'}))).status,403);
 assert.equal((await f.handler.fetch(request('/__private/quotes/id/approve','GET'))).status,405);
 assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM quotes').get().n,0);
 f.db.close();
});

test('pre-existing D1 approved quotes without a scope remain readable and immutable',async()=>{
 const f=fixture();
 f.db.prepare("INSERT INTO quotes(id,owner_id,merchant_id,version,currency,status,approval_actor,approval_version,approval_amount_minor) VALUES('legacyQuote','owner-1','merchant-1',1,'USD','APPROVED','owner-1',1,250)").run();
 const listed=await f.handler.fetch(request('/__private/quotes?limit=20'));
 assert.equal(listed.status,200);
 const data=await listed.json();
 assert.equal(data.count,1);
 assert.equal(data.quotes[0].quoteId,'legacyQuote');
 assert.equal(data.quotes[0].scopeText,null);
 assert.equal(data.quotes[0].approvedAmountMinor,250);
 assert.equal((await f.handler.fetch(request('/__private/quotes/legacyQuote/approve','POST',
  {amountMinor:300,expectedVersion:1}))).status,409);
 f.db.close();
});

test('owner D1 draft revision is versioned, idempotent conflict-safe and still requires human approval',async()=>{
 const f=fixture();
 try{
  const q=(await (await f.handler.fetch(request('/__private/quotes','POST',draft))).json()).quote;
  const path='/__private/quotes/'+q.quoteId+'/revise';
  const content='Additional verified scope: responsive interface plus evidence dashboard';
  const res=await f.handler.fetch(request(path,'POST',{expectedVersion:1,scopeText:content}));
  assert.equal(res.status,200);const b=await res.json();
  assert.equal(b.revised,true);assert.equal(b.humanApprovalRequired,true);
  assert.equal(b.paymentAuthorized,false);assert.equal(b.providerCalls,0);
  assert.equal(b.quote.status,'PROPOSED');assert.equal(b.quote.version,2);
  assert.equal(b.quote.scopeText,content);assert.equal(b.quote.approvedAmountMinor,null);
  assert.equal((await f.handler.fetch(request(path,'POST',{expectedVersion:1,scopeText:content}))).status,409);
  assert.equal((await f.handler.fetch(request('/__private/quotes/'+q.quoteId+'/approve','POST',
    {expectedVersion:1,amountMinor:1500}))).status,409);
  assert.equal((await f.handler.fetch(request('/__private/quotes/'+q.quoteId+'/approve','POST',
    {expectedVersion:2,amountMinor:1500}))).status,200);
  assert.equal((await f.handler.fetch(request(path,'POST',{expectedVersion:2,scopeText:content}))).status,409);
  assert.equal(f.db.prepare('SELECT version,status FROM quotes').get().status,'APPROVED');
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM payment_attempts').get().n,0);
 }finally{f.db.close()}
});
test('D1 revision requires same-origin and trusted intent and survives midflight revocation',async()=>{
 const f=fixture();
 try{
  const q=(await (await f.handler.fetch(request('/__private/quotes','POST',draft))).json()).quote;
  const path='/__private/quotes/'+q.quoteId+'/revise';
  const good={expectedVersion:1,scopeText:'Edited service acceptance scope for a verified owner only'};
  assert.equal((await f.handler.fetch(request(path,'GET'))).status,405);
  assert.equal((await f.handler.fetch(request(path,'POST',good,{origin:'https://evil.example'}))).status,403);
  assert.equal((await f.handler.fetch(request(path,'POST',good,{'x-proofline-intent':'quote-approve'}))).status,403);
  for(const wrong of [{...good,expectedVersion:0},{...good,scopeText:'short'},
    {...good,scopeText:'Invalid'+String.fromCharCode(10)+'scope edit'},
    {...good,ownerId:'untrusted'}])
   assert.equal((await f.handler.fetch(request(path,'POST',wrong))).status,400);
  assert.equal((await f.handler.fetch(request('/__private/quotes/different/revise','POST',good))).status,404);
  f.setBeforeWrite(()=>f.db.prepare('UPDATE worker_private_oidc_bindings SET active=0 WHERE issuer=?').run(ISS));
  assert.equal((await f.handler.fetch(request(path,'POST',good))).status,503);
  assert.equal(f.db.prepare('SELECT version FROM quotes').get().version,1);
  assert.equal((await f.handler.fetch(request(path,'POST',good))).status,401);
 }finally{f.db.close()}
});
test('claimed PayPal attempt makes existing quote immutable to revision',async()=>{
 const f=fixture();
 try{
  const q=(await (await f.handler.fetch(request('/__private/quotes','POST',draft))).json()).quote;
  f.db.prepare("INSERT INTO payment_attempts(request_id,quote_id,quote_version,merchant_id,operation,state,amount_minor,currency) VALUES('attempt1',?,1,'merchant-1','create','UNKNOWN',1500,'USD')").run(q.quoteId);
  const res=await f.handler.fetch(request('/__private/quotes/'+q.quoteId+'/revise','POST',
    {expectedVersion:1,scopeText:'No revisions after a PayPal claim has been made'}));
  assert.equal(res.status,409);
  assert.equal((await res.json()).error,'QUOTE_REVISION_CONFLICT');
  assert.equal(f.db.prepare('SELECT version FROM quotes').get().version,1);
 }finally{f.db.close()}
});
