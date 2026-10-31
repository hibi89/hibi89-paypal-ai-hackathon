import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,generateKeyPairSync,sign} from 'node:crypto';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createOidcLoginChallengeStore} from '../src/oidc_login_challenge_store.mjs';
import {createPinnedOidcIdTokenVerifier} from '../src/pinned_oidc_id_token_verifier.mjs';
import {createHostVerifiedSessionStore} from '../src/host_verified_session_store.mjs';
import {createOidcCodeExchangeTransport,createOidcHostLoginFlow}
 from '../src/oidc_authorization_code_flow.mjs';
import {createMarketplaceHttpsRequestAdapter}
 from '../src/marketplace_https_request_adapter.mjs';

const origin='https://proofline.example.com';
const issuer='https://accounts.example.org';
const clientId='proofline-offline-client';
const startPath='/api/auth/oidc/start';
const callbackPath='/api/auth/oidc/callback';
const now=1761987600000;
const accounts={
 buyer:{actorId:'buyerA',merchantId:'tenantA'},
 seller:{actorId:'sellerA',merchantId:'tenantA'},
 reviewer:{actorId:'reviewerA',merchantId:'tenantA'}
};
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'FAKE-TEST-KEY-1',alg:'RS256',use:'sig'};
function jwt(nonce,subject){
 const h=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT',kid:jwk.kid})).toString('base64url');
 const p=Buffer.from(JSON.stringify({iss:issuer,aud:clientId,sub:subject,nonce,
  iat:Math.floor(now/1000)-2,auth_time:Math.floor(now/1000)-2,
  exp:Math.floor(now/1000)+180})).toString('base64url');
 return h+'.'+p+'.'+sign('RSA-SHA256',Buffer.from(h+'.'+p),privateKey).toString('base64url');
}
const http=(path,{method='GET',cookie,csrf,body,headers={}}={})=>
 new Request(origin+path,{
  method,headers:{
   ...(cookie?{cookie}:{}),
   ...(method==='POST'?{origin}:{}),
   ...(csrf?{'x-csrf-token':csrf}:{}),
   ...(body?{'content-type':'application/json'}:{}),
   ...headers
  },
  ...(body?{body:JSON.stringify(body)}:{})
 });
const check=async(res,status)=>{
 const payload=await res.clone().json();
 assert.equal(res.status,status,JSON.stringify(payload));
 assert.equal(res.headers.get('cache-control'),'private, no-store, max-age=0');
 assert.equal(res.headers.get('referrer-policy'),'no-referrer');
 assert.equal(res.headers.get('vary'),'Cookie');
 assert.notEqual(payload.paymentAuthorized,true);
 return payload;
};
const fixture=fn=>async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ppl-https-host-'));
 const ledger=createSqliteLedger({filename:join(dir,'ledger.sqlite'),enforceLocalMemberWrites:true});
 const challenge=createOidcLoginChallengeStore({
  filename:join(dir,'challenge.sqlite'),secretKey:randomBytes(32),
  issuer,clientId,startUri:origin+startPath,
  redirectUri:origin+callbackPath,now:()=>now
 });
 let session,ids,host;
 const challengeByCode=new Map();
 let networkCalls=0;
 try{
  await ledger.insertQuote({id:'projectA',ownerId:'buyerA',merchantId:'tenantA'});
  await ledger.insertQuote({id:'projectB',ownerId:'buyerB',merchantId:'tenantB'});
  for(const account of [
   {...accounts.buyer,role:'buyer'},
   {...accounts.seller,role:'seller',sellerProfileId:'profileA'},
   {...accounts.reviewer,role:'reviewer'},
   {actorId:'buyerB',merchantId:'tenantB',role:'buyer'}])
   await ledger.provisionLocalMember(account);
  await ledger.approve({id:'projectA',actorId:'buyerA',expectedVersion:1,amountMinor:2400});
  await ledger.createContract({id:'contractA',quoteId:'projectA',actorId:'buyerA',
   merchantId:'tenantA',reviewerId:'reviewerA',expectedVersion:1,
   eventId:'create-contract',milestones:[{id:'stepA',step:1,amountMinor:2400}]});
  await ledger.assignLocalContractSeller({
   contractId:'contractA',merchantId:'tenantA',sellerProfileId:'profileA'
  });
  ids=createPinnedOidcIdTokenVerifier({
   issuer,audience:clientId,jwks:{keys:[jwk]},now:()=>now
  });
  session=createHostVerifiedSessionStore({
   filename:join(dir,'sessions.sqlite'),
   expectedOrigin:origin,trustedIssuer:issuer,trustedAudience:clientId,
   verifyExternalIdentity:ids.verifyExternalIdentity,
   lookupExternalAccount:async ({issuer:source,subject})=>
    source===issuer?accounts[subject]??null:null,
   getMembership:actor=>ledger.getLocalMember(actor),now:()=>now
  });
  const transport=createOidcCodeExchangeTransport({
   tokenEndpoint:issuer+'/oauth2/token',clientId,
   clientSecret:'FAKE_OFFLINE_ONLY_TEST_SECRET_123456',
   networkApproved:true,
   fetchImpl:async(_url,opts)=>{
    networkCalls++;
    const body=new URLSearchParams(opts.body);
    const auth=challengeByCode.get(body.get('code'));
    if(!auth)return new Response(JSON.stringify({error:'invalid_grant'}),{
     status:400,headers:{'content-type':'application/json'}
    });
    return new Response(JSON.stringify({
     token_type:'Bearer',id_token:jwt(auth.nonce,auth.subject),
     access_token:'FAKE_ACCESS_NEVER_RETURNED',
     refresh_token:'FAKE_REFRESH_NEVER_RETURNED'
    }),{headers:{'content-type':'application/json'}});
   }
  });
  const flow=createOidcHostLoginFlow({
   challengeStore:challenge,identityVerifier:ids,sessionStore:session,
   codeTransport:transport,
   authorizationEndpoint:issuer+'/oauth2/authorize',clientId
  });
  host=createMarketplaceHttpsRequestAdapter({
   expectedOrigin:origin,ledger,loginFlow:flow,sessionStore:session
  });
  async function login(subject){
   const begun=await host.handle(http(startPath,{method:'POST'}));
   assert.equal(begun.status,303);
   assert.equal(await begun.text(),'');
   const url=new URL(begun.headers.get('location'));
   assert.equal(url.origin,issuer);
   const code='MOCK_CODE_'+subject.toUpperCase()+'_123456789';
   challengeByCode.set(code,{nonce:url.searchParams.get('nonce'),subject});
   const beginCookie=begun.headers.getSetCookie()[0].split(';')[0];
   const callback=await host.handle(http(callbackPath+'?state='+
    url.searchParams.get('state')+'&code='+code,{cookie:beginCookie}));
   const data=await check(callback,200);
   assert.equal(data.authenticated,true);
   const responseCookies=callback.headers.getSetCookie();
   assert.equal(responseCookies.length,2);
   assert.match(responseCookies[1],/^__Host-proofline_oidc=;/);
   assert.equal(callback.headers.get('location'),null);
   return {cookie:responseCookies[0].split(';')[0],
    csrf:data.csrfToken,callback,begin:begun,url,beginCookie,code};
  }
  await fn({host,ledger,session,login,challengeByCode,
   calls:()=>networkCalls});
 }finally{session?.close();challenge.close();ledger.close();
  rmSync(dir,{recursive:true,force:true})}
};

test('HTTPS adapter requires separately trusted flow, role ledger, and strict origin',()=>{
 assert.throws(()=>createMarketplaceHttpsRequestAdapter({}),
  e=>e.code==='HTTPS_HOST_ORIGIN_REQUIRED');
 for(const bad of ['http://proofline.example.com',
  'https://localhost','https://127.0.0.1',
  'https://proofline.example.com:8443']){
  assert.throws(()=>createMarketplaceHttpsRequestAdapter({
   expectedOrigin:bad
  }),e=>e.code==='HTTPS_HOST_ORIGIN_REQUIRED');
 }
 assert.throws(()=>createMarketplaceHttpsRequestAdapter({
  expectedOrigin:origin
 }),e=>e.code==='HTTPS_HOST_VERIFIED_FLOW_AND_SESSION_REQUIRED');
});

test('real HTTP-shaped buyer/seller/reviewer signed login and marketplace lifecycle, no payment calls',
 fixture(async({host,ledger,login,calls})=>{
  assert.equal(host.publicListenerEnabled,false);
  const buyer=await login('buyer');
  const seller=await login('seller');
  const reviewer=await login('reviewer');
  assert.equal(calls(),3);
  const sessionData=await check(await host.handle(http(
   '/api/auth/oidc/session',{cookie:buyer.cookie})),200);
  assert.deepEqual(sessionData.identity,{
   actorId:'buyerA',merchantId:'tenantA',role:'buyer',membershipRevision:1
  });
  const buyerQuote=await check(await host.handle(http(
   '/api/marketplace/quotes/projectA',{cookie:buyer.cookie})),200);
  assert.equal(buyerQuote.quote.id,'projectA');
  await check(await host.handle(http(
   '/api/marketplace/quotes/projectA',{cookie:seller.cookie})),403);
  await check(await host.handle(http(
   '/api/marketplace/contracts/contractA',{cookie:seller.cookie})),200);
  const deliver='/api/marketplace/contracts/contractA/milestones/stepA/submit';
  const result=await check(await host.handle(http(deliver,{
   method:'POST',cookie:seller.cookie,csrf:seller.csrf,
   body:{eventId:'seller-verified-host',expectedVersion:1,
    expectedState:'PENDING',detail:'Delivered source code and QA evidence'}
  })),200);
  assert.equal(result.transition.state,'SUBMITTED');
  const accepted=await check(await host.handle(http(
   '/api/marketplace/contracts/contractA/milestones/stepA/accept',{
    method:'POST',cookie:reviewer.cookie,csrf:reviewer.csrf,
    body:{eventId:'reviewer-verified-host',expectedVersion:2}
   })),200);
  assert.equal(accepted.transition.state,'ACCEPTED');
  assert.equal((await ledger.getContract({contractId:'contractA',
   actorId:'buyerA',merchantId:'tenantA'})).paymentState,'NOT_CAPTURED');
  assert.equal((await ledger.listAttempts('projectA')).length,0);
  assert.equal(calls(),3);
 }));

test('session reload rotates CSRF; stale CSRF denied and fresh CSRF permits write',
 fixture(async({host,login})=>{
  const seller=await login('seller');
  const rotated=await check(await host.handle(http(
   '/api/auth/oidc/csrf',{method:'POST',cookie:seller.cookie})),200);
  assert.notEqual(rotated.csrfToken,seller.csrf);
  const url='/api/marketplace/contracts/contractA/milestones/stepA/submit';
  const body={eventId:'seller-rotate-test',expectedVersion:1,
   expectedState:'PENDING',detail:'Delivered source code and QA evidence'};
  const old=await host.handle(http(url,{
   method:'POST',cookie:seller.cookie,csrf:seller.csrf,body
  }));
  assert.ok([401,403].includes(old.status),await old.text());
  const good=await check(await host.handle(http(url,{
   method:'POST',cookie:seller.cookie,csrf:rotated.csrfToken,body
  })),200);
  assert.equal(good.transition.state,'SUBMITTED');
 }));

test('logout requires Origin + original CSRF and revokes both session and role access',
 fixture(async({host,login})=>{
  const buyer=await login('buyer');
  const logout='/api/auth/oidc/logout';
  await check(await host.handle(http(logout,{
   method:'POST',cookie:buyer.cookie,csrf:'B'.repeat(43)})),403);
  await check(await host.handle(http(logout,{
   method:'POST',cookie:buyer.cookie,csrf:buyer.csrf,
   headers:{origin:'https://evil.example.net'}})),403);
  await check(await host.handle(http('/api/marketplace/quotes/projectA',{
   cookie:buyer.cookie})),200);
  const ended=await host.handle(http(logout,{
   method:'POST',cookie:buyer.cookie,csrf:buyer.csrf}));
  const data=await check(ended,200);
  assert.equal(data.revoked,true);
  assert.match(ended.headers.getSetCookie()[0],/Max-Age=0$/);
  await check(await host.handle(http('/api/auth/oidc/session',{
   cookie:buyer.cookie})),401);
  await check(await host.handle(http('/api/marketplace/quotes/projectA',{
   cookie:buyer.cookie})),401);
 }));

test('cross-origin, arbitrary routes, provider/payment actions and forged actor headers fail closed',
 fixture(async({host,login,calls})=>{
  const buyer=await login('buyer');
  for(const route of [
   '/api/paypal/orders','/api/marketplace/orders',
   '/api/marketplace/contracts/contractA/milestones/stepA/capture',
   '/api/auth/oidc/register',
   '/api/auth/oidc/session?actorId=sellerA'
  ])await check(await host.handle(http(route,{cookie:buyer.cookie})),404);
  await check(await host.handle(new Request(
   'https://evil.example.net/api/auth/oidc/session',{
    headers:{cookie:buyer.cookie}
   })),404);
  const forged=await check(await host.handle(http(
   '/api/marketplace/quotes/projectA',{
    cookie:buyer.cookie,
    headers:{'x-actor-id':'sellerA','x-merchant-id':'tenantB'}
   })),200);
  assert.equal(forged.quote.id,'projectA');
  const noOrigin=await check(await host.handle(http(
   '/api/auth/oidc/csrf',{method:'POST',cookie:buyer.cookie,
    headers:{origin:'https://evil.example.net'}})),403);
  assert.equal(noOrigin.error,'ORIGIN_OR_CSRF_REQUIRED');
  assert.equal(calls(),1);
 }));

test('authentication failure after one-use callback does not issue a session or repeat token POST',
 fixture(async({host,login,calls,challengeByCode})=>{
  const buyer=await login('buyer');
  const start=await host.handle(http(startPath,{method:'POST'}));
  const url=new URL(start.headers.get('location'));
  const cookie=start.headers.getSetCookie()[0].split(';')[0];
  const invalidCode='INVALID_ISSUER_CODE_987654321';
  challengeByCode.set(invalidCode,{
   nonce:'WRONG_NONCE_FOR_ID_TOKEN_123456789',subject:'buyer'
  });
  const path=callbackPath+'?state='+url.searchParams.get('state')+'&code='+invalidCode;
  const failed=await host.handle(http(path,{cookie}));
  await check(failed,401);
  assert.equal(failed.headers.getSetCookie().length,0);
  await check(await host.handle(http(path,{cookie})),401);
  assert.equal(calls(),2);
  await check(await host.handle(http('/api/auth/oidc/session',{
   cookie:buyer.cookie})),200);
 }));

test('membership revoke+reactivate makes old host cookie unusable despite later reactivation',
 fixture(async({host,ledger,login})=>{
  const seller=await login('seller');
  await ledger.setLocalMemberActive({actorId:'sellerA',expectedRevision:1,active:false});
  await check(await host.handle(http('/api/auth/oidc/session',{
   cookie:seller.cookie})),401);
  await ledger.setLocalMemberActive({actorId:'sellerA',expectedRevision:2,active:true});
  await check(await host.handle(http('/api/marketplace/contracts/contractA',{
   cookie:seller.cookie})),401);
  const fresh=await login('seller');
  await check(await host.handle(http('/api/marketplace/contracts/contractA',{
   cookie:fresh.cookie})),200);
 }));
