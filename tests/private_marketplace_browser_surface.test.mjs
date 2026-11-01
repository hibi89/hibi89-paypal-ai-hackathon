import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateMarketplaceBrowserSurface} from '../src/private_marketplace_browser_surface.mjs';

const origin='https://proofline.example.com';
const session='__Host-proofline_session=OPAQUE; Secure; HttpOnly; Path=/; SameSite=Strict';
const old='__Host-proofline_oidc=; Secure; HttpOnly; Path=/; SameSite=Lax; Max-Age=0';
const fixture=(handle=async()=>Response.json({paymentAuthorized:false,authenticated:false}))=>
 createPrivateMarketplaceBrowserSurface({
  publicOrigin:origin,privateHost:{handle}
 });
function req(path,opts={}){
 return new Request(origin+path,{...opts});
}
test('serves responsive dashboard and JS/CSS with strict CSP, no cache, and no backend identity override',async()=>{
 let calls=0;
 const b=fixture(async()=>{calls++;throw Error('NO_STATIC_BACKEND_ACCESS')});
 for(const [path,type,expected] of [
  ['/private/marketplace','text/html','id="read-contract"'],
  ['/private/marketplace/app.css','text/css','.columns'],
  ['/private/marketplace/app.js','text/javascript','freshCsrf']
 ]){
  const r=await b.handle(req(path));
  assert.equal(r.status,200);
  assert.ok(r.headers.get('content-type').startsWith(type));
  assert.match(r.headers.get('content-security-policy'),/script-src 'self'/);
  assert.match(r.headers.get('content-security-policy'),/connect-src 'self'/);
  assert.match(r.headers.get('content-security-policy'),/form-action 'self'/);
  assert.match(r.headers.get('cache-control'),/no-store/);
  assert.equal(r.headers.get('x-frame-options'),'DENY');
  assert.equal(r.headers.get('set-cookie'),null);
  assert.ok((await r.text()).includes(expected));
 }
 assert.equal(calls,0);
 assert.equal(b.publicListenerEnabled,false);
 assert.equal(b.paymentAuthorized,false);
});
test('private client has sign-in form, no client-controlled actor or silent payment actions',async()=>{
 const b=fixture();
 const html=await (await b.handle(req('/private/marketplace'))).text();
 const js=await (await b.handle(req('/private/marketplace/app.js'))).text();
 for(const term of [
  'method="post" action="/api/auth/oidc/start"',
  'id="sign-in"','id="sign-out"','id="submit"',
  'id="accept"','id="reject"','id="read-quote"','id="read-contract"'
 ])assert.ok(html.includes(term),term);
 for(const disallowed of ['localStorage','sessionStorage','innerHTML','x-actor','x-role',
  '/api/paypal/orders','/api/paypal/capture','generativelanguage.googleapis.com'])
  assert.equal(js.includes(disallowed),false,disallowed);
 assert.ok(js.includes("principal.role!=='seller'"));
 assert.ok(js.includes("principal.role!=='reviewer'"));
 assert.ok(js.includes("credentials:'same-origin'"));
 assert.ok(js.includes("'/api/auth/oidc/start-url'"));
 assert.ok(js.includes('location.assign(target.href)'));
 assert.ok(js.includes("target.searchParams.get('code_challenge_method')"));
 assert.ok(js.includes("redirect:'error'"));
 assert.ok(js.includes("crypto.randomUUID()"));
 assert.ok(js.includes('No success inferred'));
 assert.ok(js.includes('freshCsrf()'));
});
test('browser HTML OIDC callback shows only success page and preserves signed cookies',async()=>{
 const seen=[];
 const b=fixture(async request=>{
  seen.push(request.url);
  return new Response(JSON.stringify({
   csrfToken:'SUPER_PRIVATE_TOKEN_MUST_NOT_BE_EMBEDDED',
   authenticated:true,paymentAuthorized:false
  }),{status:200,headers:{'set-cookie':session}});
 });
 // A real verified backend must set two cookies; one cookie fails closed.
 const failed=await b.handle(req('/api/auth/oidc/callback?code=SYNTH&state=SYNTH',
  {headers:{accept:'text/html,application/xhtml+xml'}}));
 assert.equal(failed.status,503);
 assert.equal(failed.headers.get('set-cookie'),null);
 assert.equal((await failed.text()).includes('SUPER_PRIVATE_TOKEN'),false);
 assert.equal(seen.length,1);
 const valid=fixture(async()=>{
  const headers=new Headers({'content-type':'application/json'});
  headers.append('set-cookie',session);
  headers.append('set-cookie',old);
  return new Response(JSON.stringify({
   csrfToken:'DO_NOT_PUT_IN_HTML',paymentAuthorized:false
  }),{status:200,headers});
 });
 const response=await valid.handle(req('/api/auth/oidc/callback?code=CODE&state=STATE',{
  headers:{accept:'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8'}
 }));
 assert.equal(response.status,200);
 assert.equal(response.headers.get('content-type'),'text/html; charset=utf-8');
 assert.deepEqual(response.headers.getSetCookie(),[session,old]);
 const page=await response.text();
 assert.ok(page.includes('href="/private/marketplace"'));
 assert.equal(page.includes('DO_NOT_PUT_IN_HTML'),false);
 assert.equal(page.includes('<script'),false);
 assert.match(response.headers.get('content-security-policy'),/default-src 'none'/);
});
test('JSON callback and all marketplace API routes preserve trusted host behavior unchanged',async()=>{
 const calls=[];
 const b=fixture(async request=>{
  calls.push([request.method,new URL(request.url).pathname]);
  return Response.json({authenticated:true,paymentAuthorized:false});
 });
 const a=await b.handle(req('/api/auth/oidc/callback?state=A&code=B'));
 assert.equal(a.status,200);
 assert.equal(a.headers.get('content-type'),'application/json');
 const p=await b.handle(req('/api/marketplace/contracts/contractA'));
 assert.equal(p.status,200);
 const q=await b.handle(req('/api/auth/oidc/session'));
 assert.equal(q.status,200);
 assert.deepEqual(calls,[
  ['GET','/api/auth/oidc/callback'],
  ['GET','/api/marketplace/contracts/contractA'],
  ['GET','/api/auth/oidc/session']
 ]);
});
test('failed callback is unchanged and never converted to a success login page',async()=>{
 const b=fixture(async()=>Response.json({error:'AUTHENTICATION_FAILED',paymentAuthorized:false},
  {status:401}));
 const r=await b.handle(req('/api/auth/oidc/callback?code=X&state=Y',
  {headers:{accept:'text/html'}}));
 assert.equal(r.status,401);
 assert.equal((await r.json()).error,'AUTHENTICATION_FAILED');
 assert.equal(r.headers.get('set-cookie'),null);
});
test('unknown/mutating static paths, cross-origin and query strings cannot serve assets',async()=>{
 let backendCalls=0;
 const b=fixture(async()=>{backendCalls++;return new Response('BACKEND', {status:404})});
 for(const [path,init,status] of [
  ['/private/marketplace?debug=1',{},404],
  ['/private/marketplace/app.js?q=1',{},404],
  ['/private/marketplace',{method:'POST'},405],
  ['/private/marketplace/app.css',{method:'POST'},405]
 ]){
  const r=await b.handle(req(path,init));
  assert.equal(r.status,status);
  assert.equal(r.headers.get('set-cookie'),null);
 }
 const cross=await b.handle(new Request('https://evil.example.net/private/marketplace'));
 assert.equal(cross.status,404);
 assert.equal(backendCalls,0);
 const miss=await b.handle(req('/private/marketplace/unknown'));
 assert.equal(miss.status,404);
 assert.equal(backendCalls,1);
});
test('reject invalid public origin and missing verified host before serving a page',()=>{
 for(const publicOrigin of ['http://proofline.example.com','https://localhost',
   'https://proofline.example.com:443','https://proofline.example.com/path']){
  assert.throws(()=>createPrivateMarketplaceBrowserSurface({
   publicOrigin,privateHost:{handle:()=>{}}}),
   e=>e.code==='BROWSER_PRIVATE_VERIFIED_HOST_REQUIRED');
 }
 assert.throws(()=>createPrivateMarketplaceBrowserSurface({
  publicOrigin:origin,privateHost:{}}),
  e=>e.code==='BROWSER_PRIVATE_VERIFIED_HOST_REQUIRED');
});
