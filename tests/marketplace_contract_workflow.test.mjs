import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createMarketplaceIdentityPolicy} from '../src/marketplace_identity_policy.mjs';
import {createMarketplaceContractWorkflowApi} from '../src/marketplace_contract_workflow_api.mjs';

const origin='https://local.test';
const prefix='/api/demo/workflow/contracts/ct1/milestones/ms1/';
const id='csrf-test-token';
const member=[
 {actorId:'owner',merchantId:'tenantA',role:'buyer'},
 {actorId:'seller',merchantId:'tenantA',role:'seller',sellerProfileId:'seller-profile-1'},
 {actorId:'reviewer',merchantId:'tenantA',role:'reviewer'},
 {actorId:'stranger',merchantId:'tenantB',role:'seller',sellerProfileId:'foreign-profile'},
 {actorId:'operator',merchantId:'tenantA',role:'merchant_operator'}
];
function fixture(fn){
 return async()=>{
  const folder=mkdtempSync(join(tmpdir(),'paypal-seller-workflow-'));
  const filename=join(folder,'ledger.sqlite');
  let ledger=createSqliteLedger({filename});
  try{
   await ledger.insertQuote({id:'q1',ownerId:'owner',merchantId:'tenantA',version:1});
   await ledger.approve({id:'q1',actorId:'owner',expectedVersion:1,amountMinor:2400});
   for(const m of member)await ledger.provisionLocalMember(m);
   await ledger.createContract({id:'ct1',quoteId:'q1',actorId:'owner',
     merchantId:'tenantA',reviewerId:'reviewer',expectedVersion:1,eventId:'new-contract',
     milestones:[{id:'ms1',step:1,amountMinor:2400}]});
   await ledger.assignLocalContractSeller({contractId:'ct1',merchantId:'tenantA',
     sellerProfileId:'seller-profile-1'});
   await fn({ledger,filename,reopen:()=>{
     ledger.close(); ledger=createSqliteLedger({filename});return ledger;
   }});
  }finally{ledger.close();rmSync(folder,{recursive:true,force:true});}
 };
}
function harness(ledger){
 const sessions=new WeakMap();
 const resolveSession=request=>sessions.get(request);
 const policy=createMarketplaceIdentityPolicy({
  resolveTrustedSession:resolveSession,
  resolveMembership:a=>ledger.getLocalMember(a)
 });
 const api=createMarketplaceContractWorkflowApi({ledger,policy,resolveSession});
 let seq=0;
 return {
  async request(actor,verb,body,opts={}){
   const row=await ledger.getLocalMember(actor);
   const session=actor?{verified:true,actorId:actor,
     merchantId:opts.merchantId??row?.merchantId,csrfToken:id}:null;
   const request=new Request(origin+prefix+verb,{
    method:opts.method??'POST',
    headers:{
      'content-type':'application/json',
      'origin':opts.origin??origin,
      'x-csrf-token':opts.csrf??id,
      ...(opts.headers??{})
    },
    ...((opts.method??'POST')!=='GET'?{body:JSON.stringify(body)}:{})
   });
   if(session)sessions.set(request,session);
   const reply=await api(request);
   return {status:reply.status,data:await reply.json(),allow:reply.headers.get('allow')};
  },
  get:()=>ledger.getContract({contractId:'ct1',actorId:'owner',merchantId:'tenantA'}),
  events:()=>ledger.listContractEvents({contractId:'ct1',actorId:'owner',merchantId:'tenantA'})
 };
}
const detail='Completed all documented milestone deliverables';
test('assigned seller submits; assigned reviewer accepts, separate payment remains not captured',fixture(async({ledger})=>{
 const h=harness(ledger);
 const d=await h.request('seller','submit',{eventId:'seller-sub-1',
   expectedVersion:1,expectedState:'PENDING',detail});
 assert.equal(d.status,200,JSON.stringify(d.data));
 assert.equal(d.data.transition.state,'SUBMITTED');
 assert.equal(d.data.transition.version,2);
 assert.equal(d.data.transition.paymentAuthorized,false);
 assert.equal(d.data.providerCalls,0);
 const c=await h.get();
 assert.equal(c.milestones[0].state,'SUBMITTED');
 assert.equal(c.paymentState,'NOT_CAPTURED');
 assert.equal(c.milestones[0].deliveryNote,detail);
 const done=await h.request('reviewer','accept',{eventId:'review-ok-1',expectedVersion:2});
 assert.equal(done.status,200,JSON.stringify(done.data));
 assert.equal(done.data.transition.state,'ACCEPTED');
 assert.equal((await h.get()).version,3);
 const events=await h.events();
 assert.deepEqual(events.map(x=>x.eventType),['CREATED','SUBMITTED','ACCEPTED']);
 assert.deepEqual(events.map(x=>x.actorId),['owner','seller','reviewer']);
 assert.equal((await h.get()).paymentState,'NOT_CAPTURED');
 assert.equal((await ledger.listAttempts('q1')).length,0);
}));
test('reviewer rejection returns to assigned seller rework loop, then acceptance',fixture(async({ledger})=>{
 const h=harness(ledger);
 const sub=(v,state,e)=>h.request('seller','submit',{
   eventId:e,expectedVersion:v,expectedState:state,detail
 });
 assert.equal((await sub(1,'PENDING','sub-one')).status,200);
 const bad=await h.request('reviewer','reject',{eventId:'review-reject',expectedVersion:2,
   detail:'Please provide the corrected source archive'});
 assert.equal(bad.status,200);
 assert.equal((await h.get()).milestones[0].state,'REJECTED');
 assert.equal((await sub(3,'REJECTED','sub-two')).status,200);
 assert.equal((await h.request('reviewer','accept',{eventId:'review-ok',expectedVersion:4})).status,200);
 assert.equal((await h.get()).version,5);
 assert.deepEqual((await h.events()).map(x=>x.eventType),
  ['CREATED','SUBMITTED','REJECTED','SUBMITTED','ACCEPTED']);
}));
test('cross tenant, wrong role, forged headers, CSRF/origin and GET cannot change delivery',fixture(async({ledger})=>{
 const h=harness(ledger);
 for(const actor of ['owner','reviewer','operator','stranger']){
  const r=await h.request(actor,'submit',{expectedVersion:1,expectedState:'PENDING',
    eventId:'bad-'+actor,detail},{headers:{'x-role':'seller','x-actor-id':'seller'}});
  assert.ok([403,404].includes(r.status),JSON.stringify({actor,r}));
 }
 const forgery=await h.request('seller','submit',{expectedVersion:1,expectedState:'PENDING',
   eventId:'wrong-tenant',detail},{merchantId:'tenantB'});
 assert.ok([403,404].includes(forgery.status));
 const missing=await h.request(null,'submit',{expectedVersion:1,expectedState:'PENDING',
   eventId:'unauth',detail});
 assert.equal(missing.status,401);
 const badCsrf=await h.request('seller','submit',{expectedVersion:1,expectedState:'PENDING',
   eventId:'no-csrf',detail},{csrf:'invalid'});
 assert.equal(badCsrf.status,403);
 const badOrigin=await h.request('seller','submit',{expectedVersion:1,expectedState:'PENDING',
   eventId:'bad-origin',detail},{origin:'https://foreign.test'});
 assert.equal(badOrigin.status,403);
 const get=await h.request('seller','submit',{}, {method:'GET'});
 assert.equal(get.status,405);assert.equal(get.allow,'POST');
 const reviewerSubmit=await h.request('seller','accept',{eventId:'seller-review',
   expectedVersion:1});
 assert.equal(reviewerSubmit.status,403);
 const noMessage=await h.request('seller','submit',{eventId:'short',
   expectedVersion:1,expectedState:'PENDING',detail:'hi'});
 assert.equal(noMessage.status,400);
 assert.equal((await h.get()).version,1);
 assert.equal((await h.events()).length,1);
 assert.equal((await ledger.listAttempts('q1')).length,0);
}));
test('revoked seller cannot submit even with formerly valid host session; reenable requires current proof',fixture(async({ledger})=>{
 const h=harness(ledger);
 await ledger.setLocalMemberActive({actorId:'seller',active:false,expectedRevision:1});
 const denied=await h.request('seller','submit',{eventId:'revoked',expectedVersion:1,
  expectedState:'PENDING',detail});
 assert.equal(denied.status,403);
 await ledger.setLocalMemberActive({actorId:'seller',active:true,expectedRevision:2});
 assert.equal((await h.request('seller','submit',{eventId:'valid',expectedVersion:1,
  expectedState:'PENDING',detail})).status,200);
 await ledger.setLocalMemberActive({actorId:'reviewer',active:false,expectedRevision:1});
 assert.equal((await h.request('reviewer','accept',{eventId:'revoked-review',
   expectedVersion:2})).status,403);
 assert.equal((await h.get()).version,2);
 assert.equal((await h.events()).length,2);
}));
test('stale version, duplicate event, illegal ordering and repeat submission rollback cleanly',fixture(async({ledger})=>{
 const h=harness(ledger);
 assert.equal((await h.request('reviewer','accept',{eventId:'premature',
    expectedVersion:1})).status,409);
 const ok=await h.request('seller','submit',{eventId:'sub-1',
  expectedVersion:1,expectedState:'PENDING',detail});
 assert.equal(ok.status,200);
 const stale=await h.request('seller','submit',{eventId:'sub-2',
  expectedVersion:1,expectedState:'PENDING',detail});
 assert.equal(stale.status,409);
 const repeat=await h.request('seller','submit',{eventId:'sub-1',
  expectedVersion:2,expectedState:'REJECTED',detail});
 assert.equal(repeat.status,409);
 assert.equal((await h.events()).length,2);
 assert.equal((await h.get()).version,2);
}));
test('workflow evidence survives reopened SQLite, changed permissions persist',fixture(async({ledger,reopen})=>{
 let h=harness(ledger);
 assert.equal((await h.request('seller','submit',{eventId:'persist-sub',
   expectedVersion:1,expectedState:'PENDING',detail})).status,200);
 ledger=reopen();h=harness(ledger);
 assert.equal((await h.get()).version,2);
 assert.equal((await h.get()).milestones[0].state,'SUBMITTED');
 assert.equal((await h.events()).length,2);
 assert.equal((await h.request('reviewer','accept',{eventId:'persist-accept',
   expectedVersion:2})).status,200);
 assert.equal((await h.get()).version,3);
}));
test('public work API setup without authoritative grant fails closed',()=>{
 assert.throws(()=>createMarketplaceContractWorkflowApi({}),TypeError);
});
