import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createQuoteApi} from '../src/quote_api.mjs';
import {createContractApi} from '../src/contract_api.mjs';
import {createMarketplaceIdentityPolicy} from '../src/marketplace_identity_policy.mjs';

async function withLedger(fn){
 const folder=mkdtempSync(join(tmpdir(),'paypal-role-rest-'));
 const ledger=createSqliteLedger({filename:join(folder,'ledger.sqlite')});
 try{
  await ledger.insertQuote({id:'quote-role',ownerId:'buyer',merchantId:'tenantA'});
  await ledger.provisionLocalMember({actorId:'buyer',merchantId:'tenantA',role:'buyer'});
  await ledger.provisionLocalMember({actorId:'reviewer',merchantId:'tenantA',role:'reviewer'});
  await ledger.provisionLocalMember({actorId:'seller',merchantId:'tenantA',
    role:'seller',sellerProfileId:'fictional-seller'});
  await ledger.provisionLocalMember({actorId:'foreign',merchantId:'tenantB',role:'buyer'});
  const sessions=new WeakMap();
  const resolveSession=req=>sessions.get(req)||null;
  const policy=createMarketplaceIdentityPolicy({resolveTrustedSession:resolveSession,
    resolveMembership:id=>ledger.getLocalMember(id)});
  const quote=createQuoteApi({repository:ledger,resolveSession,identityPolicy:policy});
  const contract=createContractApi({repository:ledger,resolveSession,
    identityPolicy:policy,allowLegacyOwnerDelivery:false});
  async function invoke(handler,actor,path,method='GET',payload={},over={}){
   const row=await ledger.getLocalMember(actor);
   const req=new Request('https://test.example'+path,{method,
    ...(method==='POST'?{body:JSON.stringify(payload)}:{}),
    headers:{...(method==='POST'?{'content-type':'application/json',
      'origin':'https://test.example','x-csrf-token':over.csrf||'trusted-csrf'}:{}),
      ...(over.headers||{})}});
   if(actor)sessions.set(req,{verified:true,actorId:actor,
     merchantId:over.merchantId||row?.merchantId,csrfToken:'trusted-csrf'});
   const res=await handler(req);
   return {status:res.status,data:await res.json()};
  }
  await fn({ledger,quote,contract,invoke});
 }finally{ledger.close();rmSync(folder,{recursive:true,force:true});}
}
test('existing quote REST: only verified active buyer can read and approve',async()=>{
 await withLedger(async({ledger,quote,invoke})=>{
  const q='/api/quotes/quote-role';
  assert.equal((await invoke(quote,'buyer',q)).status,200);
  for(const actor of ['seller','reviewer','foreign'])
   assert.notEqual((await invoke(quote,actor,q)).status,200);
  const forged=await invoke(quote,'buyer',q,'GET',{},{
    merchantId:'tenantB',headers:{'x-role':'buyer','x-actor-id':'buyer'}});
  assert.notEqual(forged.status,200);
  const denied=await invoke(quote,'reviewer',q+'/approve','POST',{
    expectedVersion:1,amountMinor:1500,confirmed:true
  });
  assert.notEqual(denied.status,200);
  const approved=await invoke(quote,'buyer',q+'/approve','POST',{
    expectedVersion:1,amountMinor:1500,confirmed:true
  });
  assert.equal(approved.status,200,JSON.stringify(approved.data));
  assert.equal(approved.data.quote.status,'APPROVED');
  assert.equal((await ledger.get('quote-role')).approval.amountMinor,1500);
  await ledger.setLocalMemberActive({actorId:'buyer',expectedRevision:1,active:false});
  const disabled=await invoke(quote,'buyer',q);
  assert.equal(disabled.status,403);
  assert.equal((await ledger.get('quote-role')).status,'APPROVED');
  assert.equal((await ledger.listAttempts('quote-role')).length,0);
 });
});
test('existing contract REST: buyer creates, reviewer reads, seller and other tenant denied',async()=>{
 await withLedger(async({ledger,quote,contract,invoke})=>{
  const q='/api/quotes/quote-role';
  assert.equal((await invoke(quote,'buyer',q+'/approve','POST',{
    expectedVersion:1,amountMinor:1500,confirmed:true
  })).status,200);
  const payload={id:'contract-role',quoteId:'quote-role',reviewerId:'reviewer',
    expectedVersion:1,eventId:'create-role-contract',
    milestones:[{id:'step-role',step:1,amountMinor:1500}]};
  for(const actor of ['reviewer','seller','foreign'])
    assert.notEqual((await invoke(contract,actor,'/api/contracts','POST',payload)).status,201);
  const done=await invoke(contract,'buyer','/api/contracts','POST',payload);
  assert.equal(done.status,201,JSON.stringify(done.data));
  const path='/api/contracts/contract-role';
  assert.equal((await invoke(contract,'buyer',path)).status,200);
  assert.equal((await invoke(contract,'reviewer',path)).status,200);
  for(const actor of ['seller','foreign'])
    assert.notEqual((await invoke(contract,actor,path)).status,200);
  // Seller submission goes via the separate atomically authorized workflow.
  assert.notEqual((await invoke(contract,'buyer',path+'/milestones/step-role/submit','POST',{
    expectedVersion:1,expectedState:'PENDING',eventId:'owner-cannot-submit',
    detail:'Synthetic owner not seller'})).status,200);
  assert.equal((await ledger.getContract({contractId:'contract-role',
    actorId:'buyer',merchantId:'tenantA'})).version,1);
  await ledger.setLocalMemberActive({actorId:'reviewer',expectedRevision:1,active:false});
  assert.equal((await invoke(contract,'reviewer',path)).status,403);
  assert.equal((await ledger.listAttempts('quote-role')).length,0);
 });
});
test('policy injection requires authoritative ledger and branded session hooks',()=>{
 assert.throws(()=>createQuoteApi({repository:{get:()=>null,approve:()=>{}},
   resolveSession:async()=>null,identityPolicy:{}}),TypeError);
 assert.throws(()=>createContractApi({repository:{
   createContract(){},getContract(){},listContractEvents(){},transitionMilestone(){}
 },resolveSession:async()=>null,identityPolicy:{}}),TypeError);
});
