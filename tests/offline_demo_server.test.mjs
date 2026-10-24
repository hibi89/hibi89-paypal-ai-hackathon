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

test('D09 reviewer cookie is server generated, query/header role cannot promote',async()=>{
  const app=await startOfflineDemo({testReviewSessions:true});
  try {
    assert.match(app.testReviewerCookie,/^paypal_test_review=[a-f0-9]{64}$/);
    const owner=await (await fetch(app.url+'/demo/session?role=reviewer',
      {headers:{'x-demo-role':'reviewer'}})).json();
    assert.equal(owner.role,'owner');
    assert.equal((await fetch(app.url+'/demo/session',{
      headers:{cookie:'paypal_test_review='+ 'f'.repeat(64)}})).status,401);
    assert.equal((await fetch(app.url+'/api/contracts/demo-contract',{
      headers:{cookie:'paypal_test_review=forged'}})).status,401);
    const reviewer=await (await fetch(app.url+'/demo/session',{
      headers:{cookie:app.testReviewerCookie}})).json();
    assert.equal(reviewer.role,'reviewer');
    assert.ok(!JSON.stringify(reviewer).includes('paypal_test_review'));
    assert.equal((await fetch(app.url+'/demo/contract.js')).status,200);
  } finally {await app.close();}
});
test('D09 local reviewer may reject then accept without any payment attempt',async()=>{
  const app=await startOfflineDemo({testReviewSessions:true});
  try {
    const session=await (await fetch(app.url+'/demo/session')).json();
    const jsonPost=(url,data,cookie)=>fetch(url,{method:'POST',headers:{
      'content-type':'application/json','x-csrf-token':session.csrfToken,
      ...(cookie?{cookie}:{}),
    },body:JSON.stringify(data)});
    const quotes=app.url+'/api/quotes/'+session.quoteId;
    assert.equal((await jsonPost(quotes+'/approve',{
      confirmed:true,expectedVersion:1,amountMinor:1500})).status,200);
    const ct=app.url+'/api/contracts';
    assert.equal((await jsonPost(ct,{
      id:'demo-contract',quoteId:session.quoteId,reviewerId:session.reviewerId,
      expectedVersion:1,eventId:'createdD09',
      milestones:[{id:'demo-milestone',step:1,amountMinor:1500}]})).status,201);
    const path=ct+'/demo-contract/milestones/demo-milestone/';
    assert.equal((await jsonPost(path+'submit',{
      expectedVersion:1,expectedState:'PENDING',eventId:'submitD09',
      detail:'Synthetic delivery evidence'})).status,200);
    assert.equal((await jsonPost(path+'accept',{
      expectedVersion:2,eventId:'forgedAccept',actorId:'synthetic-reviewer'})).status,400);
    assert.equal((await jsonPost(path+'accept',{
      expectedVersion:2,eventId:'ownerCannotReview'})).status,403);
    assert.equal((await jsonPost(path+'reject',{
      expectedVersion:2,eventId:'rejectD09',detail:'Missing source assets'},
      app.testReviewerCookie)).status,200);
    assert.equal((await jsonPost(path+'submit',{
      expectedVersion:3,expectedState:'REJECTED',eventId:'resubmitD09',
      detail:'All revised source assets'})).status,200);
    assert.equal((await jsonPost(path+'accept',{
      expectedVersion:4,eventId:'acceptD09'},app.testReviewerCookie)).status,200);
    const contract=await (await fetch(ct+'/demo-contract')).json();
    assert.equal(contract.contract.milestones[0].state,'ACCEPTED');
    assert.equal(contract.contract.paymentState,'NOT_CAPTURED');
    const events=await (await fetch(ct+'/demo-contract/events')).json();
    assert.deepEqual(events.events.map(e=>e.eventType),
      ['CREATED','SUBMITTED','REJECTED','SUBMITTED','ACCEPTED']);
    assert.equal((await jsonPost(quotes+'/orders',{})).status,503);
  }finally{await app.close();}
});

test('D14 real HTTP writes are throttled before JSON handling; GET remains available', async () => {
  const app = await startOfflineDemo();
  try {
    const route = app.url + '/api/quotes/sample-project/approve';
    const opts = {method:'POST',headers:{
      'content-type':'application/json','x-csrf-token':'invalid',
      'x-forwarded-for':'198.51.100.123'},
      body:JSON.stringify({expectedVersion:1,confirmed:true,amountMinor:1500})};
    for (let n = 0; n < 60; n++) {
      const reply = await fetch(route, opts);
      assert.equal(reply.status, 403);
      await reply.text();
    }
    const limited = await fetch(route, opts);
    assert.equal(limited.status, 429);
    assert.deepEqual(await limited.json(), {error:'LOCAL_RATE_LIMITED'});
    assert.ok(Number(limited.headers.get('retry-after')) >= 1);
    assert.equal((await fetch(app.url + '/demo/session')).status, 200);
    assert.equal((await fetch(app.url + '/api/quotes/sample-project/payment')).status, 503);
  } finally { await app.close(); }
});
