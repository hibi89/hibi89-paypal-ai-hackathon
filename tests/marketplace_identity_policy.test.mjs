import test from 'node:test';
import assert from 'node:assert/strict';
import {createMarketplaceIdentityPolicy} from '../src/marketplace_identity_policy.mjs';

const members=[
 {actorId:'buyerA',merchantId:'tenantA',role:'buyer',active:true},
 {actorId:'buyerB',merchantId:'tenantB',role:'buyer',active:true},
 {actorId:'sellerA',merchantId:'tenantA',role:'seller',
  sellerProfileId:'seller-profile-A',active:true},
 {actorId:'reviewerA',merchantId:'tenantA',role:'reviewer',active:true},
 {actorId:'operatorA',merchantId:'tenantA',role:'merchant_operator',active:true},
];
function fixture(){
  const registry=new Map(members.map(m=>[m.actorId,
    {verified:true,actorId:m.actorId,merchantId:m.merchantId}]));
  const policy=createMarketplaceIdentityPolicy({
    members,resolveTrustedSession:async handle=>registry.get(handle)
  });
  return {policy,registry,issue:id=>policy.issueProof(id)};
}
const q={quoteId:'quote-A',ownerId:'buyerA',merchantId:'tenantA'};
const c={...q,contractId:'contract-A',reviewerId:'reviewerA',
  sellerProfileId:'seller-profile-A',contractState:'ACTIVE'};
const denied=code=>({code});
test('identity registry is immutable, preprovisioned and rejects malformed or ambiguous members',()=>{
 assert.throws(()=>createMarketplaceIdentityPolicy({}),/TRUSTED_IDENTITY_SOURCE_REQUIRED/);
 assert.throws(()=>createMarketplaceIdentityPolicy({members:[members[0],members[0]],
   resolveTrustedSession:async()=>null}),/AMBIGUOUS_IDENTITY_MEMBERSHIP/);
 assert.throws(()=>createMarketplaceIdentityPolicy({members:[
   {...members[2],sellerProfileId:undefined}
 ],resolveTrustedSession:async()=>null}),/INVALID_SELLER_ROLE_FIXTURE/);
 assert.throws(()=>createMarketplaceIdentityPolicy({members:[
   {...members[0],role:'admin'}
 ],resolveTrustedSession:async()=>null}),/INVALID_TRUSTED_IDENTITY_FIXTURE/);
 assert.throws(()=>createMarketplaceIdentityPolicy({members:[
   {...members[0],role:'seller'}
 ],resolveTrustedSession:async()=>null}),/INVALID_SELLER_ROLE_FIXTURE/);
});
test('trusted resolver exclusively issues branded proof; fake verified/role and foreign policy proof denied',async()=>{
 const f=fixture(),other=fixture();
 await assert.rejects(f.policy.authorize({verified:true,actorId:'buyerA',
   role:'buyer'},{action:'quote.approve',resource:q}),denied('AUTHENTICATED_ROLE_PROOF_REQUIRED'));
 await assert.rejects(f.policy.issueProof({verified:true,actorId:'buyerA'}),
   denied('TRUSTED_SESSION_REQUIRED'));
 const proof=await f.issue('buyerA');
 await assert.rejects(other.policy.authorize(proof,{action:'quote.approve',resource:q}),
   denied('AUTHENTICATED_ROLE_PROOF_REQUIRED'));
 const result=await f.policy.inspect(proof);
 assert.equal(result.role,'buyer');
 assert.equal(result.merchantOwnershipVerified,false);
 assert.equal(result.paymentAuthorized,false);
 assert.equal(result.registrationEnabled,false);
 assert.equal(f.policy.publicAuthenticationEnabled,false);
 assert.equal(f.policy.providerNetworkEnabled,false);
});
test('buyer quote/marketplace/contract authority strictly matches owner and tenant',async()=>{
 const f=fixture(),p=await f.issue('buyerA');
 for(const action of ['quote.read','quote.draft','quote.approve','quote.reject',
   'marketplace.select','contract.create'])
  assert.equal((await f.policy.authorize(p,{action,resource:q})).paymentAuthorized,false);
 assert.equal((await f.policy.authorize(p,{action:'contract.read',resource:c})).role,'buyer');
 assert.equal((await f.policy.authorize(p,{action:'marketplace.match'})).role,'buyer');
 for(const resource of [{...q,merchantId:'tenantB'},{...q,ownerId:'buyerB'},
   {...q,quoteId:undefined}])
  await assert.rejects(f.policy.authorize(p,{action:'quote.approve',resource}),
    denied('ROLE_ACTION_FORBIDDEN'));
 for(const action of ['delivery.review','delivery.submit','merchant.read','payment.capture',
   'payment.request','seller.profile.read'])
  await assert.rejects(f.policy.authorize(p,{action,resource:c}),denied('ROLE_ACTION_FORBIDDEN'));
});
test('seller can inspect own assigned contract and submit only to own active contract',async()=>{
 const f=fixture(),p=await f.issue('sellerA');
 assert.equal((await f.policy.authorize(p,{action:'seller.profile.read',
   resource:{merchantId:'tenantA',sellerProfileId:'seller-profile-A'}})).role,'seller');
 assert.equal((await f.policy.authorize(p,{action:'contract.read',resource:c})).role,'seller');
 assert.equal((await f.policy.authorize(p,{action:'delivery.submit',resource:c})).role,'seller');
 for(const resource of [{...c,sellerProfileId:'seller-profile-foreign'},
   {...c,merchantId:'tenantB'},{...c,contractState:'CANCELLED'}])
  await assert.rejects(f.policy.authorize(p,{action:'delivery.submit',resource}),
    denied('ROLE_ACTION_FORBIDDEN'));
 for(const action of ['quote.approve','marketplace.select','delivery.review',
   'contract.create','payment.request'])
  await assert.rejects(f.policy.authorize(p,{action,resource:c}),denied('ROLE_ACTION_FORBIDDEN'));
});
test('reviewer can inspect/review specifically assigned contract, but cannot edit quote or deliver',async()=>{
 const f=fixture(),p=await f.issue('reviewerA');
 assert.equal((await f.policy.authorize(p,{action:'contract.read',resource:c})).role,'reviewer');
 assert.equal((await f.policy.authorize(p,{action:'delivery.review',resource:c})).role,'reviewer');
 for(const resource of [{...c,reviewerId:'somebody-else'},
   {...c,merchantId:'tenantB'},{...c,contractState:'CANCELLED'}])
  await assert.rejects(f.policy.authorize(p,{action:'delivery.review',resource}),
    denied('ROLE_ACTION_FORBIDDEN'));
 for(const action of ['quote.read','quote.approve','delivery.submit',
   'marketplace.select','payment.capture','contract.create'])
  await assert.rejects(f.policy.authorize(p,{action,resource:c}),denied('ROLE_ACTION_FORBIDDEN'));
});
test('merchant operator is read-only; never authorized to create order, capture or impersonate buyer',async()=>{
 const f=fixture(),p=await f.issue('operatorA');
 assert.equal((await f.policy.authorize(p,{action:'merchant.read',
   resource:{merchantId:'tenantA'}})).role,'merchant_operator');
 await assert.rejects(f.policy.authorize(p,{action:'merchant.read',resource:{
   merchantId:'tenantB'}}),denied('ROLE_ACTION_FORBIDDEN'));
 for(const action of ['quote.approve','contract.create','payment.request','payment.capture',
   'seller.profile.read'])
  await assert.rejects(f.policy.authorize(p,{action,resource:c}),denied('ROLE_ACTION_FORBIDDEN'));
});
test('resolve at use-time rejects revoked, rotated tenant, swapped role and missing sessions',async()=>{
 const f=fixture(),proof=await f.issue('buyerA');
 f.registry.set('buyerA',{verified:false,actorId:'buyerA',merchantId:'tenantA'});
 await assert.rejects(f.policy.authorize(proof,{action:'quote.read',resource:q}),
   denied('TRUSTED_SESSION_REQUIRED'));
 f.registry.set('buyerA',{verified:true,actorId:'buyerA',merchantId:'tenantB'});
 await assert.rejects(f.policy.authorize(proof,{action:'quote.read',resource:q}),
   denied('TRUSTED_MEMBERSHIP_REQUIRED'));
 f.registry.set('buyerA',{verified:true,actorId:'buyerA',merchantId:'tenantA',
   role:'reviewer'});
 await assert.rejects(f.policy.inspect(proof),denied('TRUSTED_MEMBERSHIP_REQUIRED'));
 f.registry.delete('buyerA');
 await assert.rejects(f.policy.inspect(proof),denied('TRUSTED_SESSION_REQUIRED'));
});
test('authorization is read-only and emits neither registration nor provider side effects',async()=>{
 let reads=0;
 const policy=createMarketplaceIdentityPolicy({members:[members[0]],
  resolveTrustedSession:async()=>{reads++;return {verified:true,actorId:'buyerA',
    merchantId:'tenantA'};}});
 const p=await policy.issueProof('trusted-local-session');
 for(let i=0;i<6;i++)
  assert.equal((await policy.authorize(p,{action:'quote.read',resource:q})).action,'quote.read');
 assert.equal(reads,7);
 assert.equal(Object.keys(policy).includes('register'),false);
 assert.equal(Object.keys(policy).includes('createUser'),false);
 assert.equal(Object.keys(policy).includes('sendPayment'),false);
});
