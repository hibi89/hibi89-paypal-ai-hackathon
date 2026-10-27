import test from 'node:test';
import assert from 'node:assert/strict';
import {startOwnerMvpCallbackLanding} from '../src/owner_mvp_callback_landing.mjs';

async function withLanding(fn){
  const landing=await startOwnerMvpCallbackLanding({
    port:0,publicOrigin:'https://checkout.example.org'
  });
  try{await fn(landing)}finally{await landing.close()}
}
test('buyer return and cancellation are static navigation only and ignore injected payment tokens',async()=>{
  await withLanding(async s=>{
    for(const [path,expected] of [['return','buyer returned'],['cancel','buyer cancelled']]){
      const r=await fetch(s.localUrl+'/checkout/paypal/'+path+
        '?token=FORGEDTOKEN&PayerID=FORGEDPAYER&status=COMPLETED');
      assert.equal(r.status,200);
      assert.match(await r.text(),new RegExp(expected,'i'));
      assert.equal(r.headers.get('cache-control'),'no-store, private');
      assert.match(r.headers.get('content-security-policy'),/script-src 'none'/);
      const body=await (await fetch(s.localUrl+'/checkout/paypal/'+path)).text();
      assert.ok(!body.includes('FORGED'));
      assert.ok(!body.includes('payment has completed'));
      assert.match(body,/fresh authenticated PayPal GET/);
    }
    assert.equal(s.mode,'LOOPBACK_BUYER_NAVIGATION_ONLY');
    assert.equal(s.captureEnabled,false);
    assert.equal(s.publicHttpsConfiguredByThisServer,false);
    assert.equal(s.providerRequestsPerformed,false);
  });
});
test('no POST, capture, webhook or payment endpoint; only exact allowlisted GETs',async()=>{
  await withLanding(async s=>{
    const returns=await fetch(s.localUrl+'/checkout/paypal/return',{method:'POST'});
    assert.equal(returns.status,405);
    assert.equal(returns.headers.get('allow'),'GET');
    for(const path of ['/api/orders','/checkout/paypal/return/extra',
      '/checkout/paypal/capture','/api/payments/capture','/mvp/health']){
      const r=await fetch(s.localUrl+path);
      assert.equal(r.status,404);
    }
  });
});
test('untrusted hosts are rejected even when a fake forwarded origin is attached',async()=>{
  await withLanding(async s=>{
    const x=await fetch(s.localUrl+'/checkout/paypal/return',{
      headers:{host:'attacker.invalid','x-forwarded-host':'checkout.example.org',
        'x-forwarded-proto':'https'}});
    assert.equal(x.status,403);
    const z=await fetch(s.localUrl+'/checkout/paypal/return',{headers:{
      host:'checkout.example.org'
    }});
    assert.equal(z.status,200);
  });
});
test('invalid insecure callback and ports fail before binding',async()=>{
 for(const publicOrigin of ['http://checkout.example.org',
   'https://localhost','https://192.168.1.10','https://checkout.example.org/return',
   'https://checkout.example.org:8443','https://checkout.example.org?token=1']){
   await assert.rejects(startOwnerMvpCallbackLanding({port:0,publicOrigin}),
     {code:'CALLBACK_PUBLIC_HTTPS_ORIGIN_REQUIRED'});
 }
 await assert.rejects(startOwnerMvpCallbackLanding({
   port:65536,publicOrigin:'https://checkout.example.org'
 }),{code:'CALLBACK_LOOPBACK_PORT_REQUIRED'});
});
