import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createMarketplaceRecommendationStore} from '../src/marketplace_recommendation_store.mjs';
import {createLedgerMarketplaceSelectionStore,createMarketplaceSelectionApi} from '../src/marketplace_selection_store.mjs';
import {matchSyntheticMarketplaceSkills} from '../src/marketplace_match.mjs';
import {createMarketplaceIdentityPolicy} from '../src/marketplace_identity_policy.mjs';

const ownerId='synthetic-owner',merchantId='synthetic-merchant',quoteId='quote1';
const origin='https://selection-unit.test';
const brief='Build a website with PayPal checkout';
const csrf='local-csrf';
const makePost=body=>new Request(origin+'/api/demo/marketplace/selection',{
 method:'POST',headers:{origin,'content-type':'application/json','x-csrf-token':csrf},
 body:JSON.stringify(body)});
const makeGet=()=>new Request(origin+'/api/demo/marketplace/selection?quoteId='+quoteId);
async function fixture(fn){
 const folder=mkdtempSync(join(tmpdir(),'paypal-selection-role-revision-'));
 const filename=join(folder,'ledger.sqlite');
 const ledger=createSqliteLedger({filename,enforceLocalMemberWrites:true});
 const observer=createSqliteLedger({filename,enforceLocalMemberWrites:true});
 const recommendations=createMarketplaceRecommendationStore(join(folder,'recs.sqlite'));
 try{
  await ledger.insertQuote({id:quoteId,ownerId,merchantId});
  await ledger.provisionLocalMember({actorId:ownerId,merchantId,role:'buyer'});
  await ledger.provisionLocalMember({actorId:'synthetic-reviewer',merchantId,role:'reviewer'});
  const rec=recommendations.start(ownerId,'ai_work',brief,['web','payments']);
  const match=matchSyntheticMarketplaceSkills(['web','payments'],
    {round:0,profileIds:rec.roster[0]});
  const profile=match.profiles.find(p=>p.eligible);
  assert.ok(profile);
  const scope=brief+' [Synthetic candidate: '+profile.id+']';
  await ledger.revise({id:quoteId,actorId:ownerId,expectedVersion:1,
    scope,suggestedMinor:1500,suggestionSource:'OFFLINE_MOCK'});
  const choice={quoteId,expectedQuoteVersion:2,sessionId:rec.id,round:1,profileId:profile.id};
  const sessions=new WeakMap();
  const resolveSession=request=>sessions.get(request);
  const policy=createMarketplaceIdentityPolicy({
    resolveTrustedSession:resolveSession,resolveMembership:actor=>ledger.getLocalMember(actor)
  });
  const baseStore=createLedgerMarketplaceSelectionStore({quotes:ledger,recommendations});
  async function call(api,request,actor=ownerId,tenant=merchantId){
    sessions.set(request,{verified:true,actorId:actor,merchantId:tenant,csrfToken:csrf});
    const response=await api(request);
    return {status:response.status,data:await response.json()};
  }
  await fn({ledger,observer,recommendations,choice,scope,policy,baseStore,
    resolveSession,call});
 }finally{recommendations.close();observer.close();ledger.close();rmSync(folder,{recursive:true,force:true});}
}
const cycle=async db=>{
 const prior=(await db.getLocalMember(ownerId)).revision;
 await db.setLocalMemberActive({actorId:ownerId,expectedRevision:prior,active:false});
 await db.setLocalMemberActive({actorId:ownerId,expectedRevision:prior+1,active:true});
};
test('selection grant binds version, blocks revoke→reactivate between policy and SQLite write',()=>fixture(async({ledger,observer,choice,policy,baseStore,resolveSession,call})=>{
 let once=true;
 const store={...baseStore,select:async args=>{
  if(once){once=false;await cycle(observer);}
  return baseStore.select(args);
 }};
 const api=createMarketplaceSelectionApi({resolveSession,store,identityPolicy:policy});
 const refused=await call(api,makePost(choice));
 assert.equal(refused.status,403,JSON.stringify(refused));
 assert.equal(refused.data.error,'LOCAL_WRITE_ROLE_VERSION_CHANGED');
 assert.equal(await baseStore.get({ownerId,merchantId,quoteId}),null);
 assert.equal((await ledger.get('quote1')).status,'PROPOSED');
 assert.equal((await ledger.listAttempts(quoteId)).length,0);
 const fresh=await call(api,makePost(choice));
 assert.equal(fresh.status,201,JSON.stringify(fresh));
 assert.equal(fresh.data.status,'BOUND');
 assert.equal(fresh.data.profileId,choice.profileId);
 const repeated=await call(api,makePost(choice));
 assert.equal(repeated.status,201);
 assert.deepEqual(repeated.data,fresh.data);
 const read=await call(api,makeGet());
 assert.equal(read.status,200);
 assert.equal(read.data.paymentAuthorized,false);
 await observer.setLocalMemberActive({actorId:ownerId,expectedRevision:3,active:false});
 const revoked=await call(api,makePost(choice));
 assert.equal(revoked.status,403);
 assert.equal((await ledger.get(quoteId)).status,'PROPOSED');
}));
test('selection fails closed for static unversioned role fixture and split-DB store',()=>fixture(async({ledger,choice,baseStore,resolveSession,call})=>{
 const staticPolicy=createMarketplaceIdentityPolicy({
  resolveTrustedSession:resolveSession,
  members:[{actorId:ownerId,merchantId,role:'buyer',active:true}]
 });
 const api=createMarketplaceSelectionApi({resolveSession,store:baseStore,identityPolicy:staticPolicy});
 const reply=await call(api,makePost(choice));
 assert.equal(reply.status,403);
 assert.equal(reply.data.error,'TRUSTED_MEMBERSHIP_REVISION_REQUIRED');
 assert.equal(await baseStore.get({ownerId,merchantId,quoteId}),null);
 assert.throws(()=>createMarketplaceSelectionApi({
  resolveSession,identityPolicy:staticPolicy,store:{select(){},get(){}}}),TypeError);
}));
test('selection rejects JSON identity and revision spoofing, reviewer and wrong CSRF',()=>fixture(async({choice,policy,baseStore,resolveSession,call})=>{
 const api=createMarketplaceSelectionApi({resolveSession,store:baseStore,identityPolicy:policy});
 const forged=await call(api,makePost({...choice,ownerId,merchantId,expectedMembershipRevision:999}));
 assert.equal(forged.status,400);
 assert.equal(forged.data.error,'UNEXPECTED_FIELDS');
 const reviewer=await call(api,makePost(choice),'synthetic-reviewer');
 assert.equal(reviewer.status,403);
 assert.equal(reviewer.data.error,'OWNER_SESSION_REQUIRED');
 const badCsrf=makePost(choice);
 badCsrf.headers.set('x-csrf-token','forged');
 const denied=await call(api,badCsrf);
 assert.equal(denied.status,403);
 assert.equal(denied.data.error,'CSRF_REQUIRED');
 assert.equal(await baseStore.get({ownerId,merchantId,quoteId}),null);
}));
