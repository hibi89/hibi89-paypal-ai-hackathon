import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createWorkerD1ContractFlow} from '../src/worker_d1_contract_flow.mjs';

// ONLY TEST DATA: request header here simulates a trusted OIDC resolver.
// This factory is not connected to any public route.
const ORIGIN='https://owner.proofline-review.dev';
const A='owner-ci',S='seller-ci',R='reviewer-ci',M='merchant-ci';
const C='ea850c4b-f130-4e5f-a445-5b1d8e0e69b0';
const E='38f96011-8010-4fe3-9e14-d7452ae724aa';
const F='38f96011-8010-4fe3-9e14-d7452ae724ab';
const G='38f96011-8010-4fe3-9e14-d7452ae724ac';
const D='38f96011-8010-4fe3-9e14-d7452ae724ad';
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 for(const file of ['0001_payment_claims.sql','0002_worker_private_sessions.sql',
  '0003_worker_private_oidc.sql','0004_worker_private_binding_epoch.sql'])
  sqlite.exec(readFileSync(new URL('../migrations/d1/'+file,import.meta.url),'utf8'));
 sqlite.exec(readFileSync(new URL('../migrations/d1_candidate/0005_contract_role_milestones.sql',import.meta.url),'utf8'));
 sqlite.prepare("INSERT INTO quotes(id,owner_id,merchant_id,version,currency,status,approval_actor,approval_version,approval_amount_minor,scope_text) VALUES('verifiedQuote',?,?,1,'USD','APPROVED',?,1,12750,'A verified owner quote')").run(A,M,A);
 const add=sqlite.prepare('INSERT INTO worker_contract_memberships(actor_id,merchant_id,role) VALUES(?,?,?)');
 add.run(A,M,'BUYER');add.run(S,M,'SELLER');add.run(R,M,'REVIEWER');
 const db={withSession(mode){
  assert.equal(mode,'first-primary');
  return {prepare(sql){
   const st=sqlite.prepare(sql);
   return {bind(...args){return {
    async first(){return st.get(...args)},
    async all(){return {results:st.all(...args)}},
    async run(){return {meta:{changes:st.run(...args).changes}}}
   }}};
  }};
 }};
 const api=createWorkerD1ContractFlow({db,allowedOrigin:ORIGIN,now:()=>1793710000000,
  resolveVerifiedPrincipal:async request=>{
   const actorId=request.headers.get('x-ci-test-actor');
   if(![A,S,R].includes(actorId))throw Error('CI_NOT_VERIFIED');
   return {verified:true,actorId,merchantId:M};
  }});
 return {sqlite,api};
}
function req(actor,path,method='GET',body,extra={}){
 const headers={'x-ci-test-actor':actor,'sec-fetch-site':'same-origin',origin:ORIGIN,
  ...(method==='POST'?{'content-type':'application/json',
   'x-proofline-intent':path==='/__private/contracts'?'contract-create':
    'contract-'+path.split('/').at(-1)}:{}),...extra};
 return new Request(ORIGIN+path,{method,headers,
  ...(body===undefined?{}:{body:JSON.stringify(body)})});
}
const data={quoteId:'verifiedQuote',quoteVersion:1,sellerId:S,reviewerId:R,
 milestoneId:'deliverable-1',milestoneTitle:'Deliver source and an acceptance checklist',
 clientRequestId:C};
async function create(f){
 const response=await f.api.fetch(req(A,'/__private/contracts','POST',data));
 assert.equal(response.status,201);
 const payload=await response.json();
 assert.equal(payload.contract.state,'PENDING');
 assert.equal(payload.contract.amountMinor,12750);
 assert.equal(payload.paymentAuthorized,false);
 return payload.contract.contractId;
}
const act=(id,verb)=>'/__private/contracts/'+id+'/milestones/deliverable-1/'+verb;

test('candidate schema preserves original quote and foreign keys',()=>{
 const f=fixture();
 assert.equal(f.sqlite.prepare("SELECT status FROM quotes WHERE id='verifiedQuote'").get().status,'APPROVED');
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name LIKE 'worker_contract%'").get().n,3);
 assert.equal(f.sqlite.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
 f.sqlite.close();
});
test('buyer creates real D1 contract once; replay prevents duplicates and assignment tampering',async()=>{
 const f=fixture(),id=await create(f);
 const again=await f.api.fetch(req(A,'/__private/contracts','POST',data));
 assert.equal(again.status,200);
 assert.equal((await again.json()).idempotentReplay,true);
 const conflict=await f.api.fetch(req(A,'/__private/contracts','POST',
  {...data,milestoneTitle:'A different milestone specification'}));
 assert.equal(conflict.status,409);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM worker_contracts').get().n,1);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM worker_contract_events').get().n,1);
 assert.throws(()=>f.sqlite.prepare('UPDATE worker_contracts SET seller_id=?').run('forged'),/CONTRACT_ASSIGNMENT_IMMUTABLE/);
 assert.throws(()=>f.sqlite.prepare('DELETE FROM worker_contracts').run(),/CONTRACT_DELETION_FORBIDDEN/);
 assert.throws(()=>f.sqlite.prepare('DELETE FROM worker_contract_events').run(),/CONTRACT_AUDIT_IMMUTABLE/);
 f.sqlite.close();
});
test('seller and reviewer separately transition and D1 audit event versions are monotonic',async()=>{
 const f=fixture(),id=await create(f);
 const r1=await f.api.fetch(req(S,act(id,'submit'),'POST',{
  expectedVersion:1,eventId:E,detail:'Submitted source and QA report'
 }));
 assert.equal(r1.status,200);assert.equal((await r1.json()).contract.state,'SUBMITTED');
 const replay=await f.api.fetch(req(S,act(id,'submit'),'POST',{
  expectedVersion:1,eventId:E,detail:'Submitted source and QA report'
 }));
 assert.equal((await replay.json()).idempotentReplay,true);
 assert.equal((await f.api.fetch(req(A,act(id,'accept'),'POST',{
  expectedVersion:2,eventId:F,detail:'Buyer not reviewer'
 }))).status,403);
 const reject=await f.api.fetch(req(R,act(id,'reject'),'POST',{
  expectedVersion:2,eventId:F,detail:'Missing acceptance details'
 }));
 assert.equal(reject.status,200);assert.equal((await reject.json()).contract.state,'REJECTED');
 assert.equal((await f.api.fetch(req(S,act(id,'submit'),'POST',{
  expectedVersion:2,eventId:G,detail:'Stale request'
 }))).status,409);
 assert.equal((await f.api.fetch(req(S,act(id,'submit'),'POST',{
  expectedVersion:3,eventId:G,detail:'Corrected deliverables'
 }))).status,200);
 const accept=await f.api.fetch(req(R,act(id,'accept'),'POST',{
  expectedVersion:4,eventId:D,detail:'Reviewed and accepted'
 }));
 assert.equal(accept.status,200);
 assert.equal((await accept.json()).contract.state,'ACCEPTED');
 const events=f.sqlite.prepare('SELECT action,version FROM worker_contract_events ORDER BY version').all();
 assert.deepEqual(events.map(x=>x.action),['CREATE','SUBMIT','REJECT','SUBMIT','ACCEPT']);
 assert.deepEqual(events.map(x=>x.version),[1,2,3,4,5]);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM payment_attempts').get().n,0);
 f.sqlite.close();
});
test('operator preprovisioned seller/reviewer grants are mandatory and revocable',async()=>{
 const f=fixture();
 assert.equal((await f.api.fetch(req(S,'/__private/contracts','POST',data))).status,403);
 assert.equal((await f.api.fetch(req(A,'/__private/contracts','POST',
  {...data,sellerId:'not-provisioned'}))).status,409);
 const id=await create(f);
 for(const actor of [A,S,R]){
  const r=await f.api.fetch(req(actor,'/__private/contracts'));
  assert.equal((await r.json()).count,1);
 }
 assert.equal((await f.api.fetch(req(null,'/__private/contracts'))).status,401);
 f.sqlite.prepare('UPDATE worker_contract_memberships SET active=0,revision=revision+1 WHERE actor_id=?').run(S);
 assert.equal((await f.api.fetch(req(S,act(id,'submit'),'POST',{
  expectedVersion:1,eventId:E,detail:'Denied after grant revocation'
 }))).status,401);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM worker_contract_events').get().n,1);
 f.sqlite.close();
});
test('origin, body, role, method and unknown payment endpoints cannot mutate D1',async()=>{
 const f=fixture();
 assert.equal((await f.api.fetch(req(A,'/__private/contracts','POST',data,
  {origin:'https://evil.dev'}))).status,403);
 assert.equal((await f.api.fetch(req(A,'/__private/contracts','POST',
  {...data,clientRequestId:'bad'}))).status,400);
 assert.equal((await f.api.fetch(req(A,'/__private/contracts','POST',
  {...data,merchantId:M}))).status,400);
 assert.equal((await f.api.fetch(req(A,'/__private/contracts','POST',data,
  {'x-proofline-intent':'wrong'}))).status,403);
 assert.equal((await f.api.fetch(req(A,'/__private/contracts?limit=21'))).status,400);
 assert.equal((await f.api.fetch(req(A,'/__private/contracts/x/milestones/m/submit'))).status,405);
 assert.equal((await f.api.fetch(req(A,'/api/paypal/capture','POST',data))).status,404);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM worker_contracts').get().n,0);
 f.sqlite.close();
});
