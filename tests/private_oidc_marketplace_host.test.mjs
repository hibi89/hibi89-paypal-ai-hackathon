import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,generateKeyPairSync,sign} from 'node:crypto';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createPrivateOidcMarketplaceHost} from '../src/private_oidc_marketplace_host.mjs';

const origin='https://proofline.example.com';
const issuer='https://accounts.example.org';
const clientId='proofline-offline-client';
const now=1761987600000;
const pair=generateKeyPairSync('rsa',{modulusLength:2048});
const publicKey={...pair.publicKey.export({format:'jwk'}),
 kid:'INTEGRATED_OFFLINE_01',alg:'RS256',use:'sig'};
const signed=(nonce,subject)=>{
 const h=Buffer.from(JSON.stringify({alg:'RS256',kid:publicKey.kid,
  typ:'JWT'})).toString('base64url');
 const n=Math.floor(now/1000);
 const p=Buffer.from(JSON.stringify({iss:issuer,aud:clientId,sub:subject,
  nonce,iat:n-2,auth_time:n-2,exp:n+180,
  actorId:'FORGED_ADMIN',merchantId:'FORGED_TENANT'})).toString('base64url');
 return h+'.'+p+'.'+sign('RSA-SHA256',Buffer.from(h+'.'+p),pair.privateKey)
  .toString('base64url');
};
const http=(path,{method='GET',cookie,csrf,body,originHeader=origin}={})=>
 new Request(origin+path,{method,headers:{
  ...(cookie?{cookie}:{}),
  ...(method==='POST'?{origin:originHeader}:{}),
  ...(csrf?{'x-csrf-token':csrf}:{}),
  ...(body?{'content-type':'application/json'}:{})
 },...(body?{body:JSON.stringify(body)}:{})});
const read=async(res,status)=>{
 const b=await res.clone().json();
 assert.equal(res.status,status,JSON.stringify(b));
 assert.notEqual(b.paymentAuthorized,true);
 return b;
};
const fixture=fn=>async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ppl-oidc-compose-'));
 const files={
  challenge:join(dir,'challenge.sqlite'),
  jwks:join(dir,'trust.sqlite'),
  bindings:join(dir,'bindings.sqlite'),
  sessions:join(dir,'session.sqlite')
 };
 const ledger=createSqliteLedger({
  filename:join(dir,'marketplace.sqlite'),enforceLocalMemberWrites:true
 });
 const codes=new Map();
 let calls=0,operatorApproved=true,host;
 const codeTransport={exchange:async ticket=>{
  calls++;
  const subject=codes.get(ticket.code);
  if(!subject)throw Error('INJECTED_CODE_INVALID');
  return {idToken:signed(ticket.expectedNonce,subject),
   expectedNonce:ticket.expectedNonce};
 }};
 const options={files,publicOrigin:origin,issuer,clientId,
  authorizationEndpoint:issuer+'/oauth2/authorize',
  tokenEndpoint:issuer+'/oauth2/token',
  jwksUri:issuer+'/.well-known/jwks.json',
  approvedProviderOrigins:[issuer],
  challengeKey:randomBytes(32),subjectPepper:randomBytes(32),
  ledger,codeTransport,
  authorizeTrustUpdate:()=>operatorApproved,
  authorizeOperatorProvisioning:()=>operatorApproved,
  now:()=>now};
 try{
  await ledger.insertQuote({id:'projectA',ownerId:'buyerA',merchantId:'tenantA'});
  for(const x of [
   {actorId:'buyerA',merchantId:'tenantA',role:'buyer'},
   {actorId:'sellerA',merchantId:'tenantA',role:'seller',sellerProfileId:'profileA'},
   {actorId:'reviewerA',merchantId:'tenantA',role:'reviewer'},
   {actorId:'buyerB',merchantId:'tenantB',role:'buyer'}
  ])await ledger.provisionLocalMember(x);
  await ledger.approve({id:'projectA',actorId:'buyerA',expectedVersion:1,amountMinor:2400});
  await ledger.createContract({id:'contractA',quoteId:'projectA',actorId:'buyerA',
   merchantId:'tenantA',reviewerId:'reviewerA',expectedVersion:1,
   eventId:'contract-create-1',milestones:[{id:'stepA',step:1,amountMinor:2400}]});
  await ledger.assignLocalContractSeller({
   contractId:'contractA',merchantId:'tenantA',sellerProfileId:'profileA'
  });
  host=createPrivateOidcMarketplaceHost(options);
  const activate=async()=>{
   await host.operator.stagePublicKeys({jwks:{keys:[publicKey]},
    expectedRevision:0,validUntilMs:now+600000});
   await host.operator.activatePublicKeys({expectedRevision:0});
  };
  const bind=async()=>{
   for(const [subject,actorId,merchantId] of [
    ['ext-buyer','buyerA','tenantA'],['ext-seller','sellerA','tenantA'],
    ['ext-reviewer','reviewerA','tenantA']
   ])await host.operator.provisionIdentity({subject,actorId,merchantId});
  };
  async function login(subject){
   const res=await host.handle(http('/api/auth/oidc/start',{method:'POST'}));
   assert.equal(res.status,303);
   const u=new URL(res.headers.get('location'));
   assert.equal(u.origin,issuer);
   const cookie=res.headers.getSetCookie()[0].split(';')[0];
   const code='SYNTH_CODE_'+subject.replace(/[^a-z]/g,'').toUpperCase()+'_0123456789';
   codes.set(code,subject);
   const query='?code='+encodeURIComponent(code)+'&state='+u.searchParams.get('state');
   const done=await host.handle(http('/api/auth/oidc/callback'+query,{cookie}));
   const body=await read(done,200);
   assert.equal(body.authenticated,true);
   const cookies=done.headers.getSetCookie();
   assert.equal(cookies.length,2);
   return {cookie:cookies[0].split(';')[0],csrf:body.csrfToken,callback:done,
    callbackRequest:()=>http('/api/auth/oidc/callback'+query,{cookie})};
  }
  await fn({host,activate,bind,login,ledger,calls:()=>calls,
   registerCode:(code,subject)=>codes.set(code,subject),
   denyOperator:()=>{operatorApproved=false},options});
 }finally{host?.close();ledger.close();rmSync(dir,{recursive:true,force:true})}
};
test('factory is private, no trust means no login redirect, code exchange or registration',fixture(
 async({host,calls})=>{
  assert.equal(host.publicListenerEnabled,false);
  assert.equal(host.paymentAuthorized,false);
  assert.equal(host.inspectReadiness().configurationConsistent,false);
  assert.ok(host.inspectReadiness().issues.includes('OIDC_PINNED_JWKS_NOT_ACTIVE'));
  await read(await host.handle(http('/api/auth/oidc/start',{method:'POST'})),503);
  await read(await host.handle(http('/api/auth/oidc/callback?code=INVALID&state=INVALID')),503);
  await read(await host.handle(http('/api/auth/oidc/register',{method:'POST'})),404);
  assert.equal(calls(),0);
 }));
test('operator activates actual SQLite trust and pre-provisions local binding before login',fixture(
 async({host,activate,bind,login,calls,registerCode})=>{
  await activate();
  const partial=host.inspectReadiness();
  assert.equal(partial.configurationConsistent,false);
  assert.deepEqual(partial.issues,['OIDC_PRIVATE_CLIENT_CREDENTIAL_UNAVAILABLE']);
  assert.equal(host.inspectReadiness({clientSecretPresent:true}).configurationConsistent,true);
  assert.equal(host.inspectReadiness({clientSecretPresent:true}).productionReady,false);
  const unbound=await host.handle(http('/api/auth/oidc/start',{method:'POST'}));
  const u=new URL(unbound.headers.get('location'));
  const cookie=unbound.headers.getSetCookie()[0].split(';')[0];
  const code='NOT_BOUND_IDP_SUBJECT_12345678';
  registerCode(code,'ext-unbound');
  // One-shot token exchange succeeds but subject is not an enrolled member.
  const denied=await host.handle(http('/api/auth/oidc/callback?state='+
   u.searchParams.get('state')+'&code='+code,{cookie}));
  await read(denied,401);
  assert.equal(calls(),1);
  await bind();
  const buyer=await login('ext-buyer');
  assert.equal(calls(),2);
  const session=await read(await host.handle(http('/api/auth/oidc/session',
   {cookie:buyer.cookie})),200);
  assert.equal(session.identity.actorId,'buyerA');
  assert.equal(session.identity.merchantId,'tenantA');
  assert.equal(session.identity.role,'buyer');
  assert.equal(JSON.stringify(session).includes('FORGED_ADMIN'),false);
 }));
test('composed buyer/seller/reviewer signed login -> deliver -> independent review; zero payment',fixture(
 async({host,activate,bind,login,ledger,calls})=>{
  await activate();await bind();
  const buyer=await login('ext-buyer');
  const seller=await login('ext-seller');
  const reviewer=await login('ext-reviewer');
  assert.equal((await read(await host.handle(http('/api/marketplace/quotes/projectA',
   {cookie:buyer.cookie})),200)).quote.id,'projectA');
  await read(await host.handle(http('/api/marketplace/quotes/projectA',
   {cookie:seller.cookie})),403);
  await read(await host.handle(http('/api/marketplace/contracts/contractA/milestones/stepA/submit',{
   method:'POST',cookie:seller.cookie,csrf:seller.csrf,
   body:{eventId:'seller-assembled-host-1',expectedVersion:1,
    expectedState:'PENDING',detail:'Delivered source files'}
  })),200);
  const res=await read(await host.handle(http('/api/marketplace/contracts/contractA/milestones/stepA/accept',{
   method:'POST',cookie:reviewer.cookie,csrf:reviewer.csrf,
   body:{eventId:'reviewer-assembled-host-1',expectedVersion:2}
  })),200);
  assert.equal(res.transition.state,'ACCEPTED');
  assert.equal((await ledger.getContract({contractId:'contractA',
   actorId:'buyerA',merchantId:'tenantA'})).paymentState,'NOT_CAPTURED');
  assert.equal((await ledger.listAttempts('projectA')).length,0);
  assert.equal(calls(),3);
  await read(await host.handle(http('/api/paypal/orders',{method:'POST'})),404);
 }));
test('single-use browser callback and suspended local member block replay and old session',fixture(
 async({host,activate,bind,login,ledger,calls})=>{
  await activate();await bind();
  const buyer=await login('ext-buyer');
  await read(await host.handle(buyer.callbackRequest()),401);
  assert.equal(calls(),1);
  await ledger.setLocalMemberActive({actorId:'buyerA',expectedRevision:1,active:false});
  await read(await host.handle(http('/api/auth/oidc/session',
   {cookie:buyer.cookie})),401);
  await read(await host.handle(http('/api/marketplace/quotes/projectA',
   {cookie:buyer.cookie})),401);
 }));
test('trust revocation blocks new OIDC starts and callbacks even with valid signed fixture',fixture(
 async({host,activate,bind,login,calls})=>{
  await activate();await bind();
  const buyer=await login('ext-buyer');
  await host.operator.revokePublicKeys({expectedRevision:1});
  assert.equal(host.inspectReadiness().issues.includes('OIDC_PINNED_JWKS_NOT_ACTIVE'),true);
  await read(await host.handle(http('/api/auth/oidc/start',{method:'POST'})),503);
  assert.equal(calls(),1);
  await read(await host.handle(http('/api/auth/oidc/session',
   {cookie:buyer.cookie})),200);
 }));
test('operator denial, bad host config and path collisions fail closed without network',fixture(
 async({host,options,denyOperator,calls})=>{
  denyOperator();
  await assert.rejects(host.operator.provisionIdentity({
   subject:'x',actorId:'buyerA',merchantId:'tenantA'
  }),e=>e.code==='OIDC_BINDING_OPERATOR_NOT_AUTHORIZED');
  await assert.rejects(host.operator.stagePublicKeys({
   jwks:{keys:[publicKey]},expectedRevision:0,validUntilMs:now+600000
  }),e=>e.code==='OIDC_JWKS_OPERATOR_NOT_AUTHORIZED');
  assert.throws(()=>createPrivateOidcMarketplaceHost({
   ...options,files:{...options.files,sessions:options.files.challenge}
  }),e=>e.code==='PRIVATE_OIDC_HOST_STORAGE_COLLISION');
  assert.throws(()=>createPrivateOidcMarketplaceHost({
   ...options,authorizationEndpoint:'https://evil.example.net/oauth/authorize'
  }),e=>e.code==='PRIVATE_OIDC_HOST_CONFIGURATION_REJECTED');
  assert.equal(calls(),0);
 }));
test('close tears down host-owned connections, while caller ledger is not closed',fixture(
 async({host,ledger})=>{
  host.close();host.close();
  await assert.rejects(host.handle(http('/api/auth/oidc/start',{method:'POST'})),
   e=>e.code==='PRIVATE_OIDC_HOST_CLOSED');
  assert.throws(()=>host.inspectReadiness(),e=>e.code==='PRIVATE_OIDC_HOST_CLOSED');
  assert.equal((await ledger.getLocalMember('buyerA')).active,true);
 }));
