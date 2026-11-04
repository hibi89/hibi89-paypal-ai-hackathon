import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createMarketplaceIdentityPolicy} from '../src/marketplace_identity_policy.mjs';
import {createMarketplaceProtectedReadApi} from '../src/marketplace_protected_read_api.mjs';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';

function fixture(fn){
 return async()=>{
  const folder=mkdtempSync(join(tmpdir(),'paypal-member-ledger-'));
  const filename=join(folder,'records.sqlite');
  let db=createSqliteLedger({filename});
  try{
   await fn({db,filename,reopen:()=>{db.close();db=createSqliteLedger({filename});return db;}});
  }finally{db.close();rmSync(folder,{recursive:true,force:true});}
 };
}
async function seed(db){
 await db.insertQuote({id:'qa',ownerId:'alice',merchantId:'tenantA'});
 await db.insertQuote({id:'qb',ownerId:'bob',merchantId:'tenantB'});
 await db.provisionLocalMember({actorId:'alice',merchantId:'tenantA',role:'buyer'});
 await db.provisionLocalMember({actorId:'bob',merchantId:'tenantB',role:'buyer'});
 await db.provisionLocalMember({actorId:'sellerA',merchantId:'tenantA',
  role:'seller',sellerProfileId:'seller-profile-A'});
 await db.provisionLocalMember({actorId:'sellerB',merchantId:'tenantB',
  role:'seller',sellerProfileId:'seller-profile-B'});
 await db.provisionLocalMember({actorId:'reviewerA',merchantId:'tenantA',role:'reviewer'});
 await db.provisionLocalMember({actorId:'operatorA',merchantId:'tenantA',role:'merchant_operator'});
 await db.approve({id:'qa',actorId:'alice',expectedVersion:1,amountMinor:150});
 await db.createContract({id:'ca',quoteId:'qa',actorId:'alice',merchantId:'tenantA',
  reviewerId:'reviewerA',expectedVersion:1,eventId:'create-ca',
  milestones:[{id:'ma',step:1,amountMinor:150}]});
}
function protectedClient(db){
 const sessions=new WeakMap();
 const policy=createMarketplaceIdentityPolicy({
  resolveTrustedSession:request=>sessions.get(request),
  resolveMembership:actorId=>db.getLocalMember(actorId)
 });
 const api=createMarketplaceProtectedReadApi({policy,ledger:db});
 const url='http://127.0.0.1:8765';
 return {
  policy,api,
  async call(actor,method,path,{claim}={}){
   const req=new Request(url+path,{method});
   if(actor){
    const m=await db.getLocalMember(actor);
    sessions.set(req,{verified:true,actorId:actor,
      merchantId:claim?.merchantId??m?.merchantId,role:claim?.role??m?.role});
   }
   const response=await api(req);
   return {status:response.status,data:await response.json(),
     allow:response.headers.get('allow')};
  }
 };
}
test('member registry persists across reboot, forbids role changes and does not silently reactivate',fixture(async({db,reopen})=>{
 await seed(db);
 assert.equal((await db.getLocalMember('sellerA')).sellerProfileId,'seller-profile-A');
 assert.equal((await db.provisionLocalMember({actorId:'sellerA',
   merchantId:'tenantA',role:'seller',sellerProfileId:'seller-profile-A'})).created,false);
 await assert.rejects(db.provisionLocalMember({actorId:'sellerA',
   merchantId:'tenantB',role:'seller',sellerProfileId:'seller-profile-A'}),
   {code:'LOCAL_MEMBERSHIP_CONFLICT'});
 await assert.rejects(db.provisionLocalMember({actorId:'sellerA',
   merchantId:'tenantA',role:'buyer'}),{code:'LOCAL_MEMBERSHIP_CONFLICT'});
 assert.equal((await db.assignLocalContractSeller({
   contractId:'ca',merchantId:'tenantA',sellerProfileId:'seller-profile-A'
 })).sellerProfileId,'seller-profile-A');
 await assert.rejects(db.assignLocalContractSeller({
   contractId:'ca',merchantId:'tenantB',sellerProfileId:'seller-profile-B'}),
   {code:'CONTRACT_NOT_FOUND'});
 db=reopen();
 assert.equal((await db.getLocalMember('alice')).role,'buyer');
 assert.equal((await db.getContractAuthorityResource('ca')).sellerProfileId,'seller-profile-A');
 const next=await db.setLocalMemberActive({actorId:'sellerA',expectedRevision:1,active:false});
 assert.equal(next.revision,2);
 await assert.rejects(db.setLocalMemberActive({actorId:'sellerA',expectedRevision:1,active:true}),
   {code:'STALE_OR_UNKNOWN_MEMBERSHIP'});
 assert.equal((await db.provisionLocalMember({actorId:'sellerA',
   merchantId:'tenantA',role:'seller',sellerProfileId:'seller-profile-A'})).created,false);
 assert.equal((await db.getLocalMember('sellerA')).active,false);
 db=reopen();
 assert.equal((await db.getLocalMember('sellerA')).active,false);
 const enabled=await db.setLocalMemberActive({actorId:'sellerA',expectedRevision:2,active:true});
 assert.equal(enabled.revision,3);
}));
test('protected quote/contract read uses ledger metadata, denies cross-tenant spoof and unknown actors',fixture(async({db})=>{
 await seed(db);
 await db.assignLocalContractSeller({contractId:'ca',merchantId:'tenantA',
   sellerProfileId:'seller-profile-A'});
 const p=protectedClient(db);
 assert.equal((await p.call('alice','GET','/api/demo/protected/quotes/qa')).data.quote.ownerId,'alice');
 assert.equal((await p.call('alice','GET','/api/demo/protected/contracts/ca')).data.contract.id,'ca');
 assert.equal((await p.call('sellerA','GET','/api/demo/protected/contracts/ca')).data.contract.id,'ca');
 assert.equal((await p.call('reviewerA','GET','/api/demo/protected/contracts/ca')).status,200);
 for(const actor of ['bob','sellerB','operatorA']){
  assert.equal((await p.call(actor,'GET','/api/demo/protected/contracts/ca')).status,403);
  assert.equal((await p.call(actor,'GET','/api/demo/protected/quotes/qa')).status,403);
 }
 assert.equal((await p.call('sellerA','GET','/api/demo/protected/quotes/qa')).status,403);
 assert.equal((await p.call('reviewerA','GET','/api/demo/protected/quotes/qa')).status,403);
 assert.equal((await p.call('missing','GET','/api/demo/protected/quotes/qa')).status,401);
 assert.equal((await p.call(null,'GET','/api/demo/protected/quotes/qa')).status,401);
 assert.equal((await p.call('alice','GET','/api/demo/protected/quotes/q-unknown')).status,404);
 assert.equal((await p.call('alice','GET','/api/demo/protected/quotes/qa?role=buyer')).status,404);
 const noWrite=await p.call('alice','POST','/api/demo/protected/quotes/qa');
 assert.equal(noWrite.status,405);
 assert.equal(noWrite.allow,'GET');
 assert.equal((await db.get('qa')).status,'APPROVED');
 assert.equal((await db.listAttempts('qa')).length,0);
}));
test('persistent revocation and stale policy proof are denied without provider or data changes',fixture(async({db})=>{
 await seed(db);
 const sessions=new Map([['trusted',{verified:true,actorId:'alice',merchantId:'tenantA'}]]);
 const policy=createMarketplaceIdentityPolicy({resolveTrustedSession:h=>sessions.get(h),
  resolveMembership:id=>db.getLocalMember(id)});
 const proof=await policy.issueProof('trusted');
 const q=await db.getQuoteAuthorityResource('qa');
 assert.equal((await policy.authorize(proof,{action:'quote.read',resource:q})).paymentAuthorized,false);
 await db.setLocalMemberActive({actorId:'alice',expectedRevision:1,active:false});
 await assert.rejects(policy.authorize(proof,{action:'quote.read',resource:q}),
   {code:'TRUSTED_MEMBERSHIP_REQUIRED'});
 await db.setLocalMemberActive({actorId:'alice',expectedRevision:2,active:true});
 // New grant is not permission to replay a pre-revocation proof.
 await assert.rejects(policy.authorize(proof,{action:'quote.read',resource:q}),
   {code:'ROLE_SESSION_CHANGED'});
 const renewed=await policy.issueProof('trusted');
 assert.equal((await policy.authorize(renewed,{action:'quote.read',resource:q})).paymentAuthorized,false);
 sessions.set('trusted',{verified:true,actorId:'alice',merchantId:'tenantB'});
 await assert.rejects(policy.inspect(proof),{code:'TRUSTED_MEMBERSHIP_REQUIRED'});
 const read=await db.get('qa');
 assert.equal(read.status,'APPROVED');
 assert.equal((await db.listAttempts('qa')).length,0);
}));
test('real loopback protected endpoints remain synthetic, GET-only and reject reviewer quote access',async()=>{
 const app=await startOfflineDemo({testReviewSessions:true});
 try{
  const a=await fetch(app.url+'/api/demo/protected/quotes/sample-project');
  assert.equal(a.status,200);
  const val=await a.json();
  assert.equal(val.paymentAuthorized,false);
  assert.equal(val.quote.ownerId,'synthetic-owner');
  const r=await fetch(app.url+'/api/demo/protected/quotes/sample-project',{
    headers:{cookie:app.testReviewerCookie,'x-role':'buyer'}});
  assert.equal(r.status,403);
  assert.equal((await r.json()).error,'ROLE_ACTION_FORBIDDEN');
  const deny=await fetch(app.url+'/api/demo/protected/quotes/sample-project',{
    method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  assert.equal(deny.status,405);
  const missing=await fetch(app.url+'/api/demo/protected/contracts/no-such-contract');
  assert.equal(missing.status,404);
  const wrong=await fetch(app.url+'/api/demo/protected/quotes/sample-project',{
    headers:{cookie:'paypal_test_review='+('f'.repeat(64))}});
  assert.equal(wrong.status,401);
  const quote=await (await fetch(app.url+'/api/quotes/sample-project')).json();
  assert.equal(quote.quote.version,1);
 }finally{await app.close();}
});
