import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createMarketplaceIdentityPolicy} from '../src/marketplace_identity_policy.mjs';
import {createContractApi} from '../src/contract_api.mjs';
import {createQuoteApi} from '../src/quote_api.mjs';

function fixture(fn,flags={}){
 return async()=>{
  const folder=mkdtempSync(join(tmpdir(),'paypal-locked-membership-'));
  const filename=join(folder,'ledger.sqlite');
  const ledger=createSqliteLedger({filename,enforceLocalMemberWrites:true,
    allowLocalOwnerDelivery:flags.ownerDelivery===true});
  try{
   await ledger.insertQuote({id:'q1',ownerId:'buyer',merchantId:'tenantA'});
   await ledger.provisionLocalMember({actorId:'buyer',merchantId:'tenantA',role:'buyer'});
   await ledger.provisionLocalMember({actorId:'reviewer',merchantId:'tenantA',role:'reviewer'});
   await ledger.provisionLocalMember({actorId:'seller',merchantId:'tenantA',role:'seller',
     sellerProfileId:'profile1'});
   await fn({ledger,filename});
  }finally{ledger.close();rmSync(folder,{recursive:true,force:true});}
 };
}
async function enable(ledger,actorId,active,expectedRevision=1){
 return ledger.setLocalMemberActive({actorId,active,expectedRevision});
}
test('quote approval rechecks grant under write lock after pre-authorization revoked',fixture(async({ledger})=>{
 const sessions=new Map([['buyer',{verified:true,actorId:'buyer',merchantId:'tenantA'}]]);
 const policy=createMarketplaceIdentityPolicy({resolveTrustedSession:key=>sessions.get(key),
   resolveMembership:actor=>ledger.getLocalMember(actor)});
 const proof=await policy.issueProof('buyer');
 const resource=await ledger.getQuoteAuthorityResource('q1');
 assert.equal((await policy.authorize(proof,{action:'quote.approve',resource})).role,'buyer');
 await enable(ledger,'buyer',false);
 await assert.rejects(ledger.approve({id:'q1',actorId:'buyer',expectedVersion:1,
   amountMinor:1500}),{code:'LOCAL_WRITE_ROLE_REVOKED'});
 assert.equal((await ledger.get('q1')).status,'PROPOSED');
 assert.equal((await ledger.listAttempts('q1')).length,0);
 await enable(ledger,'buyer',true,2);
 assert.equal((await ledger.approve({id:'q1',actorId:'buyer',
   expectedVersion:1,amountMinor:1500})).status,'APPROVED');
 assert.equal((await ledger.get('q1')).approval.amountMinor,1500);
}));
test('quote revise, reject, AI claim and provider operation claim fail closed when revoked',fixture(async({ledger})=>{
 await enable(ledger,'buyer',false);
 await assert.rejects(ledger.revise({id:'q1',actorId:'buyer',
   expectedVersion:1,scope:'A controlled synthetic design scope',
   suggestedMinor:1200,suggestionSource:'OFFLINE_MOCK'}),
   {code:'LOCAL_WRITE_ROLE_REVOKED'});
 await assert.rejects(ledger.reject({id:'q1',actorId:'buyer',expectedVersion:1,
   reason:'Synthetic incomplete brief'}),{code:'LOCAL_WRITE_ROLE_REVOKED'});
 await assert.rejects(ledger.claimAiDraft({id:'q1',actorId:'buyer',expectedVersion:1}),
   {code:'LOCAL_WRITE_ROLE_REVOKED'});
 assert.equal((await ledger.get('q1')).version,1);
 await enable(ledger,'buyer',true,2);
 await ledger.approve({id:'q1',actorId:'buyer',expectedVersion:1,amountMinor:1500});
 await enable(ledger,'buyer',false,3);
 await assert.rejects(ledger.claimOperation({quoteId:'q1',actorId:'buyer',
   merchantId:'tenantA',operation:'create'}),{code:'LOCAL_WRITE_ROLE_REVOKED'});
 assert.equal((await ledger.listAttempts('q1')).length,0);
}));
test('contract create verifies buyer and reviewer active inside same SQL transaction',fixture(async({ledger})=>{
 await ledger.approve({id:'q1',actorId:'buyer',expectedVersion:1,amountMinor:1500});
 const payload={id:'c1',quoteId:'q1',actorId:'buyer',merchantId:'tenantA',
   reviewerId:'reviewer',expectedVersion:1,eventId:'contract-created',
   milestones:[{id:'m1',step:1,amountMinor:1500}]};
 await enable(ledger,'reviewer',false);
 await assert.rejects(ledger.createContract(payload),{code:'LOCAL_WRITE_ROLE_REVOKED'});
 assert.equal(await ledger.getContractAuthorityResource('c1'),null);
 await enable(ledger,'reviewer',true,2);
 await enable(ledger,'buyer',false);
 await assert.rejects(ledger.createContract(payload),{code:'LOCAL_WRITE_ROLE_REVOKED'});
 assert.equal(await ledger.getContractAuthorityResource('c1'),null);
 await enable(ledger,'buyer',true,2);
 assert.equal((await ledger.createContract(payload)).id,'c1');
 assert.equal((await ledger.listContractEvents({contractId:'c1',actorId:'buyer',
   merchantId:'tenantA'})).length,1);
}));
test('legacy reviewer acceptance rechecks membership and rolls back version/events',fixture(async({ledger})=>{
 await ledger.approve({id:'q1',actorId:'buyer',expectedVersion:1,amountMinor:1500});
 await ledger.createContract({id:'c1',quoteId:'q1',actorId:'buyer',
   merchantId:'tenantA',reviewerId:'reviewer',expectedVersion:1,
   eventId:'newc1',milestones:[{id:'m1',step:1,amountMinor:1500}]});
 const transition=(who,version,expectedState,nextState,eventId,detail=null)=>
   ledger.transitionMilestone({contractId:'c1',milestoneId:'m1',
      actorId:who,merchantId:'tenantA',expectedVersion:version,
      expectedState,nextState,eventId,detail});
 await assert.rejects(transition('buyer',1,'PENDING','SUBMITTED','owner-bypass',
   'Synthetic archived assets delivered'),{code:'LOCAL_OWNER_DELIVERY_DISABLED'});
 assert.equal((await ledger.getContract({contractId:'c1',actorId:'buyer',
   merchantId:'tenantA'})).version,1);
 // Seller's dedicated workflow persists under the same SQLite file.
 await ledger.assignLocalContractSeller({contractId:'c1',merchantId:'tenantA',
   sellerProfileId:'profile1'});
 await ledger.transitionMarketplaceMilestone({contractId:'c1',milestoneId:'m1',
   actorId:'seller',merchantId:'tenantA',expectedVersion:1,
   expectedState:'PENDING',nextState:'SUBMITTED',eventId:'delivered-c1',
   detail:'Synthetic archived assets delivered'});
 await enable(ledger,'reviewer',false);
 await assert.rejects(transition('reviewer',2,'SUBMITTED','ACCEPTED','invalid-review'),
   {code:'LOCAL_WRITE_ROLE_REVOKED'});
 const saved=await ledger.getContract({contractId:'c1',actorId:'buyer',
   merchantId:'tenantA'});
 assert.equal(saved.version,2);
 assert.equal(saved.milestones[0].state,'SUBMITTED');
 const events=await ledger.listContractEvents({contractId:'c1',actorId:'buyer',
   merchantId:'tenantA'});
 assert.deepEqual(events.map(e=>e.eventType),['CREATED','SUBMITTED']);
}));
test('opt-in local legacy owner-delivery remains gated and revocation-aware',fixture(async({ledger})=>{
 await ledger.approve({id:'q1',actorId:'buyer',expectedVersion:1,amountMinor:1500});
 await ledger.createContract({id:'c1',quoteId:'q1',actorId:'buyer',
   merchantId:'tenantA',reviewerId:'reviewer',expectedVersion:1,
   eventId:'newc1',milestones:[{id:'m1',step:1,amountMinor:1500}]});
 await enable(ledger,'buyer',false);
 await assert.rejects(ledger.transitionMilestone({contractId:'c1',milestoneId:'m1',
   actorId:'buyer',merchantId:'tenantA',expectedVersion:1,
   expectedState:'PENDING',nextState:'SUBMITTED',eventId:'blocked-submit',
   detail:'Synthetic submitted source files'}),{code:'LOCAL_WRITE_ROLE_REVOKED'});
 await enable(ledger,'buyer',true,2);
 const result=await ledger.transitionMilestone({contractId:'c1',milestoneId:'m1',
   actorId:'buyer',merchantId:'tenantA',expectedVersion:1,
   expectedState:'PENDING',nextState:'SUBMITTED',eventId:'allowed-submit',
   detail:'Synthetic submitted source files'});
 assert.equal(result.version,2);
}),{ownerDelivery:true});
test('separate SQLite connection revocation is observed on next locked write',fixture(async({ledger,filename})=>{
 const second=createSqliteLedger({filename,enforceLocalMemberWrites:true});
 try{
  const p=createMarketplaceIdentityPolicy({resolveTrustedSession:async()=>({
    verified:true,actorId:'buyer',merchantId:'tenantA'}),
   resolveMembership:id=>ledger.getLocalMember(id)});
  const proof=await p.issueProof('server-handle');
  await p.authorize(proof,{action:'quote.approve',
    resource:await ledger.getQuoteAuthorityResource('q1')});
  await second.setLocalMemberActive({actorId:'buyer',expectedRevision:1,active:false});
  await assert.rejects(ledger.approve({id:'q1',actorId:'buyer',
    expectedVersion:1,amountMinor:1600}),{code:'LOCAL_WRITE_ROLE_REVOKED'});
  assert.equal((await second.get('q1')).status,'PROPOSED');
 }finally{second.close();}
}));
