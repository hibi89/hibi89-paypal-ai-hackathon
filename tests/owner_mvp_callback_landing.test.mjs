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
  // Native fetch may normalize the Host header. Use a raw node:http request.
  const {request}=await import('node:http');
  const status=async(localUrl,headers)=>new Promise((resolve,reject)=>{
    const r=request(localUrl+'/checkout/paypal/return',{method:'GET',
      headers},res=>{res.resume();res.once('end',()=>resolve(res.statusCode))});
    r.once('error',reject);r.end();
  });
  await withLanding(async s=>{
    assert.equal(await status(s.localUrl,{
      Host:'attacker.invalid',
      'X-Forwarded-Host':'checkout.example.org',
      'X-Forwarded-Proto':'https'
    }),403);
    assert.equal(await status(s.localUrl,{Host:'checkout.example.org'}),200);
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

test('owner HTTPS ingress probe checks return AND cancel via unpredictable live listener proof',async()=>{
  await withLanding(async landing=>{
    const targets=[];
    const proxy=async(url,options)=>{
      const u=new URL(url);
      targets.push({url:u,method:options.method,redirect:options.redirect});
      assert.equal(u.origin,'https://checkout.example.org');
      assert.equal(options.method,'GET');
      assert.equal(options.redirect,'error');
      // Simulated trusted reverse proxy: real network stays inside loopback.
      return fetch(landing.localUrl+u.pathname+u.search);
    };
    const result=await landing.verifyPublicIngress({fetchImpl:proxy});
    assert.equal(result.returnAndCancelReachable,true);
    assert.equal(result.paymentVerified,false);
    assert.equal(result.capturePerformed,false);
    assert.equal(result.providerCalls,0);
    assert.deepEqual(targets.map(x=>x.url.pathname),
      ['/checkout/paypal/return','/checkout/paypal/cancel']);
    assert.equal(targets[0].url.searchParams.get('pilot_probe').length,43);
    const attack=await fetch(landing.localUrl+
      '/checkout/paypal/return?token=FORGED&pilot_probe=FORGED');
    assert.equal(attack.headers.get('x-owner-mvp-callback-proof'),null);
  });
});
test('fake static CDN 200 or only one working callback path cannot pass ingress probe',async()=>{
  await withLanding(async landing=>{
    let calls=0;
    const mismatched=async()=>new Response('FAKE STATIC 200',{
      status:200,headers:{'x-owner-mvp-callback-proof':'FORGED'}});
    await assert.rejects(landing.verifyPublicIngress({fetchImpl:mismatched}),
      {code:'CALLBACK_PUBLIC_HTTPS_PROOF_MISMATCH'});
    const onePath=async(url)=>{
      calls++;
      const u=new URL(url);
      if(u.pathname.endsWith('/return'))
        return fetch(landing.localUrl+u.pathname+u.search);
      return new Response('not routed',{status:404});
    };
    await assert.rejects(landing.verifyPublicIngress({fetchImpl:onePath}),
      {code:'CALLBACK_PUBLIC_HTTPS_PROOF_MISMATCH'});
    assert.equal(calls,2);
  });
});
test('probe never uses implicit fetch and treats TLS/redirect failures as blocked',async()=>{
  await withLanding(async landing=>{
    await assert.rejects(landing.verifyPublicIngress(),
      {code:'CALLBACK_EXPLICIT_VERIFY_TRANSPORT_REQUIRED'});
    await assert.rejects(landing.verifyPublicIngress({
      fetchImpl:async()=>{throw Error('SIMULATED_TLS_FAILURE')},
    }),{code:'CALLBACK_PUBLIC_HTTPS_NOT_REACHABLE'});
    await assert.rejects(landing.verifyPublicIngress({
      fetchImpl:async()=>new Response(null,{status:302,headers:{location:'https://elsewhere.example'}})
    }),{code:'CALLBACK_PUBLIC_HTTPS_PROOF_MISMATCH'});
  });
});
