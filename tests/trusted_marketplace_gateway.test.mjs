import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createTrustedMarketplaceGateway} from '../src/trusted_marketplace_gateway.mjs';

const origin='https://proofline.example.com';
const csrf='FAKE_HOST_CSRF_TOKEN_BOUND_TO_SESSION_123456';
const task='Delivered the source archive with testing evidence';
const fixture=fn=>async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ppl-identity-host-'));
 const db=createSqliteLedger({filename:join(dir,'store.sqlite'),
  enforceLocalMemberWrites:true});
 try{
  await db.insertQuote({id:'projectA',ownerId:'buyerA',merchantId:'tenantA'});
  await db.insertQuote({id:'projectB',ownerId:'buyerB',merchantId:'tenantB'});
  for(const membership of [
   {actorId:'buyerA',merchantId:'tenantA',role:'buyer'},
   {actorId:'buyerB',merchantId:'tenantB',role:'buyer'},
   {actorId:'sellerA',merchantId:'tenantA',role:'seller',
    sellerProfileId:'profileA'},
   {actorId:'reviewerA',merchantId:'tenantA',role:'reviewer'},
   {actorId:'operatorA',merchantId:'tenantA',role:'merchant_operator'},
   {actorId:'sellerB',merchantId:'tenantB',role:'seller',
    sellerProfileId:'profileB'}])
   await db.provisionLocalMember(membership);
  await db.approve({id:'projectA',actorId:'buyerA',expectedVersion:1,amountMinor:2400});
  await db.createContract({id:'contractA',quoteId:'projectA',actorId:'buyerA',
   merchantId:'tenantA',reviewerId:'reviewerA',expectedVersion:1,
   eventId:'contractA-created',
   milestones:[{id:'stepA',step:1,amountMinor:2400}]});
  await db.assignLocalContractSeller({
   contractId:'contractA',merchantId:'tenantA',sellerProfileId:'profileA'
  });
  const sessions=new WeakMap();
  const gateway=createTrustedMarketplaceGateway({
   expectedOrigin:origin,ledger:db,
   resolveVerifiedHostSession:req=>sessions.get(req)??null
  });
  async function call(actor,path,{method='GET',body,headers={},
    merchantId,verified=true}={}){
   const req=new Request(origin+path,{
    method,headers:{
     ...(method==='POST'?{
      origin,'content-type':'application/json','x-csrf-token':csrf}:{}),
     ...headers
    },
    ...(method==='POST'?{body:JSON.stringify(body??{})}:{})
   });
   if(actor){
    const member=await db.getLocalMember(actor);
    sessions.set(req,{verified,actorId:actor,
     merchantId:merchantId??member?.merchantId,csrfToken:csrf});
   }
   const response=await gateway.handle(req);
   return {status:response.status,data:await response.json(),
    headers:response.headers};
  }
  await fn({db,gateway,call,sessions});
 }finally{db.close();rmSync(dir,{recursive:true,force:true})}
};

test('HTTPS gateway requires a separately injected trusted host verifier and origin',()=>{
 assert.throws(()=>createTrustedMarketplaceGateway({}),
  /HOST_GATEWAY_TRUSTED_IDENTITY_AND_LEDGER_REQUIRED/);
 const fake={getLocalMember(){},getQuoteAuthorityResource(){},
  getContractAuthorityResource(){},transitionMarketplaceMilestone(){}};
 for(const expectedOrigin of ['http://proofline.example.com',
  'https://localhost','https://proofline.example.com/path',
  'https://127.0.0.1','https://proofline.example.com:8080'])
  assert.throws(()=>createTrustedMarketplaceGateway({
   ledger:fake,resolveVerifiedHostSession:async()=>null,expectedOrigin
  }),/HOST_GATEWAY_HTTPS_ORIGIN_REQUIRED/);
});
test('real SQLite buyer quote and buyer/seller/reviewer contract read, no payment authority',
 fixture(async({call,gateway})=>{
  assert.equal(gateway.publicHttpEnabled,false);
  assert.equal(gateway.loginProviderImplemented,false);
  const buyer=await call('buyerA','/api/marketplace/quotes/projectA');
  assert.equal(buyer.status,200,JSON.stringify(buyer.data));
  assert.equal(buyer.data.quote.id,'projectA');
  assert.equal(buyer.data.quote.approval.amountMinor,2400);
  assert.equal(buyer.data.paymentAuthorized,false);
  assert.equal(buyer.headers.get('cache-control'),'private, no-store');
  assert.equal(buyer.headers.get('x-content-type-options'),'nosniff');
  for(const actor of ['buyerA','sellerA','reviewerA']){
   const contract=await call(actor,'/api/marketplace/contracts/contractA');
   assert.equal(contract.status,200,JSON.stringify(contract.data));
   assert.equal(contract.data.contract.id,'contractA');
   assert.equal(contract.data.paymentAuthorized,false);
   assert.equal(contract.headers.get('set-cookie'),null);
   assert.equal(contract.headers.get('location'),null);
  }
  const events=await call('reviewerA','/api/marketplace/contracts/contractA/events');
  assert.equal(events.status,200);
  assert.equal(events.data.events.length,1);
  assert.equal(events.data.paymentAuthorized,false);
 }));
test('seller submits and independent reviewer accepts with host-auth CSRF; no PayPal POST',
 fixture(async({call,db})=>{
  const a=await call('sellerA',
   '/api/marketplace/contracts/contractA/milestones/stepA/submit',{
    method:'POST',body:{eventId:'host-submit-1',expectedVersion:1,
     expectedState:'PENDING',detail:task}
   });
  assert.equal(a.status,200,JSON.stringify(a.data));
  assert.equal(a.data.transition.state,'SUBMITTED');
  assert.equal(a.data.providerCalls,0);
  const b=await call('reviewerA',
   '/api/marketplace/contracts/contractA/milestones/stepA/accept',{
    method:'POST',body:{eventId:'host-accept-1',expectedVersion:2}
   });
  assert.equal(b.status,200,JSON.stringify(b.data));
  assert.equal(b.data.transition.state,'ACCEPTED');
  assert.equal((await db.getContract({contractId:'contractA',actorId:'buyerA',
   merchantId:'tenantA'})).paymentState,'NOT_CAPTURED');
  assert.equal((await db.listAttempts('projectA')).length,0);
 }));
test('unauthenticated, tenant spoof, role spoof and revoked membership deny all access',
 fixture(async({call,db})=>{
  assert.equal((await call(null,'/api/marketplace/quotes/projectA')).status,401);
  assert.equal((await call('buyerA','/api/marketplace/quotes/projectA',
   {verified:false})).status,401);
  assert.equal((await call('buyerB','/api/marketplace/quotes/projectA')).status,403);
  assert.equal((await call('sellerA','/api/marketplace/quotes/projectA')).status,403);
  assert.equal((await call('buyerA','/api/marketplace/quotes/projectA',
   {merchantId:'tenantB'})).status,403);
  assert.equal((await call('buyerB','/api/marketplace/contracts/contractA')).status,403);
  assert.equal((await call('sellerB','/api/marketplace/contracts/contractA')).status,403);
  assert.equal((await call('operatorA','/api/marketplace/contracts/contractA')).status,403);
  const forged=await call('buyerB','/api/marketplace/quotes/projectA',{
   headers:{'x-actor-id':'buyerA','x-role':'buyer','x-merchant-id':'tenantA'}
  });
  assert.equal(forged.status,403);
  await db.setLocalMemberActive({actorId:'sellerA',expectedRevision:1,active:false});
  assert.equal((await call('sellerA','/api/marketplace/contracts/contractA')).status,403);
  await db.setLocalMemberActive({actorId:'sellerA',expectedRevision:2,active:true});
  assert.equal((await call('sellerA','/api/marketplace/contracts/contractA')).status,200);
 }));
test('CSRF, origin, method and path boundaries fail closed before any SQLite mutation',
 fixture(async({call,db,gateway})=>{
  const url='/api/marketplace/contracts/contractA/milestones/stepA/submit';
  const body={eventId:'submit-evil',expectedVersion:1,
   expectedState:'PENDING',detail:task};
  for(const headers of [
   {'origin':'https://attacker.invalid'},
   {'x-csrf-token':'forged'},
   {'content-type':'text/plain'}
  ]){
   const x=await call('sellerA',url,{method:'POST',body,headers});
   assert.ok([403,415].includes(x.status),JSON.stringify(x.data));
  }
  assert.equal((await call(null,url,{method:'POST',body})).status,401);
  assert.equal((await call('buyerA',url,{method:'POST',body})).status,403);
  assert.equal((await call('sellerA',url,{method:'GET'})).status,405);
  assert.equal((await call('buyerA','/api/marketplace/quotes/projectA',{
   method:'POST',body})).status,405);
  for(const p of ['/api/marketplace/quotes/projectA?role=buyer',
   '/api/marketplace/orders','/api/paypal/orders',
   '/api/marketplace/contracts/contractA/milestones/stepA/capture'])
   assert.equal((await call('buyerA',p)).status,404);
  const wrong=new Request('https://attacker.invalid/api/marketplace/quotes/projectA');
  assert.equal((await gateway.handle(wrong)).status,404);
  assert.equal((await db.getContract({contractId:'contractA',
   actorId:'buyerA',merchantId:'tenantA'})).version,1);
  assert.equal((await db.listAttempts('projectA')).length,0);
 }));

test('trusted host session revoked or switched after first check blocks contract writes',fixture(async({db})=>{
 const p='/api/marketplace/contracts/contractA/milestones/stepA/submit';
 const body={eventId:'revoked-mid-request',expectedVersion:1,
  expectedState:'PENDING',detail:task};
 for(const scenario of ['revoke','switch','csrf-rotate']){
  let calls=0;
  const adapter=createTrustedMarketplaceGateway({
   ledger:db,expectedOrigin:origin,
   resolveVerifiedHostSession:()=>{
    calls++;
    const base={verified:true,actorId:'sellerA',merchantId:'tenantA',csrfToken:csrf};
    if(calls===1)return base;
    if(scenario==='revoke')return null;
    if(scenario==='switch')return {...base,actorId:'buyerA'};
    return {...base,csrfToken:'CHANGED_HOST_CSRF_TOKEN_VALUE_2'};
   }
  });
  const request=new Request(origin+p,{method:'POST',
   headers:{origin,'content-type':'application/json','x-csrf-token':csrf},
   body:JSON.stringify(body)});
  const reply=await adapter.handle(request);
  assert.equal(reply.status,401,scenario+': '+await reply.clone().text());
  assert.ok(calls>=2,scenario);
  assert.equal((await db.getContract({contractId:'contractA',
   actorId:'buyerA',merchantId:'tenantA'})).version,1);
  assert.equal((await db.listAttempts('projectA')).length,0);
 }
}));

test('late logout during quote payload read prevents stale response disclosure',
 fixture(async({db})=>{
  let loginActive=true,logoutOnGet=true,authReads=0;
  const guarded={
   ...db,
   async get(id){
    const quote=await db.get(id);
    if(logoutOnGet){logoutOnGet=false;loginActive=false;}
    return quote;
   }
  };
  const gateway=createTrustedMarketplaceGateway({
   ledger:guarded,expectedOrigin:origin,
   resolveVerifiedHostSession:async()=>{
    authReads++;
    return loginActive?{verified:true,actorId:'buyerA',
     merchantId:'tenantA'}:null;
   }
  });
  const req=()=>new Request(origin+'/api/marketplace/quotes/projectA');
  const stale=await gateway.handle(req());
  assert.equal(stale.status,401);
  assert.equal((await stale.json()).error,'HOST_AUTHENTICATION_REQUIRED');
  assert.ok(authReads>=4);
  loginActive=true;
  const fresh=await gateway.handle(req());
  assert.equal(fresh.status,200);
  assert.equal((await fresh.json()).quote.id,'projectA');
 }));

test('after completed durable workflow a revoked host cannot receive stale result',
 fixture(async({db})=>{
  let loginActive=true,logoutOnWrite=true;
  const guarded={
   ...db,
   async transitionMarketplaceMilestone(detail){
    const result=await db.transitionMarketplaceMilestone(detail);
    if(logoutOnWrite){logoutOnWrite=false;loginActive=false;}
    return result;
   }
  };
  const gateway=createTrustedMarketplaceGateway({
   ledger:guarded,expectedOrigin:origin,
   resolveVerifiedHostSession:async()=>loginActive?
    {verified:true,actorId:'sellerA',merchantId:'tenantA',
     csrfToken:csrf}:null
  });
  const req=()=>new Request(origin+
   '/api/marketplace/contracts/contractA/milestones/stepA/submit',{
    method:'POST',headers:{origin,'content-type':'application/json',
     'x-csrf-token':csrf},
    body:JSON.stringify({eventId:'late-logout-submit',expectedVersion:1,
     expectedState:'PENDING',detail:task})
   });
  const after=await gateway.handle(req());
  assert.equal(after.status,401);
  assert.equal((await after.json()).error,'HOST_AUTHENTICATION_REQUIRED');
  // Never retry a potentially completed financial or workflow mutation.
  const status=await db.getContract({
   contractId:'contractA',actorId:'buyerA',merchantId:'tenantA'
  });
  assert.equal(status.version,2);
  assert.equal(status.milestones[0].state,'SUBMITTED');
 }));
