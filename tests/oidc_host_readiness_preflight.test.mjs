import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createManagedOidcJwksVerifier} from '../src/managed_oidc_jwks_verifier.mjs';
import {inspectOidcHostReadiness} from '../src/oidc_host_readiness_preflight.mjs';

const base={
 publicOrigin:'https://proofline.example.com',
 startUri:'https://proofline.example.com/api/auth/oidc/start',
 redirectUri:'https://proofline.example.com/api/auth/oidc/callback',
 issuer:'https://accounts.example.org',
 authorizationEndpoint:'https://accounts.example.org/oauth2/authorize',
 tokenEndpoint:'https://accounts.example.org/oauth2/token',
 jwksUri:'https://accounts.example.org/.well-known/jwks.json',
 clientId:'proofline-offline-client',
 approvedProviderOrigins:['https://accounts.example.org'],
 clientSecretPresent:true,challengeKeyPresent:true,bindingPepperPresent:true,
 components:{
  challengeStore:{begin(){},consume(){}},
  codeTransport:{exchange(){}},
  jwksTrust:{verifyExternalIdentity(){},status(){return {active:true,autoRefreshEnabled:false}}},
  accountBindings:{lookupExternalAccount(){}},
  sessionStore:{establish(){},resolveRequest(){}},
  ledger:{getLocalMember(){}}
 },
 hostPolicy:{
  trustsUnverifiedForwardedHeaders:false,
  automaticallyReplaysPaymentPost:false,
  publicSelfRegistration:false,
  credentialLoggingEnabled:false
 }
};
const run=patch=>inspectOidcHostReadiness({...base,...patch});
const codes=(r)=>r.issues;
test('offline-only valid configuration never grants network, login or payment authority',()=>{
 const result=run({});
 assert.deepEqual(codes(result),[]);
 assert.equal(result.configurationConsistent,true);
 assert.equal(result.status,'OFFLINE_CONFIGURATION_CONSISTENT_ONLY');
 for(const k of ['productionReady','paymentAuthorized','independentlyVerifiedTls',
  'independentlyVerifiedProvider','independentlyVerifiedMerchant','realBrowserLoginTested'])
  assert.equal(result[k],false,k);
 assert.equal(result.externalNetworkCalls,0);
});
test('no credentials or browser-supplied secrets ever echoed to the report',()=>{
 const sentinel='SECRET_SENTINEL_NEVER_PRINTED_123';
 const r=run({clientId:sentinel,clientSecret:sentinel,
  redirectUri:'https://user:'+sentinel+'@evil.example.net/path?token='+sentinel});
 assert.equal(JSON.stringify(r).includes(sentinel),false);
 assert.ok(codes(r).includes('HOST_OIDC_CALLBACK_ROUTE_MISMATCH'));
});
test('wrong callback origin, path, scheme, query and fragment fail closed',()=>{
 for(const redirectUri of [
  'https://evil.example.org/api/auth/oidc/callback',
  'http://proofline.example.com/api/auth/oidc/callback',
  'https://proofline.example.com/api/auth/oidc/other',
  base.redirectUri+'?code=ONE_TIME_SECRET',
  base.redirectUri+'#fragment'
 ]){
  const r=run({redirectUri});
  assert.equal(r.configurationConsistent,false);
  assert.ok(codes(r).includes('HOST_OIDC_CALLBACK_ROUTE_MISMATCH'));
 }
});
test('unsafe public origins, localhost, IP, wildcard, default port and credentials rejected',()=>{
 for(const publicOrigin of [
  'http://proofline.example.com','https://localhost','https://127.0.0.1',
  'https://*.example.com','https://proofline.example.com:443',
  'https://u:p@proofline.example.com','https://proofline.example.com/',
  'https://proofline.local','https://proofline.example.com?x=1'
 ]){
  const r=run({publicOrigin});
  assert.ok(codes(r).includes('HOST_PUBLIC_ORIGIN_INVALID'),publicOrigin);
 }
});
test('unapproved key, token and authorization endpoint origins blocked',()=>{
 for(const patch of [
  {jwksUri:'https://untrusted.example.net/keys'},
  {tokenEndpoint:'https://untrusted.example.net/oauth/token'},
  {authorizationEndpoint:'https://untrusted.example.net/auth'},
  {issuer:'https://untrusted.example.net'}
 ]){
  assert.ok(codes(run(patch)).includes('OIDC_PROVIDER_ENDPOINT_NOT_ALLOWLISTED'));
 }
});
test('separate approved provider origins are possible without implying provenance',()=>{
 const r=run({jwksUri:'https://keys.example.org/oidc/keys',
  approvedProviderOrigins:['https://accounts.example.org','https://keys.example.org']});
 assert.equal(r.configurationConsistent,true);
 assert.equal(r.independentlyVerifiedProvider,false);
});
test('same-origin host/provider, repeated allowlist and endpoint collisions blocked',()=>{
 const r1=run({approvedProviderOrigins:['https://accounts.example.org',
  'https://accounts.example.org']});
 assert.ok(codes(r1).includes('OIDC_PROVIDER_ORIGIN_ALLOWLIST_INVALID'));
 const r2=run({approvedProviderOrigins:['https://accounts.example.org',
  'https://proofline.example.com']});
 assert.ok(codes(r2).includes('OIDC_HOST_AND_PROVIDER_ORIGIN_COLLISION'));
 const r3=run({tokenEndpoint:base.authorizationEndpoint});
 assert.ok(codes(r3).includes('OIDC_AUTH_AND_TOKEN_ENDPOINT_COLLISION'));
});
test('missing secret storage and backend components block even if public URLs look valid',()=>{
 const r=run({clientSecretPresent:false,challengeKeyPresent:false,bindingPepperPresent:false,
  components:{},hostPolicy:{}});
 const c=codes(r);
 for(const x of [
  'OIDC_PRIVATE_CLIENT_CREDENTIAL_UNAVAILABLE',
  'OIDC_BROWSER_CHALLENGE_KEY_UNAVAILABLE',
  'OIDC_ACCOUNT_BINDING_PEPPER_UNAVAILABLE',
  'OIDC_CHALLENGE_STORE_NOT_CONNECTED',
  'OIDC_CODE_EXCHANGE_NOT_CONNECTED',
  'OIDC_MANAGED_JWKS_NOT_CONNECTED',
  'OIDC_PRIVATE_ACCOUNT_BINDING_NOT_CONNECTED',
  'OIDC_HOST_SESSION_NOT_CONNECTED',
  'OIDC_MEMBER_LEDGER_NOT_CONNECTED',
  'HOST_PROXY_TRUST_POLICY_NOT_LOCKED',
  'HOST_PAYPAL_POST_REPLAY_POLICY_NOT_LOCKED',
  'HOST_REGISTRATION_POLICY_NOT_LOCKED',
  'HOST_CREDENTIAL_LOG_POLICY_NOT_LOCKED'
 ])assert.ok(c.includes(x),x);
});
test('stale, untrusted or expiring JWKS disallows local readiness',()=>{
 for(const status of [()=>({active:false,autoRefreshEnabled:false}),
  ()=>({active:true,autoRefreshEnabled:true}),()=>{throw Error('db corrupt')}])
  assert.ok(codes(run({components:{...base.components,
   jwksTrust:{verifyExternalIdentity(){},status}}}))
   .includes('OIDC_PINNED_JWKS_NOT_ACTIVE'));
});
test('real isolated SQLite JWKS staging and activation switches preflight status without external I/O',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ppl-host-preflight-'));
 const now=1761987600000;
 const trust=createManagedOidcJwksVerifier({
  filename:join(dir,'keys.sqlite'),issuer:base.issuer,audience:base.clientId,
  authorizeTrustUpdate:()=>true,now:()=>now
 });
 try{
  const components={...base.components,jwksTrust:trust};
  assert.ok(codes(run({components})).includes('OIDC_PINNED_JWKS_NOT_ACTIVE'));
  const {publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const key={...publicKey.export({format:'jwk'}),kid:'LOCAL_PUBLIC_TEST_KEY',alg:'RS256',use:'sig'};
  await trust.stage({jwks:{keys:[key]},expectedRevision:0,validUntilMs:now+600000});
  assert.ok(codes(run({components})).includes('OIDC_PINNED_JWKS_NOT_ACTIVE'));
  await trust.activateStaged({expectedRevision:0});
  assert.deepEqual(codes(run({components})),[]);
  assert.equal(run({components}).productionReady,false);
 }finally{trust.close();rmSync(dir,{recursive:true,force:true})}
});
test('preflight contains no runtime data, network attempt, registration or payment side effect',()=>{
 let calls=0;
 const r=run({networkApproved:true,fetchImpl:()=>{calls++},
  payPalCapture:()=>{calls++},clientSecret:randomBytes(24).toString('base64url')});
 assert.equal(calls,0);
 assert.equal(r.externalNetworkCalls,0);
 assert.equal(r.paymentAuthorized,false);
});
