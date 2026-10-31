import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createInnovationLab} from '../src/innovation_lab.mjs';
import {createMarketplaceIdentityPolicy} from '../src/marketplace_identity_policy.mjs';
import {createCrossPartReviewBridge} from '../src/cross_part_review_bridge.mjs';

const actor='buyer_1',merchant='tenant_1',quoteId='quote_1';
const selectedMinor=29900;
async function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'ppl-cross-part-'));
 const ledger=createSqliteLedger({filename:join(dir,'part1.sqlite')});
 let time=1900000000000,allow=true,calls=0,hook=null;
 const lab=createInnovationLab({filename:join(dir,'part2.sqlite'),now:()=>time});
 const filename=join(dir,'cross-review.sqlite');
 const logins=new Map();
 const hostHandle=Object.freeze(Object.create(null));
 logins.set(hostHandle,{verified:true,actorId:actor,merchantId:merchant});
 await ledger.provisionLocalMember({actorId:actor,merchantId:merchant,role:'buyer'});
 await ledger.provisionLocalMember({actorId:'reviewer_1',merchantId:merchant,role:'reviewer'});
 await ledger.insertQuote({id:quoteId,ownerId:actor,merchantId:merchant});
 await ledger.approve({id:quoteId,actorId:actor,expectedVersion:1,
  amountMinor:selectedMinor});
 const consent=lab.delegate({actor,merchant,key:'consent_1',category:'services',
  maxMinor:30000,expiresInMinutes:30});
 const deal=await lab.a2a({actor,merchant,key:'a2a_1',consentId:consent.consentId});
 assert.equal(deal.status,'SYNTHETIC_AGREEMENT');
 const policy=createMarketplaceIdentityPolicy({
  resolveTrustedSession:async handle=>logins.get(handle),
  resolveMembership:async user=>ledger.getLocalMember(user)
 });
 const options={filename,ledger,innovationStore:lab,identityPolicy:policy,
  authorizeLink:async ctx=>{calls++;if(hook)await hook(ctx);return allow;},
  now:()=>time};
 let bridge=createCrossPartReviewBridge(options);
 return {dir,ledger,lab,filename,options,policy,bridge,
  hostHandle,consentId:consent.consentId,logins,
  otherHandle:Object.freeze(Object.create(null)),
  count:()=>calls,setAllow:v=>{allow=v},setHook:fn=>{hook=fn},
  advance:v=>{time+=v},
  reopen(){bridge.close();bridge=createCrossPartReviewBridge(options);this.bridge=bridge},
  close(){bridge.close();lab.close();ledger.close();rmSync(dir,{recursive:true,force:true})}
 };
}
async function using(fn){const f=await fixture();try{await fn(f)}finally{f.close()}}
const args=f=>({hostHandle:f.hostHandle,quoteId,consentId:f.consentId});
const rejectCode=c=>e=>e?.code===c;

test('private trusted dependencies are mandatory, never a public payment endpoint',()=>{
 assert.throws(()=>createCrossPartReviewBridge({}),
  rejectCode('CROSS_PART_TRUSTED_DEPENDENCIES_REQUIRED'));
});
test('real local Part1 approved quote and Part2 A2A consent link through trusted buyer, read-only inspect survives restart',async()=>{
 await using(async f=>{
  const linked=await f.bridge.link(args(f));
  assert.equal(f.count(),1);
  assert.equal(linked.status,'SYNTHETIC_CROSS_PART_REVIEW_ONLY');
  assert.equal(linked.quoteVersion,1);
  assert.equal(linked.amountMinor,selectedMinor);
  assert.equal(linked.currency,'USD');
  assert.match(linked.reviewFingerprint,/^[a-f0-9]{64}$/);
  assert.equal(linked.paymentAuthorized,false);
  assert.equal(linked.paypalOrderCreated,false);
  assert.equal(linked.paypalCapturePerformed,false);
  assert.equal(linked.merchantOwnershipVerified,false);
  assert.equal(linked.sellerIdentityVerified,false);
  assert.equal(linked.realProviderEvidence,false);
  assert.equal(f.bridge.publicHttpEnabled,false);
  assert.equal(f.bridge.paypalProviderCalls,0);
  assert.equal(f.bridge.autoPaymentAuthorized,false);
  const inspected=await f.bridge.inspect({hostHandle:f.hostHandle,quoteId});
  assert.deepEqual(inspected,linked);
  f.reopen();
  assert.deepEqual(await f.bridge.inspect({hostHandle:f.hostHandle,quoteId}),linked);
  const twice=await f.bridge.link(args(f));
  assert.deepEqual(twice,linked);
  assert.equal(f.count(),2);
 });
});
test('forged login, reviewer role or cross-tenant identity never yields review link',async()=>{
 await using(async f=>{
  const forged={verified:true,actorId:actor,merchantId:merchant};
  await assert.rejects(f.bridge.link({...args(f),hostHandle:forged}),
   rejectCode('TRUSTED_SESSION_REQUIRED'));
  f.logins.set(f.otherHandle,{verified:true,actorId:'reviewer_1',
   merchantId:merchant});
  await assert.rejects(f.bridge.link({...args(f),hostHandle:f.otherHandle}),
   rejectCode('ROLE_ACTION_FORBIDDEN'));
  f.logins.set(f.otherHandle,{verified:true,actorId:actor,
   merchantId:'other_tenant'});
  await assert.rejects(f.bridge.link({...args(f),hostHandle:f.otherHandle}),
   rejectCode('TRUSTED_MEMBERSHIP_REQUIRED'));
  assert.equal(f.count(),0);
 });
});
test('cross-ledger different amount and seller/tenant source is blocked without approval callback',async()=>{
 await using(async f=>{
  await f.ledger.insertQuote({id:'different_quote',ownerId:actor,merchantId:merchant});
  await f.ledger.approve({id:'different_quote',actorId:actor,expectedVersion:1,
   amountMinor:15000});
  await assert.rejects(f.bridge.link({...args(f),quoteId:'different_quote'}),
   rejectCode('CROSS_PART_SCOPED_CONSENT_REQUIRED'));
  await assert.rejects(f.bridge.link({...args(f),consentId:'NOT_MY_CONSENT'}),
   rejectCode('CROSS_PART_SCOPED_CONSENT_REQUIRED'));
  assert.equal(f.count(),0);
 });
});
test('explicit trusted link review denial never writes an association',async()=>{
 await using(async f=>{
  f.setAllow(false);
  await assert.rejects(f.bridge.link(args(f)),
   rejectCode('CROSS_PART_EXPLICIT_REVIEW_REQUIRED'));
  await assert.rejects(f.bridge.inspect({hostHandle:f.hostHandle,quoteId}),
   rejectCode('CROSS_PART_LINK_UNAVAILABLE'));
  assert.equal(f.count(),1);
 });
});
test('membership revocation while trusted reviewer awaits denies stale link',async()=>{
 await using(async f=>{
  f.setHook(async()=>{
   const membership=await f.ledger.getLocalMember(actor);
   await f.ledger.setLocalMemberActive({actorId:actor,
    expectedRevision:membership.revision,active:false});
  });
  await assert.rejects(f.bridge.link(args(f)),
   rejectCode('TRUSTED_MEMBERSHIP_REQUIRED'));
  await assert.rejects(f.bridge.inspect({hostHandle:f.hostHandle,quoteId}),
   rejectCode('TRUSTED_MEMBERSHIP_REQUIRED'));
 });
});
test('one consent cannot back multiple approved quotes, even with same amount',async()=>{
 await using(async f=>{
  await f.bridge.link(args(f));
  await f.ledger.insertQuote({id:'quote_2',ownerId:actor,merchantId:merchant});
  await f.ledger.approve({id:'quote_2',actorId:actor,expectedVersion:1,
   amountMinor:selectedMinor});
  await assert.rejects(f.bridge.link({...args(f),quoteId:'quote_2'}),
   rejectCode('CROSS_PART_CONSENT_ALREADY_LINKED'));
  assert.equal((await f.bridge.inspect({hostHandle:f.hostHandle,quoteId})).paymentAuthorized,false);
 });
});
test('revoked or expired consent, changed quote, and stale links fail closed',async()=>{
 await using(async f=>{
  const original=await f.bridge.link(args(f));
  assert.equal(original.amountMinor,selectedMinor);
  f.advance(31*60*1000);
  await assert.rejects(f.bridge.inspect({hostHandle:f.hostHandle,quoteId}),
   rejectCode('CROSS_PART_LINK_UNAVAILABLE'));
  await assert.rejects(f.bridge.link(args(f)),
   rejectCode('CROSS_PART_SCOPED_CONSENT_REQUIRED'));
 });
});
test('fabricated model/provenance claims in state cannot be linked as provider evidence',async()=>{
 await using(async f=>{
  const fakeStore={state:(scope)=>{
   const s=f.lab.state(scope);
   return {...s,providerCalls:1,realPayPal:true};
  }};
  const replacement=createCrossPartReviewBridge({
   ...f.options,filename:join(f.dir,'forged.sqlite'),innovationStore:fakeStore
  });
  try{
   await assert.rejects(replacement.link(args(f)),
    rejectCode('CROSS_PART_SYNTHETIC_EVIDENCE_REQUIRED'));
  }finally{replacement.close();}
 });
});

test('inspect refuses a review link that expires during asynchronous evidence retrieval',async()=>{
 await using(async f=>{
  await f.bridge.link(args(f));
  let reads=0;
  const delayedLedger={
   get:async id=>{const q=await f.ledger.get(id);if(++reads===2)f.advance(16*60*1000);return q;}
  };
  const delayed=createCrossPartReviewBridge({
   ...f.options,ledger:delayedLedger,filename:f.filename
  });
  try{
   await assert.rejects(delayed.inspect({hostHandle:f.hostHandle,quoteId}),
    rejectCode('CROSS_PART_LINK_UNAVAILABLE'));
  }finally{delayed.close();}
 });
});
