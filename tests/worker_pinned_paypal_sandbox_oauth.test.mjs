import test from 'node:test';
import assert from 'node:assert/strict';
import {createPinnedSandboxOAuthTokenSource,
 createPinnedSandboxGetWithOAuth,isPinnedSandboxOAuthTokenSource}
 from '../src/worker_pinned_paypal_sandbox_oauth.mjs';
import {isPinnedPayPalSandboxGetTransport,createPinnedPayPalSandboxGetTransport} from '../src/worker_pinned_paypal_sandbox_get.mjs';
const OAUTH='https://api-m.sandbox.paypal.com/v1/oauth2/token';
const GET='https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER_001';
const ID='test-client-id';
const SECRET='test-client-secret';
const TOKEN='sandbox-opaque-token';
const success=(obj={})=>new Response(JSON.stringify({access_token:TOKEN,
 token_type:'Bearer',expires_in:3600,...obj}),{status:200,
 headers:{'content-type':'application/json'}});
const make=(fetchImpl,extras={})=>createPinnedSandboxOAuthTokenSource({
 enabled:true,clientId:ID,clientSecret:SECRET,fetchImpl,...extras});

test('OAuth server-only construction requires explicit flag and valid credentials',()=>{
 assert.throws(()=>createPinnedSandboxOAuthTokenSource({clientId:ID,
  clientSecret:SECRET,fetchImpl:async()=>success()}),/EXPLICIT_CONFIG_REQUIRED/);
 for(const clientId of ['','x','client:colon', 'invalid client space','x'.repeat(257)]){
  assert.throws(()=>make(async()=>success(),{clientId}),/EXPLICIT_CONFIG_REQUIRED/);
 }
 for(const clientSecret of ['','small','unsafe\nsecret', 'x'.repeat(513)]){
  assert.throws(()=>make(async()=>success(),{clientSecret}),/EXPLICIT_CONFIG_REQUIRED/);
 }
 const t=make(async()=>success());
 assert.equal(isPinnedSandboxOAuthTokenSource(t),true);
 assert.equal(isPinnedSandboxOAuthTokenSource({...t}),false);
});

test('exact pinned OAuth POST, Basic auth, form grant; token stays server-side',async()=>{
 let calls=0;
 const source=make(async(url,opts)=>{
  calls++;
  assert.equal(url,OAUTH);
  assert.equal(opts.method,'POST');
  assert.equal(opts.redirect,'error');
  assert.equal(opts.headers.accept,'application/json');
  assert.equal(opts.headers['content-type'],'application/x-www-form-urlencoded');
  assert.equal(opts.headers.authorization,'Basic '+btoa(ID+':'+SECRET));
  assert.equal(opts.body,'grant_type=client_credentials');
  assert.equal(opts.signal.aborted,false);
  return success();
 });
 assert.equal(await source.getAccessToken(),TOKEN);
 assert.equal(calls,1);
 assert.ok(!JSON.stringify(source).includes(SECRET));
 assert.ok(!JSON.stringify(source).includes(TOKEN));
});

test('cache obeys expires_in safety margin; token refetched only after expiry threshold',async()=>{
 let now=1800000000000,calls=0;
 const source=make(async()=>{calls++;return success({access_token:'sandbox-token-'+calls,
  expires_in:100})},{now:()=>now});
 assert.equal(await source.getAccessToken(),'sandbox-token-1');
 now+=79_000;
 assert.equal(await source.getAccessToken(),'sandbox-token-1');
 assert.equal(calls,1);
 now+=2_000;
 assert.equal(await source.getAccessToken(),'sandbox-token-2');
 assert.equal(calls,2);
});

test('ten concurrent owner GET token requests coalesce to one OAuth POST',async()=>{
 let n=0;
 const source=make(async()=>{
  n++;
  await new Promise(resolve=>setTimeout(resolve,30));
  return success();
 });
 const tokens=await Promise.all(Array.from({length:10},()=>source.getAccessToken()));
 assert.equal(n,1);
 assert.equal(tokens.length,10);
 assert.ok(tokens.every(value=>value===TOKEN));
});

test('caller abort rejects one waiter without cancelling another ongoing token fetch',async()=>{
 let n=0;
 const source=make(async()=>{
  n++;await new Promise(resolve=>setTimeout(resolve,40));
  return success();
 });
 const controller=new AbortController();
 const first=source.getAccessToken({signal:controller.signal});
 const second=source.getAccessToken();
 controller.abort();
 await assert.rejects(first,{code:'SANDBOX_OAUTH_CALLER_ABORTED'});
 assert.equal(await second,TOKEN);
 assert.equal(n,1);
});

test('429, credentials rejection and 5xx never auto-retry or cache an error',async()=>{
 for(const [status,code] of [[429,'SANDBOX_OAUTH_RATE_LIMIT_NO_RETRY'],
  [401,'SANDBOX_OAUTH_CREDENTIALS_REJECTED'],
  [403,'SANDBOX_OAUTH_CREDENTIALS_REJECTED'],
  [500,'SANDBOX_OAUTH_PROVIDER_UNAVAILABLE_NO_RETRY']]){
  let n=0;
  const source=make(async()=>{
   n++;return new Response(null,{status});
  });
  await assert.rejects(source.getAccessToken(),{code});
  assert.equal(n,1);
 }
});

test('redirects, invalid JSON, malformed tokens and expiry fail closed',async()=>{
 const wrongOrigin=success();
 Object.defineProperty(wrongOrigin,'url',{value:'https://api-m.paypal.com/v1/oauth2/token'});
 const cases=[
  [wrongOrigin,'SANDBOX_OAUTH_REDIRECT_OR_SOURCE_REJECTED'],
  [new Response(null,{status:302,headers:{location:'https://evil.invalid'}}),'SANDBOX_OAUTH_PROVIDER_UNAVAILABLE_NO_RETRY'],
  [new Response('oops',{headers:{'content-type':'text/html'}}),'SANDBOX_OAUTH_RESPONSE_INVALID'],
  [new Response('{broken',{headers:{'content-type':'application/json'}}),'SANDBOX_OAUTH_RESPONSE_INVALID'],
  [success({token_type:'Basic'}),'SANDBOX_OAUTH_RESPONSE_INVALID'],
  [success({access_token:'secret with spaces'}),'SANDBOX_OAUTH_RESPONSE_INVALID'],
  [success({expires_in:0}),'SANDBOX_OAUTH_RESPONSE_INVALID'],
  [success({expires_in:'3600'}),'SANDBOX_OAUTH_RESPONSE_INVALID'],
  [new Response('x'.repeat(8200),{headers:{'content-type':'application/json'}}),'SANDBOX_OAUTH_RESPONSE_INVALID'],
 ];
 for(const [response,code] of cases){
  const source=make(async()=>response);
  await assert.rejects(source.getAccessToken(),{code});
 }
});

test('OAuth fetch that ignores AbortSignal is bounded; no retry',async()=>{
 let calls=0;
 const source=make(()=>{calls++;return new Promise(()=>{});},{timeoutMs:100});
 const start=Date.now();
 await assert.rejects(source.getAccessToken(),{code:'SANDBOX_OAUTH_TIMEOUT_NO_RETRY'});
 assert.equal(calls,1);
 assert.ok(Date.now()-start<900);
});

test('OAuth response stream that stalls is bounded without awaiting reader cancel',async()=>{
 const stream=new ReadableStream({pull:()=>new Promise(()=>{}),cancel:()=>new Promise(()=>{})});
 const source=make(async()=>new Response(stream,{headers:{'content-type':'application/json'}}),{timeoutMs:100});
 const start=Date.now();
 await assert.rejects(source.getAccessToken(),{code:'SANDBOX_OAUTH_TIMEOUT_NO_RETRY'});
 assert.ok(Date.now()-start<900);
});

test('trusted composition uses OAuth POST once then order GET twice, no CREATE/CAPTURE',async()=>{
 let now=1800000000000;
 const seen=[];
 const transport=createPinnedSandboxGetWithOAuth({enabled:true,clientId:ID,
  clientSecret:SECRET,now:()=>now,fetchImpl:async(url,opts)=>{
   seen.push([url,opts.method]);
   if(url===OAUTH)return success();
   if(url===GET){
    assert.equal(opts.method,'GET');
    assert.equal(opts.headers.authorization,'Bearer '+TOKEN);
    return new Response(JSON.stringify({id:'ORDER_001',status:'APPROVED'}),{
     status:200,headers:{'content-type':'application/json'}});
   }
   throw Error('UNEXPECTED_URL');
  }});
 assert.equal(isPinnedPayPalSandboxGetTransport(transport),true);
 assert.equal((await transport.getOrder('ORDER_001')).status,'APPROVED');
 assert.equal((await transport.getOrder('ORDER_001')).id,'ORDER_001');
 assert.deepEqual(seen,[[OAUTH,'POST'],[GET,'GET'],[GET,'GET']]);
 assert.equal(seen.some(([url])=>url.includes('/capture')||url.includes('/create')),false);
});

test('OAuth failure prevents downstream order GET in composed transport',async()=>{
 const seen=[];
 const transport=createPinnedSandboxGetWithOAuth({enabled:true,clientId:ID,
  clientSecret:SECRET,fetchImpl:async(url,opts)=>{
   seen.push([url,opts.method]);
   return new Response(null,{status:429});
  }});
 await assert.rejects(transport.getOrder('ORDER_001'),{
  code:'SANDBOX_GET_TOKEN_UNAVAILABLE_NO_RETRY'});
 assert.deepEqual(seen,[[OAUTH,'POST']]);
});

test('GET 401 evicts only rejected cached token; next explicit call refreshes once',async()=>{
 let oauth=0,gets=0;
 const transport=createPinnedSandboxGetWithOAuth({enabled:true,clientId:ID,
  clientSecret:SECRET,fetchImpl:async(url,opts)=>{
   if(url===OAUTH){oauth++;return success({access_token:'token'+oauth+'sandbox'});}
   assert.equal(url,GET);gets++;
   if(gets===1){assert.equal(opts.headers.authorization,'Bearer token1sandbox');
    return new Response(null,{status:401});}
   assert.equal(opts.headers.authorization,'Bearer token2sandbox');
   return new Response(JSON.stringify({id:'ORDER_001'}),{status:200,
    headers:{'content-type':'application/json'}});
  }});
 await assert.rejects(transport.getOrder('ORDER_001'),{
  code:'SANDBOX_GET_AUTH_REJECTED_NO_RETRY'});
 assert.equal(oauth,1);assert.equal(gets,1); // NO automatic retry
 assert.deepEqual(await transport.getOrder('ORDER_001'),{id:'ORDER_001'});
 assert.deepEqual([oauth,gets],[2,2]);
});

test('GET 403 does not refresh OAuth token automatically or on subsequent request',async()=>{
 let oauth=0,gets=0;
 const transport=createPinnedSandboxGetWithOAuth({enabled:true,clientId:ID,
  clientSecret:SECRET,fetchImpl:async(url,opts)=>{
   if(url===OAUTH){oauth++;return success();}
   assert.equal(opts.headers.authorization,'Bearer '+TOKEN);
   gets++;return new Response(null,{status:403});
  }});
 for(let i=0;i<2;i++)await assert.rejects(transport.getOrder('ORDER_001'),{
  code:'SANDBOX_GET_AUTH_REJECTED_NO_RETRY'});
 assert.deepEqual([oauth,gets],[1,2]);
});

test('late rejection of stale token never evicts freshly rotated cached token',async()=>{
 let oauth=0;
 const source=make(async()=>{oauth++;return success({access_token:'token'+oauth+'sandbox'});});
 const first=await source.getAccessToken();
 assert.equal(first,'token1sandbox');
 source.invalidateAccessToken(first);
 const fresh=await source.getAccessToken();
 assert.equal(fresh,'token2sandbox');
 source.invalidateAccessToken(first); // delayed 401 for an earlier GET
 assert.equal(await source.getAccessToken(),fresh);
 assert.equal(oauth,2);
});

test('forged token invalidator is rejected at transport setup',()=>{
 assert.throws(()=>createPinnedPayPalSandboxGetTransport({enabled:true,
  fetchImpl:async()=>success(),getAccessToken:async()=>TOKEN,
  invalidateAccessToken:true}),/SANDBOX_GET_TRANSPORT_EXPLICIT_SETUP_REQUIRED/);
});
