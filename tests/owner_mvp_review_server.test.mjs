import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {startOwnerMvpReview} from '../src/owner_mvp_review_server.mjs';
const saved={status:'LOCAL_PROVIDER_RESULT_RECORDED_NOT_FRESH_GET',amountMinor:150,
 currency:'USD',classifiedSkills:['web','payments','qa'],localAuditIntegrity:'PASS',
 localStates:{quote:'APPROVED',create:'APPROVED',capture:'PAID',gemini:'COMMITTED'},
 privateMerchantId:'SECRET_MERCHANT_SHOULD_NOT_SHOW',orderId:'SECRET_ORDER_SHOULD_NOT_SHOW'};
const withApp=fn=>async()=>{const app=await startOwnerMvpReview({receipt:saved});
 try{await fn(app)}finally{await app.close()}};
test('saved Gemini skills and human quote render without new provider calls',withApp(async app=>{
 const reply=await fetch(app.url);
 assert.equal(reply.status,200);
 const html=await reply.text();
 for(const label of ['Gemini-assisted skill review','web','payments','qa',
  'Demo Web Specialist','Missing:','Human review needed','USD 1.50',
  'LOCAL GET RESULT','No new GET or POST'])assert.ok(html.includes(label),label);
 for(const secret of ['SECRET_MERCHANT','SECRET_ORDER','checkoutnow','PayerID',
  'payment_source','CLIENT_SECRET'])assert.ok(!html.includes(secret));
 assert.equal(reply.headers.get('cache-control'),'no-store');
 assert.match(reply.headers.get('content-security-policy'),/default-src 'none'/);
 assert.equal(app.mode,'LOCAL_OWNER_READ_ONLY_NO_PROVIDER');
}));
test('capability URL is local-only; POST and unknown paths are rejected',withApp(async app=>{
 const u=new URL(app.url);
 assert.equal(u.hostname,'127.0.0.1');
 assert.match(u.pathname,/^\/review\/[0-9a-f]{48}$/);
 assert.equal((await fetch('http://'+u.host+'/')).status,404);
 assert.equal((await fetch(app.url,{method:'POST',body:'pay'})).status,405);
 assert.equal((await fetch(app.url+'?autopay=true')).status,404);
}));
test('DNS rebinding Host values are forbidden from loopback',withApp(async app=>{
 const u=new URL(app.url);
 const status=await new Promise((resolve,reject)=>{
  const req=request({hostname:'127.0.0.1',port:Number(u.port),path:u.pathname,
   headers:{host:'attacker.example'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode))});
  req.on('error',reject);req.end();
 });
 assert.equal(status,403);
}));
test('missing owner evidence must not appear as a provider-confirmed payment',async()=>{
 const broken={...saved,status:'LOCAL_EVIDENCE_REVIEW_REQUIRED'};
 const app=await startOwnerMvpReview({receipt:broken});
 try{
  const html=await (await fetch(app.url)).text();
  assert.match(html,/REVIEW REQUIRED/);
  assert.match(html,/NOT VERIFIED/);
  assert.ok(!html.includes('LOCAL GET RESULT'));
 }finally{await app.close()}
});
test('malicious skill value is never inserted as HTML',async()=>{
 const broken={...saved,classifiedSkills:['web','<script>alert(1)</script>']};
 const app=await startOwnerMvpReview({receipt:broken});
 try{
  const html=await (await fetch(app.url)).text();
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('LOCAL GET RESULT'));
 }finally{await app.close()}
});
