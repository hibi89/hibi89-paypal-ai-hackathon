import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createWorkerPrivatePaymentClaimRoute} from '../src/worker_private_payment_claim_route.mjs';

const ORIGIN='https://proofline-fixture.invalid';
const MERCHANT='PAYPALMERCH13',OWNER='owner1',ISSUER='https://issuer.invalid';
const SUB='a'.repeat(64),TIME=1800000000000;
const COOKIE=Buffer.alloc(32,17).toString('base64url');
const DIGEST=createHash('sha256').update(COOKIE).digest('hex');
const DATA={requestId:'req1',quoteId:'quote1',quoteVersion:1};
const routes=[['create-claim','first-claim-no-provider'],
 ['claim-recovery','inspect-recovery-only'],['claim-audit','read-audit-only']];
const init=(db,ms=100)=>createWorkerPrivatePaymentClaimRoute({db,enabled:true,
 allowedOrigin:ORIGIN,bodyReadTimeoutMs:ms,now:()=>TIME});
function request(route,body,signal){
 return new Request(ORIGIN+'/__private/paypal/'+route[0],{
  method:'POST',duplex:'half',signal,
  headers:{origin:ORIGIN,'sec-fetch-site':'same-origin',
   'content-type':'application/json','x-proofline-intent':route[1],
   cookie:'__Host-proofline_session='+COOKIE},body});
}
function rejectBeforeDb(){let calls=0;
 const db={withSession(){calls++;throw Error('UNEXPECTED_D1_ACCESS')}};
 return {handler:init(db),calls:()=>calls};
}
function sqliteFixture(){
 const sql=new DatabaseSync(':memory:');
 for(const filename of ['0001_payment_claims.sql','0002_worker_private_sessions.sql',
   '0003_worker_private_oidc.sql','0004_worker_private_binding_epoch.sql',
   '0005_payment_attempt_audit.sql'])
  sql.exec(readFileSync(new URL('../migrations/d1/'+filename,import.meta.url),'utf8'));
 sql.prepare(`INSERT INTO worker_private_oidc_bindings
  (issuer,subject_hmac,actor_id,merchant_id,role) VALUES(?,?,?,?,?)`)
  .run(ISSUER,SUB,OWNER,MERCHANT,'OWNER');
 sql.prepare(`INSERT INTO worker_private_sessions
  (token_sha256,actor_id,merchant_id,role,issuer,issuer_verified_at_ms,
   expires_at_ms,binding_subject_hmac,binding_revision)
  VALUES(?,?,?,?,?,?,?,?,1)`)
  .run(DIGEST,OWNER,MERCHANT,'OWNER',ISSUER,TIME-1000,TIME+60000,SUB);
 sql.prepare(`INSERT INTO quotes
  (id,owner_id,merchant_id,version,currency,status,approval_actor,
   approval_version,approval_amount_minor) VALUES(?,?,?,?,?,?,?,?,?)`)
  .run('quote1',OWNER,MERCHANT,1,'USD','APPROVED',OWNER,1,150);
 const db={withSession(mode){assert.equal(mode,'first-primary');return {
  prepare(query){return {bind(...args){return {
   async first(){return sql.prepare(query).get(...args)??null;},
   async run(){const res=sql.prepare(query).run(...args);
    return {meta:{changes:res.changes}};},
   async all(){return {results:sql.prepare(query).all(...args)};}
  }}}}
 };}};
 return {sql,handler:init(db,400)};
}

test('all three private payment routes reject hanging request bodies before D1',async()=>{
 for(const route of routes){
  const f=rejectBeforeDb();
  const stream=new ReadableStream({pull(){return new Promise(()=>{});},
   cancel(){return new Promise(()=>{});}});
  const started=Date.now();
  const response=await f.handler.fetch(request(route,stream));
  assert.equal(response.status,400,route[0]);
  assert.equal((await response.json()).providerCalls,0);
  assert.equal(f.calls(),0);
  assert.ok(Date.now()-started<900);
 }
});

test('overall body deadline cannot be bypassed by slow intermittent chunks',async()=>{
 const f=rejectBeforeDb();
 let chunks=0;
 const stream=new ReadableStream({async pull(controller){
  await new Promise(resolve=>setTimeout(resolve,75));
  controller.enqueue(new TextEncoder().encode(chunks++===0?'{':' '));
 },cancel(){return new Promise(()=>{});}});
 const response=await f.handler.fetch(request(routes[0],stream));
 assert.equal(response.status,400);
 assert.equal(f.calls(),0);
});

test('abort of partial claim returns 400 without D1 or provider access',async()=>{
 const f=rejectBeforeDb();
 const controller=new AbortController();
 const stream=new ReadableStream({pull(){return new Promise(()=>{});}});
 const task=f.handler.fetch(request(routes[0],stream,controller.signal));
 setTimeout(()=>controller.abort(),25);
 const response=await task;
 assert.equal(response.status,400);
 assert.equal(f.calls(),0);
});

test('multiple chunks over 512 bytes fail closed without any D1 call',async()=>{
 const f=rejectBeforeDb();
 const stream=new ReadableStream({start(c){
  c.enqueue(new Uint8Array(260));c.enqueue(new Uint8Array(260));c.close();
 }});
 assert.equal((await f.handler.fetch(request(routes[0],stream))).status,400);
 assert.equal(f.calls(),0);
});

test('valid fragmented JSON works across claim, recovery, and audit',async()=>{
 const f=sqliteFixture();
 for(const [index,route] of routes.entries()){
  const payload=new TextEncoder().encode(JSON.stringify(DATA));
  const stream=new ReadableStream({start(c){
   c.enqueue(payload.subarray(0,7));c.enqueue(payload.subarray(7,22));
   c.enqueue(payload.subarray(22));c.close();
  }});
  const response=await f.handler.fetch(request(route,stream));
  assert.equal(response.status,index===0?201:200);
  const result=await response.json();
  assert.equal(result.paymentAuthorized,false);
  assert.equal(result.providerCalls,0);
  if(index===2)assert.equal(result.events[0].eventType,'CLAIM_CREATED');
 }
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM payment_attempts').get().n,1);
 f.sql.close();
});

test('route rejects unsafe or missing body deadline configuration',()=>{
 const db={withSession(){throw Error('UNEXPECTED_D1_ACCESS')}};
 for(const ms of [0,99,5001,'2000',Infinity,1.5])
  assert.throws(()=>init(db,ms),/PRIVATE_PAYMENT_CLAIM_EXPLICIT_CONFIGURATION_REQUIRED/);
});
