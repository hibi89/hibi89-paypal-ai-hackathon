import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkerOidcTokenTransport} from '../src/worker_oidc_token_transport.mjs';
const tokenEndpoint='https://idp.example.test/oauth/token';
const redirectUri='https://proofline.example.test/api/auth/oidc/callback';
const clientId='private-client',clientSecret='CI_ONLY_SYNTHETIC_SECRET_2026';
const idToken='a'.repeat(24)+'.'+'b'.repeat(44)+'.'+'c'.repeat(256);
const ticket=()=>({tokenEndpoint,redirectUri,clientId,code:'CODE_1234567890',
 codeVerifier:'v'.repeat(43)});
const success=()=>new Response(JSON.stringify({token_type:'Bearer',id_token:idToken,
 access_token:'discard_this',refresh_token:'discard_this_too'}),{
 headers:{'content-type':'application/json; charset=utf-8'}});
const make=(overrides={})=>createWorkerOidcTokenTransport({tokenEndpoint,redirectUri,
 clientId,clientSecret,fetchImpl:async()=>success(),networkApproved:true,...overrides});
test('default OFF never sends token POST',async()=>{
 let calls=0;
 const t=make({networkApproved:false,fetchImpl:async()=>{calls++;return success()}});
 await assert.rejects(()=>t.exchange(ticket()),{code:'WORKER_OIDC_NETWORK_NOT_APPROVED'});
 assert.equal(calls,0);assert.equal(t.networkEnabled,false);
});
test('strict pinned single POST, Basic secret, S256 verifier and no token persistence',async()=>{
 let calls=0,observed;
 const t=make({fetchImpl:async(u,init)=>{observed={u,init};calls++;return success()}});
 const result=await t.exchange(ticket());
 assert.deepEqual(result,{idToken});assert.ok(Object.isFrozen(result));
 assert.equal(calls,1);assert.equal(observed.u,tokenEndpoint);
 const x=observed.init;
 assert.equal(x.method,'POST');assert.equal(x.redirect,'error');
 assert.equal(x.cache,'no-store');assert.equal(x.credentials,'omit');
 assert.equal(x.referrerPolicy,'no-referrer');
 assert.equal(x.headers['content-type'],'application/x-www-form-urlencoded');
 assert.equal(x.headers.accept,'application/json');
 const basic=Buffer.from(encodeURIComponent(clientId)+':'+encodeURIComponent(clientSecret)).toString('base64');
 assert.equal(x.headers.authorization,'Basic '+basic);
 assert.ok(x.signal instanceof AbortSignal);
 assert.deepEqual(Object.fromEntries(new URLSearchParams(x.body)),{
  grant_type:'authorization_code',code:ticket().code,
  redirect_uri:redirectUri,code_verifier:'v'.repeat(43)});
 assert.equal(t.autoRetry,false);assert.equal(t.paymentAuthorized,false);
});
test('reject browser-controlled endpoint/callback/client or malformed code before fetch',async()=>{
 let calls=0;
 const t=make({fetchImpl:async()=>{calls++;return success()}});
 for(const bad of [
  {tokenEndpoint:'https://evil.example.test/token'},
  {redirectUri:'https://evil.example.test/api/auth/oidc/callback'},
  {clientId:'bad-client'}, {codeVerifier:'short'},
  {code:'bad code'}, {code:'x'.repeat(513)}
 ])await assert.rejects(()=>t.exchange({...ticket(),...bad}),{code:'WORKER_OIDC_TICKET_REJECTED'});
 assert.equal(calls,0);
});
test('trust config rejects localhost, private IP, non-HTTPS, queries and missing secret',()=>{
 const base={tokenEndpoint,redirectUri,clientId,clientSecret,fetchImpl:async()=>success()};
 for(const v of [
  {tokenEndpoint:'http://idp.example.test/token'},
  {tokenEndpoint:'https://127.0.0.1/token'},
  {tokenEndpoint:'https://localhost/token'},
  {tokenEndpoint:'https://idp.local/token'},
  {tokenEndpoint:'https://u:p@idp.example.test/token'},
  {tokenEndpoint:'https://idp.example.test:8443/token'},
  {tokenEndpoint:tokenEndpoint+'?foo=bar'},
  {tokenEndpoint:tokenEndpoint+'#frag'},
  {redirectUri:redirectUri+'?code=secret'},
  {redirectUri:'https://proofline.example.test/other'},
  {clientSecret:'short'}, {clientSecret:'bad\nheader'},
  {clientId:'bad client'}, {fetchImpl:null},{timeoutMs:0},
  {timeoutMs:30000}
 ])assert.throws(()=>createWorkerOidcTokenTransport({...base,...v}));
});
test('HTTP status, wrong MIME, advertised huge size and invalid length reject without retry',async()=>{
 for(const response of [
  new Response(null,{status:302,headers:{location:'https://evil.example.test'}}),
  new Response('{}',{status:401,headers:{'content-type':'application/json'}}),
  new Response('{}',{headers:{'content-type':'text/html'}}),
  new Response('{}',{headers:{'content-type':'application/json','content-length':'16385'}}),
  new Response('{}',{headers:{'content-type':'application/json','content-length':'NaN'}})
 ]){
  let calls=0;
  const t=make({fetchImpl:async()=>{calls++;return response;}});
  await assert.rejects(()=>t.exchange(ticket()),{code:'WORKER_OIDC_RESPONSE_REJECTED'});
  assert.equal(calls,1);
 }
});
test('undeclared >16KiB stream and invalid JSON are rejected',async()=>{
 for(const body of ['x'.repeat(16385),'{unparseable']){
  let calls=0;
  const t=make({fetchImpl:async()=>{calls++;return new Response(body,{
   headers:{'content-type':'application/json'}})}});
  await assert.rejects(()=>t.exchange(ticket()),{code:'WORKER_OIDC_RESPONSE_REJECTED'});
  assert.equal(calls,1);
 }
});
test('missing, malformed ID token or wrong token type fail closed',async()=>{
 for(const json of [
  {token_type:'Bearer'},{token_type:'Bearer',id_token:'a.b.c'},
  {token_type:'Bearer',id_token:'invalid'},{token_type:'bearer',id_token:idToken},
  {id_token:idToken}
 ]){
  const t=make({fetchImpl:async()=>new Response(JSON.stringify(json),
   {headers:{'content-type':'application/json'}})});
  await assert.rejects(()=>t.exchange(ticket()),{code:'WORKER_OIDC_ID_TOKEN_MISSING'});
 }
});
test('network/timeout ambiguity produces generic error after exactly one attempt',async()=>{
 let calls=0;
 const t=make({fetchImpl:async()=>{calls++;throw Error('do-not-leak-secret')}});
 await assert.rejects(()=>t.exchange(ticket()),{code:'WORKER_OIDC_EXCHANGE_FAILED'});
 assert.equal(calls,1);
});

test('loopback HTTPS callback requires an explicit isolated CI exception',async()=>{
 const local='https://127.0.0.1:28765/api/auth/oidc/callback';
 assert.throws(()=>make({redirectUri:local}),{
  code:'WORKER_OIDC_TRUST_CONFIG_REQUIRED'
 });
 let called=0;
 const f=createWorkerOidcTokenTransport({
  tokenEndpoint,redirectUri:local,allowLocalCallback:true,clientId,clientSecret,
  networkApproved:true,fetchImpl:async()=>{called++;return success()}
 });
 const result=await f.exchange({...ticket(),redirectUri:local});
 assert.deepEqual(result,{idToken});assert.equal(called,1);
 await assert.rejects(()=>f.exchange({...ticket(),
  redirectUri:'https://127.0.0.1:28766/api/auth/oidc/callback'}),{
   code:'WORKER_OIDC_TICKET_REJECTED'
  });
 assert.equal(called,1);
});
