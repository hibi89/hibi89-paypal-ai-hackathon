import test from 'node:test';
import assert from 'node:assert/strict';
import { startOfflineDemo } from '../src/offline_demo_server.mjs';
import { request as httpRequest } from 'node:http';

test('offline HTML displays explicit mock-only and payment-disabled messages',async()=>{
  const app=await startOfflineDemo();
  try {
    assert.match(app.url,/^http:\/\/127\.0\.0\.1:\d+$/);
    const resp=await fetch(app.url+'/');
    assert.equal(resp.status,200);
    const html=await resp.text();
    assert.match(html,/NOT REAL AI OR PAYPAL/);
    assert.match(html,/Payment is DISABLED/);
    assert.match(resp.headers.get('content-security-policy'),/script-src 'self'/);
    const js=await fetch(app.url+'/demo/client.js');
    assert.equal(js.status,200);
    assert.match(await js.text(),/EXPLICIT_CONFIRMATION_REQUIRED/);
  } finally {await app.close();}
});
test('actual loopback HTTP draft → approved version, read-only refresh, fail-closed payment',async()=>{
  const app=await startOfflineDemo();
  try {
    const session=await (await fetch(app.url+'/demo/session')).json();
    assert.equal(session.mode,'OFFLINE_MOCK');
    const route=app.url+'/api/quotes/'+session.quoteId;
    const get=async()=> (await (await fetch(route)).json()).quote;
    const post=async(path,data,headers={})=>{
      const result=await fetch(route+path,{
        method:'POST',headers:{'content-type':'application/json',
          'x-csrf-token':session.csrfToken,...headers},
        body:JSON.stringify(data),
      });
      return {status:result.status,body:await result.json()};
    };
    assert.equal((await get()).version,1);
    const scope='Build a synthetic freelancer portfolio page for a demo';
    const draft=await post('/draft',{expectedVersion:1,scope});
    assert.equal(draft.status,200);
    assert.equal(draft.body.quote.version,2);
    assert.equal(draft.body.provider,'OFFLINE_MOCK');
    for(let i=0;i<3;i++) assert.equal((await get()).version,2);
    const stale=await post('/approve',{expectedVersion:1,confirmed:true,amountMinor:5000});
    assert.equal(stale.status,409);
    const accepted=await post('/approve',{expectedVersion:2,confirmed:true,amountMinor:5000});
    assert.equal(accepted.status,200);
    assert.equal((await get()).approval.amountMinor,5000);
    const order=await post('/orders',{});
    assert.equal(order.status,503);
    assert.equal(order.body.error,'PAYMENT_GATE_NOT_READY');
    const payment=await fetch(route+'/payment');
    assert.equal(payment.status,503);
  } finally {await app.close();}
});
test('loopback demo rejects forged Host header and invalid origin',async()=>{
  const app=await startOfflineDemo();
  try {
    const session=await (await fetch(app.url+'/demo/session')).json();
    const quote=app.url+'/api/quotes/'+session.quoteId;
    // Node fetch rewrites Host automatically; use raw node:http to test forged Host.
    const forbidden=await new Promise((resolve,reject)=>{
      const req=httpRequest(app.url+'/',{headers:{host:'attacker.example'}},resp=>{
        const status=resp.statusCode;
        resp.resume();resp.once('end',()=>resolve(status));
      });
      req.once('error',reject);req.end();
    });
    assert.equal(forbidden,403);
    const denied=await fetch(quote+'/draft',{
      method:'POST',headers:{'content-type':'application/json',
        'x-csrf-token':session.csrfToken,'origin':'https://attacker.example'},
      body:JSON.stringify({expectedVersion:1,scope:'Synthetic quote website development'}),
    });
    assert.equal(denied.status,403);
  }finally{await app.close();}
});
