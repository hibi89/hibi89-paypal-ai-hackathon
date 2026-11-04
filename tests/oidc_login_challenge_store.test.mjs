import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createOidcLoginChallengeStore}
 from '../src/oidc_login_challenge_store.mjs';
import {createPinnedOidcIdTokenVerifier}
 from '../src/pinned_oidc_id_token_verifier.mjs';
import {createHostVerifiedSessionStore}
 from '../src/host_verified_session_store.mjs';

const origin='https://proofline.example.com';
const start=origin+'/api/auth/oidc/start';
const redirect=origin+'/api/auth/oidc/callback';
const issuer='https://accounts.example.org';
const clientId='proofline-offline-client';
const clockStart=1761987600000;
const key=randomBytes(32);
const startReq=(originHeader=origin)=>new Request(start,{
 method:'POST',headers:{origin:originHeader}
});
const callback=(issued,{state=issued.state,code='SIMULATED_AUTHORIZATION_CODE_01',
  cookie=issued.setCookie.split(';')[0],other='',method='GET'}={})=>
 new Request(redirect+'?state='+encodeURIComponent(state)+
 '&code='+encodeURIComponent(code)+other,{
  method,headers:{cookie},
  ...(method==='POST'?{body:'{}'}:{})
 });
const rejects=(fn,code)=>assert.throws(fn,e=>e.code===code);
const fixture=fn=>async()=>{
 const folder=mkdtempSync(join(tmpdir(),'ppl-oidc-private-challenge-'));
 const filename=join(folder,'oidc.sqlite');
 let tick=clockStart;
 const options={filename,secretKey:key,issuer,clientId,startUri:start,
  redirectUri:redirect,now:()=>tick,ttlMs:5*60*1000};
 let store=createOidcLoginChallengeStore(options);
 try{
  await fn({
   folder,filename,options,get:()=>store,
   reopen:overrides=>{store.close();store=createOidcLoginChallengeStore({
    ...options,...overrides
   });return store;},
   advance:ms=>tick+=ms
  });
 }finally{store.close();rmSync(folder,{recursive:true,force:true})}
};

test('requires 32 byte private key, HTTPS origin and fixed trusted host endpoints',()=>{
 const base={filename:'/tmp/never-open-test.db',secretKey:key,issuer,clientId,
  startUri:start,redirectUri:redirect};
 for(const over of [
  {secretKey:randomBytes(12)},{filename:':memory:'},
  {startUri:'http://proofline.example.com/api/auth/oidc/start'},
  {startUri:'https://evil.example.net/api/auth/oidc/start'},
  {redirectUri:origin+'/api/login/callback'},
  {redirectUri:'https://proofline.example.com/api/auth/oidc/callback?anything=1'}
 ])assert.throws(()=>createOidcLoginChallengeStore({...base,...over}));
});

test('same-origin POST creates non-guessable state, nonce and PKCE S256; secrets encrypted on disk',
 fixture(async({get,folder})=>{
  const store=get();
  rejects(()=>store.begin(new Request(start)), 'OIDC_START_ORIGIN_REQUIRED');
  rejects(()=>store.begin(startReq('https://attacker.example')), 'OIDC_START_ORIGIN_REQUIRED');
  const issued=store.begin(startReq());
  assert.match(issued.state,/^[A-Za-z0-9_-]{43}$/);
  assert.match(issued.nonce,/^[A-Za-z0-9_-]{43}$/);
  assert.match(issued.codeChallenge,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(issued.codeChallengeMethod,'S256');
  assert.match(issued.setCookie,/^__Host-proofline_oidc=[A-Za-z0-9_-]{43}; Secure; HttpOnly; SameSite=Lax; Path=\/; Max-Age=300$/);
  assert.equal(issued.loginCompleted,false);
  assert.equal(store.externalCalls,0);
  const disk=readFileSync(join(folder,'oidc.sqlite'),'utf8');
  assert.equal(disk.includes(issued.state),false);
  assert.equal(disk.includes(issued.nonce),false);
  assert.equal(disk.includes(issued.setCookie.split(';')[0].split('=')[1]),false);
  const authorized=store.consume(callback(issued));
  assert.equal(authorized.expectedNonce,issued.nonce);
  assert.equal(authorized.code,'SIMULATED_AUTHORIZATION_CODE_01');
  assert.equal(createHash('sha256').update(authorized.codeVerifier)
   .digest('base64url'),issued.codeChallenge);
  assert.equal(authorized.exchanged,false);
  assert.equal(authorized.authenticated,false);
 }));

test('one-shot callback survives restart and rejects replay from independent SQLite connections',
 fixture(async({get,reopen,options})=>{
  const issued=get().begin(startReq());
  const restart=reopen();
  const second=createOidcLoginChallengeStore(options);
  try{
   const first=second.consume(callback(issued));
   assert.equal(first.expectedNonce,issued.nonce);
   rejects(()=>restart.consume(callback(issued)),'OIDC_CHALLENGE_UNAVAILABLE_OR_REPLAYED');
   rejects(()=>second.consume(callback(issued)),'OIDC_CHALLENGE_UNAVAILABLE_OR_REPLAYED');
   assert.match(first.clearCookie,/Max-Age=0$/);
  }finally{second.close()}
 }));

test('cookie binding, wrong or duplicate states, issuer and callback path fail before consume',
 fixture(async({get})=>{
  const store=get(),issued=store.begin(startReq());
  rejects(()=>store.consume(callback(issued,{cookie:''})),
   'OIDC_CALLBACK_BINDING_REQUIRED');
  rejects(()=>store.consume(callback(issued,{cookie:'__Host-proofline_oidc='+('a'.repeat(43))})),
   'OIDC_CHALLENGE_UNAVAILABLE_OR_REPLAYED');
  rejects(()=>store.consume(callback(issued,{state:randomBytes(32).toString('base64url')})),
   'OIDC_CHALLENGE_UNAVAILABLE_OR_REPLAYED');
  rejects(()=>store.consume(callback(issued,{
   cookie:issued.setCookie.split(';')[0]+'; '+issued.setCookie.split(';')[0]
  })),'OIDC_CALLBACK_BINDING_REQUIRED');
  rejects(()=>store.consume(callback(issued,{other:'&state=forged'})),
   'OIDC_CALLBACK_PARAMETERS_REJECTED');
  rejects(()=>store.consume(callback(issued,{other:'&iss=https%3A%2F%2Fevil.example.net'})),
   'OIDC_CALLBACK_PARAMETERS_REJECTED');
  rejects(()=>store.consume(callback(issued,{other:'&error=access_denied'})),
   'OIDC_CALLBACK_PARAMETERS_REJECTED');
  rejects(()=>store.consume(callback(issued,{method:'POST'})),
   'OIDC_CALLBACK_METHOD_REQUIRED');
  const wrong=new Request(origin+'/api/auth/oidc/other?state='+issued.state+
   '&code=SIMULATED_AUTHORIZATION_CODE_01',{
    headers:{cookie:issued.setCookie.split(';')[0]}
   });
  rejects(()=>store.consume(wrong),'OIDC_CALLBACK_ROUTE_REQUIRED');
  assert.equal(store.consume(callback(issued)).expectedNonce,issued.nonce);
 }));

test('expiration and consumed flags prevent stale reuse even after time changes',
 fixture(async({get,advance})=>{
  const issued=get().begin(startReq());
  advance(5*60*1000);
  rejects(()=>get().consume(callback(issued)),'OIDC_CHALLENGE_UNAVAILABLE_OR_REPLAYED');
  advance(-30*1000);
  assert.equal(get().consume(callback(issued)).expectedNonce,issued.nonce);
  advance(-1*60*1000);
  rejects(()=>get().consume(callback(issued)),'OIDC_CHALLENGE_UNAVAILABLE_OR_REPLAYED');
 }));

test('AES-GCM wrong key and database tampering refuse callback without code verifier disclosure',
 fixture(async({get,reopen,filename})=>{
  const first=get().begin(startReq());
  const wrong=reopen({secretKey:randomBytes(32)});
  rejects(()=>wrong.consume(callback(first)),'OIDC_CHALLENGE_CORRUPTED');
  const restored=reopen();
  assert.equal(restored.consume(callback(first)).expectedNonce,first.nonce);
  const tampered=restored.begin(startReq());
  const edit=new DatabaseSync(filename);
  try{
   edit.prepare('UPDATE oidc_login_challenges SET payload_tag=? WHERE consumed_at IS NULL')
    .run(Buffer.alloc(16,0));
  }finally{edit.close()}
  rejects(()=>restored.consume(callback(tampered)),'OIDC_CHALLENGE_CORRUPTED');
 }));

test('real signed OIDC nonce consumes browser-bound PKCE and establishes persistent role session',
 fixture(async({get,folder})=>{
  const begun=get().begin(startReq()),ticket=get().consume(callback(begun));
  const pair=generateKeyPairSync('rsa',{modulusLength:2048});
  const jwk={...pair.publicKey.export({format:'jwk'}),kid:'TEST-RSA1',use:'sig',alg:'RS256'};
  const jwtHeader=Buffer.from(JSON.stringify({
   alg:'RS256',typ:'JWT',kid:jwk.kid
  })).toString('base64url');
  const nowSeconds=Math.floor(clockStart/1000);
  const payload=Buffer.from(JSON.stringify({
   iss:issuer,aud:clientId,sub:'subject-0001',nonce:ticket.expectedNonce,
   iat:nowSeconds-1,auth_time:nowSeconds-1,exp:nowSeconds+300
  })).toString('base64url');
  const sig=sign('RSA-SHA256',Buffer.from(jwtHeader+'.'+payload),pair.privateKey)
   .toString('base64url');
  const idToken=jwtHeader+'.'+payload+'.'+sig;
  const identityVerifier=createPinnedOidcIdTokenVerifier({
   issuer,audience:clientId,jwks:{keys:[jwk]},now:()=>clockStart
  });
  const identity=await identityVerifier.verifyExternalIdentity({
   idToken,expectedNonce:ticket.expectedNonce
  });
  assert.equal(identity.subject,'subject-0001');
  const auth=createHostVerifiedSessionStore({
   filename:join(folder,'verified.sqlite'),expectedOrigin:origin,
   trustedIssuer:issuer,trustedAudience:clientId,now:()=>clockStart,
   verifyExternalIdentity:async()=>identity,
   lookupExternalAccount:async v=>v.issuer===issuer&&v.subject==='subject-0001'?
    {actorId:'buyerA',merchantId:'tenantA'}:null,
   getMembership:async()=>({actorId:'buyerA',merchantId:'tenantA',
    role:'buyer',active:true,revision:1})
  });
  try{
   const created=await auth.establish({idToken,expectedNonce:ticket.expectedNonce});
   const session=await auth.resolveForGateway(new Request(
    origin+'/api/marketplace/quotes/any',{
     headers:{cookie:created.setCookie.split(';')[0]}
    }));
   assert.equal(session.actorId,'buyerA');
   assert.equal(session.merchantId,'tenantA');
   assert.equal(session.role,'buyer');
   rejects(()=>get().consume(callback(begun)),
    'OIDC_CHALLENGE_UNAVAILABLE_OR_REPLAYED');
   assert.equal((await auth.resolveForGateway(new Request(
    origin+'/api/marketplace/quotes/any',{
     headers:{cookie:created.setCookie.split(';')[0]}
    }))).verified,true);
  }finally{auth.close()}
 }));
