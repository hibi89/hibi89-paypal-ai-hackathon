import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createOidcLoginChallengeStore} from '../src/oidc_login_challenge_store.mjs';
import {createPinnedOidcIdTokenVerifier} from '../src/pinned_oidc_id_token_verifier.mjs';
import {createHostVerifiedSessionStore} from '../src/host_verified_session_store.mjs';
import {createOidcCodeExchangeTransport,createOidcHostLoginFlow}
 from '../src/oidc_authorization_code_flow.mjs';

const origin='https://proofline.example.com';
const issuer='https://accounts.example.org';
const startUri=origin+'/api/auth/oidc/start';
const redirectUri=origin+'/api/auth/oidc/callback';
const authorize='https://accounts.example.org/oauth2/v1/authorize';
const tokenEndpoint='https://accounts.example.org/oauth2/v1/token';
const clientId='proofline-test-client';
const secret='FAKE_OFFLINE_ONLY_CLIENT_SECRET_DO_NOT_USE';
const now=1761987600000;
const credentials={buyer:{actorId:'buyerA',merchantId:'tenantA'},
 seller:{actorId:'sellerA',merchantId:'tenantA'}};
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'TEST-ONLY-OIDC',alg:'RS256',use:'sig'};
function signed({nonce,subject='buyer',iss=issuer,aud=clientId,
  privateSigningKey=privateKey}){
 const h=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT',kid:jwk.kid})).toString('base64url');
 const payload=Buffer.from(JSON.stringify({iss,aud,sub:subject,nonce,
  iat:Math.floor(now/1000)-2,auth_time:Math.floor(now/1000)-2,
  exp:Math.floor(now/1000)+180})).toString('base64url');
 const signature=sign('RSA-SHA256',Buffer.from(h+'.'+payload),privateSigningKey).toString('base64url');
 return h+'.'+payload+'.'+signature;
}
const failed=async(action,code)=>assert.rejects(action,e=>e.code===code);
const startRequest=()=>new Request(startUri,{
 method:'POST',headers:{origin}
});
const callback=(session,{cookie=session.setCookie.split(';')[0],
  code='OFFLINE_CODE_BUYER_00001',state=new URL(session.authorizationUrl)
    .searchParams.get('state'),more=''}={})=>
 new Request(redirectUri+'?state='+encodeURIComponent(state)+
  '&code='+encodeURIComponent(code)+more,{headers:{cookie}});
const fixture=fn=>async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ppl-oidc-flow-'));
 const challengeStore=createOidcLoginChallengeStore({
  filename:join(dir,'challenge.sqlite'),secretKey:randomBytes(32),
  issuer,clientId,startUri,redirectUri,now:()=>now
 });
 let membership={actorId:'buyerA',merchantId:'tenantA',role:'buyer',
  active:true,revision:1};
 const verifier=createPinnedOidcIdTokenVerifier({
  issuer,audience:clientId,jwks:{keys:[jwk]},now:()=>now
 });
 const sessionStore=createHostVerifiedSessionStore({
  filename:join(dir,'sessions.sqlite'),
  expectedOrigin:origin,trustedIssuer:issuer,trustedAudience:clientId,
  verifyExternalIdentity:verifier.verifyExternalIdentity,
  lookupExternalAccount:async({issuer:source,subject})=>
   source===issuer?credentials[subject]??null:null,
  getMembership:async actor=>actor==='buyerA'?membership:null,now:()=>now
 });
 let calls=0,submitted=[];
 const exchange=(handler,enabled=true)=>createOidcCodeExchangeTransport({
  tokenEndpoint,clientId,clientSecret:secret,networkApproved:enabled,
  fetchImpl:async(url,options)=>{
   calls++;submitted.push({url,options});
   return handler(url,options);
  }
 });
 const makeFlow=transport=>createOidcHostLoginFlow({
  challengeStore,identityVerifier:verifier,sessionStore,
  codeTransport:transport,authorizationEndpoint:authorize,clientId
 });
 try{await fn({dir,challengeStore,sessionStore,verifier,
  exchange,makeFlow,getCalls:()=>calls,getRequests:()=>submitted,
  setMembership:x=>membership=x});}
 finally{challengeStore.close();sessionStore.close();rmSync(dir,{
  recursive:true,force:true
 })}
};

test('requires pinned HTTPS endpoints, explicit transport and trusted components',()=>{
 for(const uri of ['http://accounts.example.org/token',
  'https://localhost/token','https://127.0.0.1/token',
  'https://accounts.example.org/token?code=evil',
  'https://accounts.example.org:444/token']){
  assert.throws(()=>createOidcCodeExchangeTransport({
   tokenEndpoint:uri,clientId,clientSecret:secret,fetchImpl:async()=>null
  }),e=>e.code==='OIDC_EXCHANGE_PINNED_HTTPS_REQUIRED');
 }
 assert.throws(()=>createOidcCodeExchangeTransport({
  tokenEndpoint,clientId,clientSecret:'short',fetchImpl:async()=>null
 }),e=>e.code==='OIDC_EXCHANGE_PRIVATE_CLIENT_REQUIRED');
 assert.throws(()=>createOidcHostLoginFlow({
  authorizationEndpoint:authorize,clientId
 }),e=>e.code==='OIDC_FLOW_TRUSTED_COMPONENTS_REQUIRED');
});

test('default transport performs zero requests even with valid-looking ticket',
 fixture(async({exchange,getCalls})=>{
  const transport=exchange(()=>{throw Error('never reached')},false);
  assert.equal(transport.networkEnabled,false);
  await failed(transport.exchange({code:'OFFLINE_CODE_123456',
   codeVerifier:'A'.repeat(43),expectedNonce:'B'.repeat(43),
   clientId,redirectUri}), 'OIDC_EXCHANGE_NETWORK_NOT_APPROVED');
  assert.equal(getCalls(),0);
 }));

test('host-only authorization start emits exact OIDC code flow and sets Lax cookie, no server keys',
 fixture(async({makeFlow,exchange,getCalls})=>{
  const flow=makeFlow(exchange(async()=>new Response('{}')));
  const initiated=flow.start(startRequest());
  const u=new URL(initiated.authorizationUrl);
  assert.equal(u.origin,'https://accounts.example.org');
  assert.equal(u.pathname,'/oauth2/v1/authorize');
  assert.deepEqual([...u.searchParams.keys()].sort(),[
   'client_id','code_challenge','code_challenge_method','nonce',
   'redirect_uri','response_type','scope','state'
  ]);
  assert.equal(u.searchParams.get('response_type'),'code');
  assert.equal(u.searchParams.get('client_id'),clientId);
  assert.equal(u.searchParams.get('scope'),'openid');
  assert.equal(u.searchParams.get('redirect_uri'),redirectUri);
  assert.equal(u.searchParams.get('code_challenge_method'),'S256');
  assert.match(u.searchParams.get('state'),/^[A-Za-z0-9_-]{43}$/);
  assert.match(u.searchParams.get('nonce'),/^[A-Za-z0-9_-]{43}$/);
  assert.match(initiated.setCookie,/__Host-proofline_oidc=.*SameSite=Lax/);
  assert.equal(initiated.paymentAuthorized,false);
  assert.equal(flow.publicListenerEnabled,false);
  assert.equal(getCalls(),0);
 }));

test('real in-memory IdP token response + signed JWT creates persistent buyer host session',
 fixture(async({makeFlow,exchange,sessionStore,dir,getCalls,getRequests})=>{
  let initiated,auth;
  const flow=makeFlow(exchange(async(url,opts)=>{
   assert.equal(url,tokenEndpoint);
   assert.equal(opts.method,'POST');
   assert.equal(opts.redirect,'error');
   assert.equal(opts.credentials,'omit');
   assert.equal(opts.cache,'no-store');
   assert.equal(opts.referrerPolicy,'no-referrer');
   const body=new URLSearchParams(opts.body);
   assert.deepEqual([...body.keys()].sort(),
    ['code','code_verifier','grant_type','redirect_uri']);
   assert.equal(body.get('grant_type'),'authorization_code');
   assert.equal(body.get('redirect_uri'),redirectUri);
   assert.equal(body.get('code'),'OFFLINE_CODE_BUYER_00001');
   assert.equal(createHash('sha256').update(body.get('code_verifier'))
    .digest('base64url'),
    new URL(initiated.authorizationUrl).searchParams.get('code_challenge'));
   assert.equal(opts.headers.authorization,
    'Basic '+Buffer.from(encodeURIComponent(clientId)+':'+
     encodeURIComponent(secret)).toString('base64'));
   auth=signed({nonce:new URL(initiated.authorizationUrl)
    .searchParams.get('nonce')});
   return new Response(JSON.stringify({
    token_type:'Bearer',id_token:auth,access_token:'ACCESS_SECRET_NEVER_EXPOSE',
    refresh_token:'REFRESH_SECRET_NEVER_EXPOSE'
   }),{status:200,headers:{'content-type':'application/json'}});
  }));
  initiated=flow.start(startRequest());
  const result=await flow.complete(callback(initiated));
  assert.equal(result.roleSessionReady,true);
  assert.equal(result.merchantOwnershipVerified,false);
  assert.equal(result.paymentAuthorized,false);
  assert.ok(result.setCookie.startsWith('__Host-proofline_session='));
  assert.ok(result.clearLoginCookie.startsWith('__Host-proofline_oidc='));
  assert.match(result.csrfToken,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(JSON.stringify(result).includes('ACCESS_SECRET'),false);
  assert.equal(JSON.stringify(result).includes('REFRESH_SECRET'),false);
  assert.equal(JSON.stringify(result).includes(auth),false);
  const req=new Request(origin+'/api/marketplace/quotes/any',{
   headers:{cookie:result.setCookie.split(';')[0]}
  });
  assert.deepEqual((await sessionStore.resolveForGateway(req)).actorId,'buyerA');
  assert.equal(getCalls(),1);
  assert.equal(getRequests().length,1);
  const disk=readFileSync(join(dir,'sessions.sqlite')).toString('utf8');
  assert.equal(disk.includes(auth),false);
  assert.equal(disk.includes('ACCESS_SECRET'),false);
  await failed(flow.complete(callback(initiated)),
   'OIDC_CHALLENGE_UNAVAILABLE_OR_REPLAYED');
  assert.equal(getCalls(),1);
 }));

test('callback from another browser or malformed state blocks outbound token exchange',
 fixture(async({exchange,makeFlow,getCalls})=>{
  const flow=makeFlow(exchange(async()=>{throw Error('should never send')}));
  const initiated=flow.start(startRequest());
  await failed(flow.complete(callback(initiated,{cookie:'__Host-proofline_oidc='+
   'z'.repeat(43)})),'OIDC_CHALLENGE_UNAVAILABLE_OR_REPLAYED');
  await failed(flow.complete(callback(initiated,{more:'&state=evil'})),
   'OIDC_CALLBACK_PARAMETERS_REJECTED');
  assert.equal(getCalls(),0);
 }));

test('failed endpoint response never retries spent authorization code or establishes session',
 fixture(async({makeFlow,exchange,getCalls,sessionStore})=>{
  const flow=makeFlow(exchange(async()=>new Response(
   JSON.stringify({error:'invalid_grant'}),{status:400,
    headers:{'content-type':'application/json'}
   })));
  const issued=flow.start(startRequest());
  await failed(flow.complete(callback(issued)),
   'OIDC_EXCHANGE_RESPONSE_REJECTED');
  await failed(flow.complete(callback(issued)),
   'OIDC_CHALLENGE_UNAVAILABLE_OR_REPLAYED');
  assert.equal(getCalls(),1);
  assert.equal(await sessionStore.resolveForGateway(new Request(
   origin+'/api/marketplace/quotes/any')),null);
 }));

test('invalid/malformed/oversized token responses are denied without session',
 fixture(async({makeFlow,exchange})=>{
  for(const item of [
   new Response('not-json',{status:200,headers:{'content-type':'application/json'}}),
   new Response('{}',{status:200,headers:{'content-type':'text/plain'}}),
   new Response(JSON.stringify({token_type:'Bearer'}),{
    status:200,headers:{'content-type':'application/json'}}),
   new Response(JSON.stringify({id_token:'a.b.c',token_type:'mac'}),{
    status:200,headers:{'content-type':'application/json'}}),
   new Response('x'.repeat(18000),{status:200,headers:{
    'content-type':'application/json','content-length':'18000'}})
  ]){
   const flow=makeFlow(exchange(async()=>item));
   const issued=flow.start(startRequest());
   await assert.rejects(flow.complete(callback(issued)),e=>
    ['OIDC_EXCHANGE_RESPONSE_REJECTED','OIDC_EXCHANGE_ID_TOKEN_MISSING'].includes(e.code));
  }
 }));

test('foreign issuer, invalid token signature or nonce mismatch deny login after one exchange',
 fixture(async({makeFlow,exchange,sessionStore,getCalls})=>{
  const other=generateKeyPairSync('rsa',{modulusLength:2048});
  for(const mode of ['nonce','signature','issuer']){
   let initiated;
   const flow=makeFlow(exchange(async()=>{
    const expected=new URL(initiated.authorizationUrl).searchParams.get('nonce');
    const fake=signed({
     nonce:mode==='nonce'?'FORGED_NONCE_012345678901234567890':expected,
     ...(mode==='signature'?{privateSigningKey:other.privateKey}:{}),
     ...(mode==='issuer'?{iss:'https://evil.example.org'}:{})
    });
    return new Response(JSON.stringify({token_type:'Bearer',id_token:fake}),{
     status:200,headers:{'content-type':'application/json'}
    });
   }));
   initiated=flow.start(startRequest());
   await failed(flow.complete(callback(initiated)),'OIDC_ID_TOKEN_UNVERIFIED');
   await failed(flow.complete(callback(initiated)),
    'OIDC_CHALLENGE_UNAVAILABLE_OR_REPLAYED');
  }
  assert.equal(getCalls(),3);
  assert.equal(await sessionStore.resolveForGateway(new Request(
   origin+'/api/marketplace/quotes/any')),null);
 }));

test('parallel callbacks for one state result in only one token exchange and one minted session',
 fixture(async({makeFlow,exchange,getCalls})=>{
  let issued;
  const flow=makeFlow(exchange(async()=>{
   const nonce=new URL(issued.authorizationUrl).searchParams.get('nonce');
   return new Response(JSON.stringify({token_type:'Bearer',
    id_token:signed({nonce})}),{
     headers:{'content-type':'application/json'}
    });
  }));
  issued=flow.start(startRequest());
  const attempts=await Promise.allSettled([
   flow.complete(callback(issued)),flow.complete(callback(issued))
  ]);
  assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(attempts.filter(x=>x.status==='rejected'&&
   x.reason?.code==='OIDC_CHALLENGE_UNAVAILABLE_OR_REPLAYED').length,1);
  assert.equal(getCalls(),1);
 }));
