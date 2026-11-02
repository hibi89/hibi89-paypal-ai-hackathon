import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createWorkerOidcPkceCoordinator} from '../src/worker_oidc_pkce_coordinator.mjs';
const O='https://proofline.example.test',I='https://idp.example.test';
const endpoint=I+'/oauth/authorize',exchangeEndpoint='https://token.example.test/oauth/token';
const start=()=>new Request(O+'/api/auth/oidc/start',{method:'POST',headers:{origin:O,'sec-fetch-site':'same-origin'}});
const fromCookies=headers=>headers.getSetCookie().map(x=>x.split(';')[0]).filter(x=>x.includes('oidc_')).join('; ');
function fixture(){
 const state='a'.repeat(43),nonce='b'.repeat(43),stats={begin:0,exchange:0,issue:0};
 const authority={async beginChallenge(){stats.begin++;return {challengeId:state,nonce}},
  async issue({challengeId,idToken}){
   stats.issue++;
   if(challengeId!==state||idToken!=='SIGNED')throw Error('NOT_VALID');
   return {setCookie:'__Host-proofline_session='+'z'.repeat(43)+
    '; Secure; HttpOnly; Path=/; SameSite=Strict; Max-Age=900'};
  }};
 const transport={async exchange(t){
  stats.exchange++;
  assert.equal(t.tokenEndpoint,exchangeEndpoint);
  assert.equal(t.clientId,'private-client');
  assert.equal(t.redirectUri,O+'/api/auth/oidc/callback');
  assert.match(t.codeVerifier,/^[A-Za-z0-9_-]{43}$/);
  return {idToken:'SIGNED'};
 }};
 const x=createWorkerOidcPkceCoordinator({authority,codeTransport:transport,
  issuer:I,clientId:'private-client',allowedOrigin:O,
  authorizationEndpoint:endpoint,tokenEndpoint:exchangeEndpoint});
 return {x,stats,state,nonce};
}
test('start requires same-origin POST and refuses public GET/forged Origin before D1',async()=>{
 const {x,stats}=fixture();
 for(const request of [new Request(O+'/api/auth/oidc/start'),
  new Request(O+'/api/auth/oidc/start',{method:'POST'}),
  new Request(O+'/api/auth/oidc/start',{method:'POST',headers:{origin:'https://evil.test','sec-fetch-site':'same-origin'}}),
  new Request(O+'/api/auth/oidc/start',{method:'POST',headers:{origin:O,'sec-fetch-site':'cross-site'}})]){
  const r=await x.start(request);
  assert.equal(r.status,503);
 }
 assert.equal(stats.begin,0);assert.equal(stats.exchange,0);
});
test('PKCE start pins exact endpoints and produces S256, nonce, state and HttpOnly Lax cookies',async()=>{
 const {x,state,nonce}=fixture(),r=await x.start(start());
 assert.equal(r.status,303);assert.equal(r.headers.get('cache-control'),'no-store, max-age=0');
 const u=new URL(r.headers.get('location'));
 assert.equal(u.origin,I);assert.equal(u.pathname,'/oauth/authorize');
 for(const [k,v] of Object.entries({response_type:'code',client_id:'private-client',redirect_uri:O+'/api/auth/oidc/callback',
  code_challenge_method:'S256',scope:'openid',nonce,state}))assert.equal(u.searchParams.get(k),v);
 const cookies=r.headers.getSetCookie();
 assert.equal(cookies.length,2);
 for(const c of cookies)assert.match(c,/; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=300$/);
 const verifier=cookies.find(x=>x.startsWith('__Host-proofline_oidc_pkce='))?.split(';')[0].split('=')[1];
 assert.equal(createHash('sha256').update(verifier).digest('base64url'),u.searchParams.get('code_challenge'));
});
test('callback exchanges only state-bound codes and returns server-issued session cookie',async()=>{
 const {x,state,stats}=fixture(),startResponse=await x.start(start());
 const r=await x.callback(new Request(O+'/api/auth/oidc/callback?code=fixtureCode&state='+state,
  {headers:{cookie:fromCookies(startResponse.headers),'sec-fetch-site':'cross-site'}}));
 assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{status:'SESSION_ESTABLISHED',paymentAuthorized:false});
 assert.equal(stats.begin,1);assert.equal(stats.exchange,1);assert.equal(stats.issue,1);
 const issued=r.headers.getSetCookie();
 assert.equal(issued.length,3);assert.ok(issued.some(x=>x.startsWith('__Host-proofline_session=')));
 assert.equal(issued.filter(x=>x.includes('Max-Age=0')).length,2);
});
test('forged callback state, duplicate cookie and invalid OAuth response do not exchange a code',async()=>{
 const {x,state,stats}=fixture(),s=await x.start(start()),cookie=fromCookies(s.headers);
 const bad=[
  [O+'/api/auth/oidc/callback?code=C&state='+'c'.repeat(43),cookie],
  [O+'/api/auth/oidc/callback?code=C&state='+state,cookie+'; '+cookie],
  [O+'/api/auth/oidc/callback?error=access_denied&state='+state,cookie],
  [O+'/api/auth/oidc/callback?code=C&state='+state+'&state='+state,cookie],
  [O+'/api/auth/oidc/callback?code=C&state='+state,''],
  [O+'/api/auth/oidc/callback?code=C&state='+state+'#fragment',cookie]
 ];
 for(const [url,c] of bad){
  const r=await x.callback(new Request(url,{headers:{cookie:c}}));
  assert.equal(r.status,401);assert.equal(r.headers.getSetCookie().length,2);
 }
 assert.equal(stats.exchange,0);
});
test('incorrect origin, HTTP, embedded endpoint queries and missing code transport fail closed',()=>{
 const args={issuer:I,clientId:'private-client',allowedOrigin:O,
  authorizationEndpoint:endpoint,tokenEndpoint:exchangeEndpoint,
  authority:{beginChallenge(){},issue(){}},codeTransport:{exchange(){}}};
 for(const override of [
  {allowedOrigin:'http://proofline.example.test'},
  {allowedOrigin:O+'/private'},
  {authorizationEndpoint:endpoint+'?evil=true'},
  {tokenEndpoint:'http://token.example.test/oauth/token'},
  {codeTransport:null},
  {clientId:'bad client'}
 ])assert.throws(()=>createWorkerOidcPkceCoordinator({...args,...override}));
});
