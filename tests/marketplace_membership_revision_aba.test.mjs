import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createQuoteApi} from '../src/quote_api.mjs';
import {createContractApi} from '../src/contract_api.mjs';
import {createMarketplaceIdentityPolicy} from '../src/marketplace_identity_policy.mjs';

const origin='https://role-version.test';
const post=(path,payload)=>new Request(origin+path,{method:'POST',
 headers:{origin,'content-type':'application/json','x-csrf-token':'server-csrf'},
 body:JSON.stringify(payload)});
const status=async response=>({status:response.status,body:await response.json()});
async function withLedger(fn){
 const folder=mkdtempSync(join(tmpdir(),'paypal-aba-'));
 const filename=join(folder,'role-version.sqlite');
 const ledger=createSqliteLedger({filename,
   enforceLocalMemberWrites:true,allowLocalOwnerDelivery:true});
 try {
  await ledger.insertQuote({id:'q1',ownerId:'buyer',merchantId:'tenantA'});
  for(const member of [
    {actorId:'buyer',merchantId:'tenantA',role:'buyer'},
    {actorId:'reviewer',merchantId:'tenantA',role:'reviewer'},
    {actorId:'seller',merchantId:'tenantA',role:'seller',sellerProfileId:'profileA'}
  ])await ledger.provisionLocalMember(member);
  const sessions=new WeakMap();
  const resolveSession=req=>sessions.get(req);
  const policy=createMarketplaceIdentityPolicy({
    resolveTrustedSession:resolveSession,
    resolveMembership:actorId=>ledger.getLocalMember(actorId)
  });
  const call=(handler,actor,req)=>{
   sessions.set(req,{verified:true,actorId:actor,merchantId:'tenantA',
      csrfToken:'server-csrf'});
   return handler(req).then(status);
  };
  await fn({ledger,filename,policy,resolveSession,call});
 } finally {ledger.close();rmSync(folder,{recursive:true,force:true});}
}
const change=async(ledger,actorId,oldRevision=1)=>{
 await ledger.setLocalMemberActive({actorId,expectedRevision:oldRevision,active:false});
 return ledger.setLocalMemberActive({actorId,expectedRevision:oldRevision+1,active:true});
};
test('trusted grant carries persisted membership revision but inspection never exposes it',()=>withLedger(async({ledger})=>{
 const trusted=createMarketplaceIdentityPolicy({
   resolveTrustedSession:async()=>({verified:true,actorId:'buyer',merchantId:'tenantA'}),
   resolveMembership:actorId=>ledger.getLocalMember(actorId)
 });
 const proof=await trusted.issueProof('local-server-handle');
 const grant=await trusted.authorize(proof,{action:'quote.approve',
   resource:await ledger.getQuoteAuthorityResource('q1')});
 assert.equal(grant.membershipRevision,1);
 const publicProjection=await trusted.inspect(proof);
 assert.equal(Object.hasOwn(publicProjection,'membershipRevision'),false);
 assert.equal(publicProjection.paymentAuthorized,false);
}));
test('quote approval rejects stale authorized grant across revoke/reactivate before DB write',()=>withLedger(async({ledger,policy,resolveSession,call})=>{
 let touched=0;
 const repository={...ledger,approve:async args=>{
  if(touched++===0)await change(ledger,'buyer',1);
  return ledger.approve(args);
 }};
 const api=createQuoteApi({repository,resolveSession,identityPolicy:policy});
 const body={confirmed:true,expectedVersion:1,amountMinor:1500};
 const first=await call(api,'buyer',post('/api/quotes/q1/approve',body));
 assert.equal(first.status,403,JSON.stringify(first));
 assert.equal(first.body.error,'LOCAL_WRITE_ROLE_VERSION_CHANGED');
 assert.equal((await ledger.get('q1')).status,'PROPOSED');
 assert.equal((await ledger.listAttempts('q1')).length,0);
 const fresh=await call(api,'buyer',post('/api/quotes/q1/approve',body));
 assert.equal(fresh.status,200,JSON.stringify(fresh));
 assert.equal(fresh.body.quote.approval.amountMinor,1500);
 assert.equal((await ledger.getLocalMember('buyer')).revision,3);
}));
test('quote rejection and offline drafting reject stale version, preserve original quote',()=>withLedger(async({ledger,policy,resolveSession,call})=>{
 let changed=false;
 const repository={...ledger,
   reject:async args=>{if(!changed){changed=true;await change(ledger,'buyer');}
     return ledger.reject(args);}};
 const api=createQuoteApi({repository,resolveSession,identityPolicy:policy,
   draftProvider:async()=>({source:'OFFLINE_MOCK',suggestedMinor:2000})});
 const bad=await call(api,'buyer',post('/api/quotes/q1/reject',{
   expectedVersion:1,reason:'Synthetic rejected terms'}));
 assert.equal(bad.status,403);
 assert.equal(bad.body.error,'LOCAL_WRITE_ROLE_VERSION_CHANGED');
 assert.equal((await ledger.get('q1')).rejection,null);
 await change(ledger,'buyer',3);
 const current=await ledger.getLocalMember('buyer');
 assert.equal(current.revision,5);
 // This call is intentionally direct and uses the trusted grant's old revision.
 await assert.rejects(ledger.revise({id:'q1',actorId:'buyer',expectedVersion:1,
   scope:'Safe mock quote draft from old session',
   suggestedMinor:2000,suggestionSource:'OFFLINE_MOCK',
   expectedMembershipRevision:3}),{code:'LOCAL_WRITE_ROLE_VERSION_CHANGED'});
 const good=await call(api,'buyer',post('/api/quotes/q1/draft',{
   expectedVersion:1,scope:'Safe mock quote draft from new session'}));
 assert.equal(good.status,200,JSON.stringify(good));
 assert.equal((await ledger.get('q1')).version,2);
}));
test('buyer contract creation fails when grant reactivated before transaction, fresh request succeeds',()=>withLedger(async({ledger,policy,resolveSession,call})=>{
 await ledger.approve({id:'q1',actorId:'buyer',expectedVersion:1,amountMinor:1500});
 let first=true;
 const repository={...ledger,createContract:async args=>{
  if(first){first=false;await change(ledger,'buyer');}
  return ledger.createContract(args);
 }};
 const api=createContractApi({repository,resolveSession,identityPolicy:policy});
 const request={id:'c1',quoteId:'q1',reviewerId:'reviewer',expectedVersion:1,
   eventId:'create-c1',milestones:[{id:'m1',step:1,amountMinor:1500}]};
 const denied=await call(api,'buyer',post('/api/contracts',request));
 assert.equal(denied.status,403,JSON.stringify(denied));
 assert.equal(denied.body.error,'LOCAL_WRITE_ROLE_VERSION_CHANGED');
 assert.equal(await ledger.getContractAuthorityResource('c1'),null);
 const fresh=await call(api,'buyer',post('/api/contracts',request));
 assert.equal(fresh.status,201,JSON.stringify(fresh));
 assert.equal(fresh.body.contract.version,1);
 const events=await ledger.listContractEvents({contractId:'c1',
   actorId:'buyer',merchantId:'tenantA'});
 assert.equal(events.length,1);
}));
test('reviewer cannot accept with stale grant after revocation/reactivation; event remains unchanged',()=>withLedger(async({ledger,policy,resolveSession,call})=>{
 await ledger.approve({id:'q1',actorId:'buyer',expectedVersion:1,amountMinor:1500});
 await ledger.createContract({id:'c1',quoteId:'q1',actorId:'buyer',
   merchantId:'tenantA',reviewerId:'reviewer',expectedVersion:1,
   eventId:'created',milestones:[{id:'m1',step:1,amountMinor:1500}]});
 await ledger.transitionMilestone({contractId:'c1',milestoneId:'m1',
   actorId:'buyer',merchantId:'tenantA',expectedVersion:1,
   expectedState:'PENDING',nextState:'SUBMITTED',eventId:'submitted',
   detail:'Synthetic delivery evidence'});
 let first=true;
 const repository={...ledger,transitionMilestone:async args=>{
  if(first){first=false;await change(ledger,'reviewer');}
  return ledger.transitionMilestone(args);
 }};
 const api=createContractApi({repository,resolveSession,identityPolicy:policy,
   allowLegacyOwnerDelivery:true});
 const request={expectedVersion:2,eventId:'accepted'};
 const denied=await call(api,'reviewer',post('/api/contracts/c1/milestones/m1/accept',request));
 assert.equal(denied.status,403,JSON.stringify(denied));
 assert.equal(denied.body.error,'LOCAL_WRITE_ROLE_VERSION_CHANGED');
 const original=await ledger.getContract({contractId:'c1',actorId:'buyer',merchantId:'tenantA'});
 assert.equal(original.version,2);
 assert.equal(original.milestones[0].state,'SUBMITTED');
 assert.deepEqual((await ledger.listContractEvents({contractId:'c1',actorId:'buyer',
   merchantId:'tenantA'})).map(e=>e.eventType),['CREATED','SUBMITTED']);
 const approved=await call(api,'reviewer',post('/api/contracts/c1/milestones/m1/accept',request));
 assert.equal(approved.status,200,JSON.stringify(approved));
 assert.equal(approved.body.contract.version,3);
}));
test('separate SQLite connection revoke and reactivate invalidates older reservation revision',()=>withLedger(async({ledger,filename})=>{
 const second=createSqliteLedger({filename,enforceLocalMemberWrites:true});
 try{
  const old=(await ledger.getLocalMember('buyer')).revision;
  await change(second,'buyer',old);
  await assert.rejects(ledger.claimAiDraft({id:'q1',actorId:'buyer',
    expectedVersion:1,expectedMembershipRevision:old}),
    {code:'LOCAL_WRITE_ROLE_VERSION_CHANGED'});
  await ledger.approve({id:'q1',actorId:'buyer',expectedVersion:1,
    amountMinor:1500,expectedMembershipRevision:old+2});
  await assert.rejects(ledger.claimOperation({quoteId:'q1',actorId:'buyer',
    merchantId:'tenantA',operation:'create',expectedMembershipRevision:old}),
    {code:'LOCAL_WRITE_ROLE_VERSION_CHANGED'});
  assert.equal((await ledger.listAttempts('q1')).length,0);
  const allowed=await ledger.claimOperation({quoteId:'q1',actorId:'buyer',
    merchantId:'tenantA',operation:'create',expectedMembershipRevision:old+2});
  assert.equal(allowed.action,'FIRST_CLAIM_ONLY_NO_PROVIDER_CALL');
 }finally{second.close();}
}));
