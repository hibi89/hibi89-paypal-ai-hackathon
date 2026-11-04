import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createHostVerifiedSessionStore} from '../src/host_verified_session_store.mjs';
import {createTrustedMarketplaceGateway} from '../src/trusted_marketplace_gateway.mjs';

const origin='https://proofline.example.com';
const issuer='https://identity.example.org';
const audience='proofline-test-audience';
const prompt='Delivered the completed implementation and QA report';
const sample=(suffix='EXTERNAL_ASSERTION_001')=>Object.freeze({id:suffix});
const fixture=fn=>async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ppl-host-session-'));
 const ledger=createSqliteLedger({filename:join(dir,'market.sqlite'),enforceLocalMemberWrites:true});
 let auth;
 let ms=1761987600000;
 const known={
  'external-buyer':{actorId:'buyerA',merchantId:'tenantA'},
  'external-seller':{actorId:'sellerA',merchantId:'tenantA'},
  'external-reviewer':{actorId:'reviewerA',merchantId:'tenantA'}
 };
 let providerCalls=0;
 const makeStore=()=>createHostVerifiedSessionStore({
  filename:join(dir,'session.sqlite'),expectedOrigin:origin,
  trustedIssuer:issuer,trustedAudience:audience,now:()=>ms,ttlMs:15*60*1000,
  verifyExternalIdentity:async proof=>{
   providerCalls++; // synthetic injected validator; NO HTTP.
   if(!proof||!Object.keys(known).includes(proof.subject)||
      typeof proof.id!=='string')return null;
   return {verified:true,issuer,audience,subject:proof.subject,
    assertionId:proof.id,authenticatedAtMs:ms};
  },
  lookupExternalAccount:async({issuer:source,subject})=>
   source===issuer?known[subject]:null,
  getMembership:actor=>ledger.getLocalMember(actor)
 });
 try{
  await ledger.insertQuote({id:'projectA',ownerId:'buyerA',merchantId:'tenantA'});
  for(const m of [
   {actorId:'buyerA',merchantId:'tenantA',role:'buyer'},
   {actorId:'sellerA',merchantId:'tenantA',role:'seller',sellerProfileId:'profileA'},
   {actorId:'reviewerA',merchantId:'tenantA',role:'reviewer'}])
   await ledger.provisionLocalMember(m);
  await ledger.approve({id:'projectA',actorId:'buyerA',expectedVersion:1,amountMinor:2400});
  await ledger.createContract({
   id:'contractA',quoteId:'projectA',actorId:'buyerA',merchantId:'tenantA',
   reviewerId:'reviewerA',expectedVersion:1,eventId:'create-contractA',
   milestones:[{id:'stepA',step:1,amountMinor:2400}]
  });
  await ledger.assignLocalContractSeller({
   contractId:'contractA',merchantId:'tenantA',sellerProfileId:'profileA'
  });
  auth=makeStore();
  const req=(path,issued,{method='GET',csrfToken,originHeader=origin,
    headers={},body}={})=>new Request(origin+path,{
    method,
    headers:{cookie:issued?.setCookie?.split(';')[0]??'',
      ...(method==='POST'?{
       origin:originHeader,
       'x-csrf-token':csrfToken??issued?.csrfToken??'',
       'content-type':'application/json'
      }:{}),...headers},
    ...(method==='POST'?{body:JSON.stringify(body??{})}:{})
   });
  await fn({dir,ledger,auth,makeStore,getTime:()=>ms,setTime:t=>ms=t,
    request:req,known,getProviderCalls:()=>providerCalls});
 }finally{try{auth?.close()}catch{};ledger.close();rmSync(dir,{recursive:true,force:true})}
};

test('independent HTTPS IdP + preprovisioned identity binding are required',()=>{
 const ledger={getLocalMember(){}};
 assert.throws(()=>createHostVerifiedSessionStore({}),
  e=>e.code==='HOST_SESSION_PRIVATE_DEPENDENCIES_REQUIRED');
 for(const expectedOrigin of ['http://proofline.example.com',
  'https://localhost','https://127.0.0.1','https://proofline.example.com/path',
  'https://proofline.example.com:444']){
  assert.throws(()=>createHostVerifiedSessionStore({
   filename:'/tmp/NO_FILE_SHOULD_BE_CREATED_1.sqlite',
   expectedOrigin,trustedIssuer:issuer,trustedAudience:audience,
   verifyExternalIdentity:async()=>null,
   lookupExternalAccount:async()=>null,
   getMembership:ledger.getLocalMember
  }),e=>e.code==='HOST_SESSION_HTTPS_ORIGIN_REQUIRED');
 }
});

test('verified external subject issues durable hashed cookie; duplicate IdP assertion is never replayed',
 fixture(async({dir,auth,request})=>{
  const issued=await auth.establish({id:'VERIFIED_IDP_EVENT_0001',subject:'external-buyer'});
  assert.match(issued.setCookie,/^__Host-proofline_session=[A-Za-z0-9_-]{43}; Secure; HttpOnly; Path=\/; SameSite=Strict; Max-Age=900$/);
  assert.match(issued.csrfToken,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(issued.paymentAuthorized,false);
  const bytes=readFileSync(join(dir,'session.sqlite'),'utf8');
  const bearer=issued.setCookie.split('=')[1].split(';')[0];
  assert.equal(bytes.includes(bearer),false);
  assert.equal(bytes.includes(issued.csrfToken),false);
  assert.equal(bytes.includes('external-buyer'),false);
  const session=await auth.resolveRequest(request('/api/marketplace/quotes/projectA',issued));
  assert.equal(session.actorId,'buyerA');
  assert.equal(session.merchantId,'tenantA');
  assert.equal(session.role,'buyer');
  assert.equal(session.membershipRevision,1);
  await assert.rejects(auth.establish({id:'VERIFIED_IDP_EVENT_0001',subject:'external-buyer'}),
   e=>e.code==='HOST_IDP_ASSERTION_ALREADY_CONSUMED');
  assert.equal((await auth.resolveRequest(request('/api/marketplace/quotes/projectA',issued))).verified,true);
 }));

test('host cookie and CSRF session integrates with original role gateway and real SQLite milestone',
 fixture(async({ledger,auth,request})=>{
  const buyer=await auth.establish({id:'HOST_REAL_IDP_EVENT_BUYER_01',subject:'external-buyer'});
  const seller=await auth.establish({id:'HOST_REAL_IDP_EVENT_SELLER_01',subject:'external-seller'});
  const reviewer=await auth.establish({id:'HOST_REAL_IDP_EVENT_REVIEW_01',subject:'external-reviewer'});
  const gateway=createTrustedMarketplaceGateway({
   ledger,expectedOrigin:origin,
   resolveVerifiedHostSession:req=>auth.resolveForGateway(req)
  });
  const get=async(path,issued)=>gateway.handle(request(path,issued));
  let result=await get('/api/marketplace/quotes/projectA',buyer);
  assert.equal(result.status,200,await result.clone().text());
  assert.equal((await result.json()).quote.ownerId,'buyerA');
  assert.equal((await get('/api/marketplace/quotes/projectA',seller)).status,403);
  assert.equal((await get('/api/marketplace/contracts/contractA',seller)).status,200);
  assert.equal((await get('/api/marketplace/contracts/contractA',reviewer)).status,200);
  const submitPath='/api/marketplace/contracts/contractA/milestones/stepA/submit';
  const submission={eventId:'submit-verified-host',expectedVersion:1,
   expectedState:'PENDING',detail:prompt};
  result=await gateway.handle(request(submitPath,seller,{method:'POST',body:submission}));
  assert.equal(result.status,200,await result.clone().text());
  assert.equal((await result.json()).transition.state,'SUBMITTED');
  const approval='/api/marketplace/contracts/contractA/milestones/stepA/accept';
  result=await gateway.handle(request(approval,reviewer,{
   method:'POST',body:{eventId:'review-verified-host',expectedVersion:2}
  }));
  assert.equal(result.status,200,await result.clone().text());
  assert.equal((await result.json()).transition.state,'ACCEPTED');
  assert.equal((await ledger.getContract({contractId:'contractA',
   actorId:'buyerA',merchantId:'tenantA'})).paymentState,'NOT_CAPTURED');
  assert.equal((await ledger.listAttempts('projectA')).length,0);
  assert.equal(gateway.paypalCreateEnabled,false);
 }));

test('expired, revoked, cross-origin and duplicate cookie cannot authenticate or authorize write',
 fixture(async({auth,request,getTime,setTime})=>{
  const issued=await auth.establish({id:'EXTERNAL_SESSION_EXPIRE_01',subject:'external-seller'});
  const path='/api/marketplace/contracts/contractA/milestones/stepA/submit';
  const requestFor=(options={})=>request(path,issued,{method:'POST',
   body:{eventId:'never-post',expectedVersion:1,expectedState:'PENDING',detail:prompt},
   ...options});
  assert.equal((await auth.resolveForGateway(requestFor())).verified,true);
  assert.equal(await auth.resolveForGateway(requestFor({csrfToken:'wrong'})),null);
  assert.equal(await auth.resolveForGateway(requestFor({headers:{cookie:
   issued.setCookie.split(';')[0]+'; '+issued.setCookie.split(';')[0]}})),null);
  assert.equal(await auth.resolveForGateway(new Request('https://evil.example.net'+path,{
   headers:{cookie:issued.setCookie.split(';')[0]}})),null);
  await assert.rejects(auth.revokeRequest(requestFor({csrfToken:'wrong'})),
   e=>e.code==='HOST_LOGOUT_CSRF_REQUIRED');
  const revoked=await auth.revokeRequest(requestFor());
  assert.equal(revoked.revoked,true);
  assert.match(revoked.clearCookie,/Secure; HttpOnly; Path=\/; SameSite=Strict; Max-Age=0$/);
  assert.equal(await auth.resolveForGateway(requestFor()),null);
  await assert.rejects(auth.revokeRequest(requestFor()),
   e=>e.code==='HOST_LOGOUT_AUTH_REQUIRED');
  const after=await auth.establish({id:'EXTERNAL_SESSION_EXPIRE_02',subject:'external-seller'});
  setTime(getTime()+15*60*1000);
  assert.equal(await auth.resolveForGateway(request(path,after)),null);
 }));

test('suspend/reactivate and role revision changes invalidate prior host bearer after restart',
 fixture(async({ledger,auth,request,makeStore})=>{
  const issued=await auth.establish({id:'EXTERNAL_REVOKE_REACTIVATE_01',subject:'external-seller'});
  const path='/api/marketplace/contracts/contractA';
  assert.equal((await auth.resolveForGateway(request(path,issued))).role,'seller');
  await ledger.setLocalMemberActive({actorId:'sellerA',expectedRevision:1,active:false});
  assert.equal(await auth.resolveForGateway(request(path,issued)),null);
  await ledger.setLocalMemberActive({actorId:'sellerA',expectedRevision:2,active:true});
  assert.equal(await auth.resolveForGateway(request(path,issued)),null);
  auth.close();
  const after=makeStore();
  try{
   assert.equal(await after.resolveForGateway(request(path,issued)),null);
   const fresh=await after.establish({id:'EXTERNAL_REVOKE_REACTIVATE_02',subject:'external-seller'});
   assert.equal((await after.resolveForGateway(request(path,fresh))).membershipRevision,3);
  }finally{after.close()}
 }));

test('non-IdP proof, unknown subject and foreign mapping cannot grant bearer session',
 fixture(async({auth,dir,getProviderCalls})=>{
  for(const proof of [
   null,{subject:'external-buyer'},
   {id:'FAKE_IDP_ASSERTION_222',subject:'unknown-account'},
   {id:'FAKE_IDP_ASSERTION_333',subject:'external-buyer',
    verified:true,actorId:'sellerA',merchantId:'tenantA'}
  ]){
   if(proof?.id==='FAKE_IDP_ASSERTION_333'){
    // The mocked IdP callback maps subject only; browser actor/role ignored.
    const created=await auth.establish(proof);
    assert.equal(created.paymentAuthorized,false);
   }else await assert.rejects(auth.establish(proof),e=>
    ['HOST_IDP_ATTESTATION_UNVERIFIED','HOST_PREPROVISIONED_ACCOUNT_REQUIRED'].includes(e.code));
  }
  assert.ok(getProviderCalls()>=3);
  assert.ok(readFileSync(join(dir,'session.sqlite')).length>0);
 }));
