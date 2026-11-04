import test from 'node:test';
import assert from 'node:assert/strict';
import {createExistingSandboxGetOnlyFetch} from '../src/sandbox_existing_get_only_fetch.mjs';

const host='https://api-m.sandbox.paypal.com';
const bearer={method:'GET',redirect:'error',headers:{authorization:'Bearer synthetic'}};
const oauth={method:'POST',redirect:'error',body:'grant_type=client_credentials',
 headers:{authorization:'Basic synthetic'}};
test('only PayPal Sandbox OAuth plus existing-order GET can pass network boundary',async()=>{
 const requests=[];
 const firewall=createExistingSandboxGetOnlyFetch({
  fetchImpl:async(url,init)=>{
   requests.push({url,method:init.method});return {status:200};}
 });
 await firewall.fetch(host+'/v1/oauth2/token',oauth);
 await firewall.fetch(host+'/v2/checkout/orders/EXISTING_ORDER_1',bearer);
 assert.equal(requests.length,2);
 assert.deepEqual(firewall.status(),{
  oauthPostRequests:1,orderGetRequests:1,orderCreatePosts:0,capturePosts:0,
  paymentPostPermitted:false,source:'PRIVATE_SANDBOX_GET_ONLY'
 });
});
test('forged host, public Live, Orders CREATE, Capture and redirects NEVER call network',async()=>{
 let reached=0;
 const firewall=createExistingSandboxGetOnlyFetch({
  fetchImpl:async()=>{reached++;return {status:200};}
 });
 const bad=[
  [host+'/v2/checkout/orders',{...oauth,body:'{}'}],
  [host+'/v2/checkout/orders/EXISTING_ORDER_1/capture',{...oauth,body:'{}'}],
  [host+'/v2/checkout/orders/EXISTING_ORDER_1',{...oauth,body:'{}'}],
  ['https://api-m.paypal.com/v2/checkout/orders/EXISTING_ORDER_1',bearer],
  ['http://api-m.sandbox.paypal.com/v2/checkout/orders/EXISTING_ORDER_1',bearer],
  ['https://evil.invalid/v2/checkout/orders/EXISTING_ORDER_1',bearer],
  [host+'/v2/checkout/orders/EXISTING_ORDER_1?secret=1',bearer],
  [host+'/v2/checkout/orders/EXISTING_ORDER_1#frag',bearer],
  [host+'/v2/checkout/orders/EXISTING_ORDER_1',{...bearer,body:'{}'}],
  [host+'/v2/checkout/orders/EXISTING_ORDER_1',{...bearer,redirect:'follow'}],
  [host+'/v1/oauth2/token',{...oauth,body:'{}'}],
  [host+'/v1/oauth2/token',{...oauth,headers:{}}],
 ];
 for(const [url,init] of bad)
  await assert.rejects(firewall.fetch(url,init),e=>e.code==='GET_ONLY_FETCH_DENIED');
 assert.equal(reached,0);
 assert.equal(firewall.status().orderCreatePosts,0);
 assert.equal(firewall.status().capturePosts,0);
});
test('bounded GET and OAuth requests reject excess without network retries',async()=>{
 let n=0;
 const firewall=createExistingSandboxGetOnlyFetch({
  fetchImpl:async()=>{n++;return {status:200};},
  maxOauthPosts:1,maxOrderGets:1
 });
 await firewall.fetch(host+'/v1/oauth2/token',oauth);
 await firewall.fetch(host+'/v2/checkout/orders/EXISTING',bearer);
 await assert.rejects(firewall.fetch(host+'/v2/checkout/orders/EXISTING',bearer),
  e=>e.code==='GET_ONLY_FETCH_REQUEST_CAP');
 await assert.rejects(firewall.fetch(host+'/v1/oauth2/token',oauth),
  e=>e.code==='GET_ONLY_FETCH_REQUEST_CAP');
 assert.equal(n,2);
});
test('ambiguous network error trips permanent circuit without leaking internal error',async()=>{
 let n=0;
 const firewall=createExistingSandboxGetOnlyFetch({
  fetchImpl:async()=>{n++;throw new Error('SECRET_PROVIDER_ERROR_DO_NOT_PRINT');}
 });
 await assert.rejects(firewall.fetch(host+'/v2/checkout/orders/ORDER',bearer),
  e=>e.code==='GET_ONLY_FETCH_NETWORK_UNKNOWN'&&
    !e.message.includes('SECRET_PROVIDER_ERROR'));
 await assert.rejects(firewall.fetch(host+'/v2/checkout/orders/ORDER',bearer),
  e=>e.code==='GET_ONLY_FETCH_CIRCUIT_OPEN');
 assert.equal(n,1);
});
