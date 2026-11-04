import test from 'node:test';
import assert from 'node:assert/strict';
import defaultRuntime,{createPrivateWorkerIdentityHost}
 from '../src/worker_private_identity_host.mjs';
import {redirectVerifiedOwnerLogin} from '../src/worker_private_sign_in.mjs';

const ORIGIN='https://owner.proofline-review.dev';
const ISSUER='https://login.oidc-review.dev';
const TOKEN=ISSUER+'/oauth2/token';
const AUTH=ISSUER+'/oauth2/authorize';
const jwks=JSON.stringify({keys:[{
 kty:'RSA',kid:'pinned-review-key',alg:'RS256',use:'sig',
 n:Buffer.alloc(256,0x42).toString('base64url'),e:'AQAB'
}]});
let writes=0,network=0;
const limits=[];
const db={withSession(mode){
 assert.equal(mode,'first-primary');
 return {prepare(sql){
  assert.match(sql,/^INSERT INTO worker_private_login_challenges/);
  return {bind(...args){
   assert.equal(args.length,4);
   return {async run(){writes++;return {meta:{changes:1}}}};
  }};
 }};
}};
const active=()=>({
 PRIVATE_IDENTITY_HOST_OPT_IN:'OWNER_APPROVED_ISOLATED_D1_OIDC',
 PRIVATE_IDENTITY_IDP_NETWORK_OPT_IN:'OWNER_APPROVED_REAL_IDP_EXCHANGE',
 PRIVATE_IDENTITY_ORIGIN:ORIGIN,
 PRIVATE_IDENTITY_ISSUER:ISSUER,
 PRIVATE_IDENTITY_AUTHORIZATION_ENDPOINT:AUTH,
 PRIVATE_IDENTITY_TOKEN_ENDPOINT:TOKEN,
 PRIVATE_IDENTITY_CLIENT_ID:'prooflineowner',
 PRIVATE_IDENTITY_RATE_LIMITER:{async limit({key}){
  limits.push(key);return {success:true};
 }},
 PRIVATE_IDENTITY_CLIENT_SECRET:'fake-fixture-credential',
 PRIVATE_IDENTITY_JWKS_JSON:jwks,
 PRIVATE_IDENTITY_SUBJECT_PEPPER_B64:Buffer.alloc(32,0x4f).toString('base64'),
 DB:db
});
const blocked=async(res)=>{
 assert.equal(res.status,503);
 assert.deepEqual(await res.json(),{
  error:'OWNER_IDENTITY_RUNTIME_NOT_AUTHORIZED',paymentAuthorized:false
 });
 assert.equal(res.headers.get('access-control-allow-origin'),null);
 assert.equal(res.headers.get('cache-control'),'no-store, max-age=0');
 assert.equal(res.headers.get('x-content-type-options'),'nosniff');
};
const req=(path='/__private/attempts/view',options={})=>new Request(ORIGIN+path,options);
const runtime=createPrivateWorkerIdentityHost({tokenFetch:async()=>{
 network++;throw Error('TOKEN_PROVIDER_MUST_NOT_BE_CALLED');
}});
test('host never enables remote identity or D1 from merely deploying its default export',async()=>{
 writes=0;network=0;
 await blocked(await defaultRuntime.fetch(req(),undefined));
 await blocked(await defaultRuntime.fetch(req(),{}));
 await blocked(await runtime.fetch(req(),{
  ...active(),PRIVATE_IDENTITY_HOST_OPT_IN:'true'
 }));
 await blocked(await runtime.fetch(req(),{
  ...active(),PRIVATE_IDENTITY_IDP_NETWORK_OPT_IN:undefined
 }));
 await blocked(await runtime.fetch(req(),{
  ...active(),DB:null
 }));
 assert.equal(writes,0);assert.equal(network,0);
});
test('host refuses unsafe URLs, untrusted issuer, offsite token endpoints and invalid trust secrets',async()=>{
 const invalid=[
  {PRIVATE_IDENTITY_ORIGIN:'http://owner.proofline-review.dev'},
  {PRIVATE_IDENTITY_ORIGIN:'https://127.0.0.1:8787'},
  {PRIVATE_IDENTITY_ORIGIN:'https://owner.example.com'},
  {PRIVATE_IDENTITY_ORIGIN:'https://host.invalid'},
  {PRIVATE_IDENTITY_ORIGIN:'https://user:pass@owner.proofline-review.dev'},
  {PRIVATE_IDENTITY_ORIGIN:'https://owner.proofline-review.dev/'},
  {PRIVATE_IDENTITY_ISSUER:'http://login.oidc-review.dev'},
  {PRIVATE_IDENTITY_ISSUER:'https://idp.example.org'},
  {PRIVATE_IDENTITY_ISSUER:ORIGIN},
  {PRIVATE_IDENTITY_TOKEN_ENDPOINT:'https://idp-evil.dev/oauth2/token'},
  {PRIVATE_IDENTITY_AUTHORIZATION_ENDPOINT:'https://idp-evil.dev/oauth2/authorize'},
  {PRIVATE_IDENTITY_TOKEN_ENDPOINT:TOKEN+'?redirect=https://evil.dev'},
  {PRIVATE_IDENTITY_SUBJECT_PEPPER_B64:'wrong'},
  {PRIVATE_IDENTITY_JWKS_JSON:'{"keys":[]}'},
  {PRIVATE_IDENTITY_JWKS_JSON:'{"keys":[{"kty":"oct"}]}'},
  {PRIVATE_IDENTITY_CLIENT_SECRET:'short'},
  {PRIVATE_IDENTITY_CLIENT_ID:'example@example.dev'}
 ];
 for(const change of invalid)await blocked(await runtime.fetch(req(),{
  ...active(),...change
 }));
 assert.equal(network,0);assert.equal(writes,0);
});
test('host routes are opt-in and expose no PayPal, quote or account signup mutation',async()=>{
 const env=active();
 const noRoute=await runtime.fetch(req('/api/paypal/capture',{method:'POST'}),env);
 assert.equal(noRoute.status,404);
 assert.equal(noRoute.headers.get('access-control-allow-origin'),null);
 const missing=await runtime.fetch(req('/api/auth/signup',{method:'POST'}),env);
 assert.equal(missing.status,404);
 assert.equal((await runtime.fetch(req('/__private/attempts/view'),env)).status,401);
 assert.equal((await runtime.fetch(req('/__private/attempts/view.js'),env)).status,401);
 assert.equal((await runtime.fetch(req('/__private/attempts'),env)).status,401);
 assert.equal((await runtime.fetch(new Request('https://attacker.dev/__private/attempts/view'),env)).status,403);
 assert.equal(network,0);assert.equal(writes,0);
});
test('host allows only explicit same-origin POST to begin pinned PKCE; start does not contact IdP',async()=>{
 const env=active();
 writes=0;network=0;
 const r=await runtime.fetch(req('/api/auth/oidc/start',{
  method:'POST',
  headers:{origin:ORIGIN,'sec-fetch-site':'same-origin'}
 }),env);
 assert.equal(r.status,303);
 assert.equal(new URL(r.headers.get('location')).origin,ISSUER);
 const to=new URL(r.headers.get('location'));
 assert.equal(to.searchParams.get('code_challenge_method'),'S256');
 assert.equal(to.searchParams.get('client_id'),'prooflineowner');
 assert.equal(to.searchParams.get('redirect_uri'),ORIGIN+'/api/auth/oidc/callback');
 assert.match(r.headers.get('set-cookie')??'',/Secure; HttpOnly; SameSite=Lax/);
 assert.equal(r.headers.get('access-control-allow-origin'),null);
 assert.equal(writes,1);assert.equal(network,0);
 const forbidden=await runtime.fetch(req('/api/auth/oidc/start',{
  method:'POST',headers:{origin:'https://attacker.dev','sec-fetch-site':'cross-site'}
 }),env);
 assert.equal(forbidden.status,503);
 assert.equal(writes,1);assert.equal(network,0);
});
test('host refuses malformed callback and cannot turn GET/refresh into external token POST',async()=>{
 const env=active();
 network=0;
 const r=await runtime.fetch(req('/api/auth/oidc/callback?code=guess&state=wrong'),env);
 assert.equal(r.status,401);
 const get=await runtime.fetch(req('/api/auth/oidc/start'),env);
 assert.equal(get.status,405);
 const logout=await runtime.fetch(req('/api/auth/oidc/logout',{method:'POST'}),env);
 assert.equal(logout.status,403);
 assert.equal(network,0);
});

test('public sign-in form and CSS are accessible only when host enabled, without JavaScript or data access',async()=>{
 writes=0;network=0;
 const html=await runtime.fetch(req('/__private/sign-in'),active());
 assert.equal(html.status,200);
 assert.match(html.headers.get('content-type'),/^text\/html/);
 assert.match(html.headers.get('content-security-policy'),/script-src 'none'/);
 assert.match(html.headers.get('content-security-policy'),/form-action 'self'/);
 assert.equal(html.headers.get('cache-control'),'no-store, max-age=0');
 const body=await html.text();
 assert.match(body,/<form method="POST" action="\/api\/auth\/oidc\/start">/);
 assert.match(body,/pre-authorized owner accounts/);
 assert.doesNotMatch(body,/<script\b|<input[^>]+type="hidden"/i);
 const css=await runtime.fetch(req('/__private/sign-in.css'),active());
 assert.equal(css.status,200);
 assert.match(css.headers.get('content-type'),/^text\/css/);
 assert.match(await css.text(),/button:focus-visible/);
 assert.equal((await runtime.fetch(req('/__private/sign-in?next=https://attacker.dev'),active())).status,404);
 const badMethod=await runtime.fetch(req('/__private/sign-in',{method:'POST'}),active());
 assert.equal(badMethod.status,405);
 await blocked(await runtime.fetch(req('/__private/sign-in'),{}));
 assert.equal(writes,0);assert.equal(network,0);
});
test('host requires Cloudflare Rate Limiting binding and fails closed before database changes',async()=>{
 writes=0;network=0;
 await blocked(await runtime.fetch(req('/__private/sign-in'),{
  ...active(),PRIVATE_IDENTITY_RATE_LIMITER:null
 }));
 await blocked(await runtime.fetch(req('/api/auth/oidc/start',{
  method:'POST',headers:{origin:ORIGIN,'sec-fetch-site':'same-origin'}
 }),{...active(),PRIVATE_IDENTITY_RATE_LIMITER:undefined}));
 assert.equal(writes,0);assert.equal(network,0);
});
test('rate limiting denial and binding failure block owner login POST before D1 challenge',async()=>{
 writes=0;network=0;
 const start=req('/api/auth/oidc/start',{
  method:'POST',headers:{origin:ORIGIN,'sec-fetch-site':'same-origin'}
 });
 const rejected=await runtime.fetch(start,{
  ...active(),PRIVATE_IDENTITY_RATE_LIMITER:{
   async limit({key}){assert.equal(key,'proofline:owner-oidc:start');return {success:false}}
  }
 });
 assert.equal(rejected.status,429);
 assert.equal((await rejected.json()).error,'LOGIN_RATE_LIMITED');
 assert.equal(rejected.headers.get('access-control-allow-origin'),null);
 assert.equal(rejected.headers.get('retry-after'),'60');
 await blocked(await runtime.fetch(start,{
  ...active(),PRIVATE_IDENTITY_RATE_LIMITER:{async limit(){throw Error('RATE_LIMITER_DOWN')}}
 }));
 await blocked(await runtime.fetch(start,{
  ...active(),PRIVATE_IDENTITY_RATE_LIMITER:{async limit(){return {}}}
 }));
 assert.equal(writes,0);assert.equal(network,0);
});
test('callback rate guard blocks provider exchange before callback can consume a challenge',async()=>{
 writes=0;network=0;
 const callback=req('/api/auth/oidc/callback?code=guess&state='+('Z'.repeat(43)));
 const denied=await runtime.fetch(callback,{
  ...active(),PRIVATE_IDENTITY_RATE_LIMITER:{
   async limit({key}){assert.equal(key,'proofline:owner-oidc:callback');return {success:false}}
  }
 });
 assert.equal(denied.status,429);
 assert.equal(writes,0);assert.equal(network,0);
});
test('a verified callback is converted to a same-origin 303, preserving all secure one-time cookies',()=>{
 const ok=new Response(JSON.stringify({status:'SESSION_ESTABLISHED',paymentAuthorized:false}),{
  status:200,headers:{'content-type':'application/json'}
 });
 ok.headers.append('set-cookie','__Host-proofline_oidc_state=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0');
 ok.headers.append('set-cookie','__Host-proofline_oidc_pkce=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0');
 ok.headers.append('set-cookie','__Host-proofline_session='+('A'.repeat(43))+
  '; Secure; HttpOnly; Path=/; SameSite=Strict; Max-Age=900');
 const redirected=redirectVerifiedOwnerLogin(ok,ORIGIN);
 assert.equal(redirected.status,303);
 assert.equal(redirected.headers.get('location'),ORIGIN+'/__private/attempts/view');
 assert.equal(redirected.headers.get('cache-control'),'no-store, max-age=0');
 assert.equal(redirected.headers.getSetCookie().length,3);
 assert.equal(redirected.headers.get('access-control-allow-origin'),null);
 const tampered=new Response('{}',{status:200});
 tampered.headers.append('set-cookie','__Host-proofline_session='+('B'.repeat(43))+
  '; Secure; HttpOnly; Path=/; SameSite=Strict; Max-Age=900');
 assert.equal(redirectVerifiedOwnerLogin(tampered,ORIGIN).status,503);
 assert.equal(redirectVerifiedOwnerLogin(new Response('{}',{status:401}),ORIGIN).status,401);
});
