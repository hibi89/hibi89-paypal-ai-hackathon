import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createWorkerPrivatePaymentClaimRoute} from '../src/worker_private_payment_claim_route.mjs';
import {createWorkerPaymentClaimGate} from '../src/worker_payment_claim_gate.mjs';

const ORIGIN='https://proofline-fixture.invalid';
const MERCHANT='PAYPALMERCH13', OWNER='ciOwner', ISSUER='https://idp.invalid';
const SUBJECT='a'.repeat(64), T=1800000000000;
const COOKIE=Buffer.alloc(32,11).toString('base64url');
const DIGEST=createHash('sha256').update(COOKIE).digest('hex');
const CLAIM={requestId:'req1',quoteId:'quote1',quoteVersion:1,ownerId:OWNER,merchantId:MERCHANT};
function fixture({afterAuditRead}={}){
 const sql=new DatabaseSync(':memory:');
 for(const name of ['0001_payment_claims.sql','0002_worker_private_sessions.sql',
  '0003_worker_private_oidc.sql','0004_worker_private_binding_epoch.sql',
  '0005_payment_attempt_audit.sql'])
  sql.exec(readFileSync(new URL('../migrations/d1/'+name,import.meta.url),'utf8'));
 sql.prepare('INSERT INTO worker_private_oidc_bindings(issuer,subject_hmac,actor_id,merchant_id,role) VALUES(?,?,?,?,?)')
  .run(ISSUER,SUBJECT,OWNER,MERCHANT,'OWNER');
 sql.prepare('INSERT INTO worker_private_sessions(token_sha256,actor_id,merchant_id,role,issuer,issuer_verified_at_ms,expires_at_ms,binding_subject_hmac,binding_revision) VALUES(?,?,?,?,?,?,?,?,1)')
  .run(DIGEST,OWNER,MERCHANT,'OWNER',ISSUER,T-10000,T+60000,SUBJECT);
 sql.prepare('INSERT INTO quotes(id,owner_id,merchant_id,version,currency,status,approval_actor,approval_version,approval_amount_minor) VALUES(?,?,?,?,?,?,?,?,?)')
  .run('quote1',OWNER,MERCHANT,1,'USD','APPROVED',OWNER,1,150);
 let reads=0;
 const db={withSession(mode){assert.equal(mode,'first-primary');return {
  prepare(query){return {bind(...params){return {
   async run(){const x=sql.prepare(query).run(...params);return {meta:{changes:x.changes}};},
   async first(){return sql.prepare(query).get(...params)??null;},
   async all(){const results=sql.prepare(query).all(...params);
    if(query.includes('FROM payment_attempt_audit e')){reads++;afterAuditRead?.(sql);}
    return {results};}
  }}}}
 };}};
 return {sql,db,reads:()=>reads,gate:createWorkerPaymentClaimGate({db}),
  handler:createWorkerPrivatePaymentClaimRoute({db,allowedOrigin:ORIGIN,enabled:true,now:()=>T})};
}
function req(path='/__private/paypal/claim-audit', body={requestId:'req1',quoteId:'quote1',quoteVersion:1}, overrides={}){
 const intent=path.endsWith('claim-audit')?'read-audit-only':
  path.endsWith('create-claim')?'first-claim-no-provider':'inspect-recovery-only';
 return new Request(ORIGIN+path,{method:'POST',headers:{
  origin:ORIGIN,'sec-fetch-site':'same-origin',
  'x-proofline-intent':intent,'content-type':'application/json',
  cookie:'__Host-proofline_session='+COOKIE,...overrides},body:JSON.stringify(body)});
}
const auditRows=sql=>sql.prepare('SELECT count(*) n FROM payment_attempt_audit').get().n;
test('owner can read D1 claim, remote ID and UNKNOWN timeline without raw order ID leakage',async()=>{
 const f=fixture();
 assert.equal((await f.handler.fetch(req('/__private/paypal/create-claim'))).status,201);
 await f.gate.persistRemoteOrder({...CLAIM,remoteId:'ORDER_001'});
 await f.gate.markUnknown(CLAIM);
 const response=await f.handler.fetch(req());
 assert.equal(response.status,200);
 assert.equal(response.headers.get('cache-control'),'no-store, max-age=0');
 const body=await response.json();
 assert.equal(body.status,'AUDIT_READ_ONLY');
 assert.equal(body.paymentAuthorized,false);
 assert.equal(body.captureAuthorized,false);
 assert.equal(body.providerCalls,0);
 assert.equal(body.remoteOrderCreated,false);
 assert.equal(body.hasMore,false);
 assert.deepEqual(body.events.map(x=>x.eventType),[
  'CLAIM_CREATED','REMOTE_ID_BOUND','STATE_CHANGED']);
 assert.deepEqual(body.events.map(x=>x.toState),[
  'IN_FLIGHT','IN_FLIGHT','UNKNOWN']);
 assert.deepEqual(body.events.map(x=>x.remoteOrderKnown),[false,true,true]);
 assert.ok(!JSON.stringify(body).includes('ORDER_001'));
 assert.equal(auditRows(f.sql),3);
 f.sql.close();
});
test('missing or cross-owner attempt cannot expose another owner timeline',async()=>{
 const f=fixture();
 f.sql.prepare('INSERT INTO quotes(id,owner_id,merchant_id,version,currency,status,approval_actor,approval_version,approval_amount_minor) VALUES(?,?,?,?,?,?,?,?,?)')
  .run('otherQuote','otherOwner',MERCHANT,1,'USD','APPROVED','otherOwner',1,150);
 f.sql.prepare('INSERT INTO payment_attempts(request_id,quote_id,quote_version,merchant_id,operation,state,amount_minor,currency) VALUES(?,?,?,?,?,?,?,?)')
  .run('otherReq','otherQuote',1,MERCHANT,'create','UNKNOWN',150,'USD');
 const other=await f.handler.fetch(req(undefined,{requestId:'otherReq',quoteId:'otherQuote',quoteVersion:1}));
 assert.equal(other.status,409);
 assert.equal((await other.json()).events,undefined);
 assert.equal((await f.handler.fetch(req())).status,409);
 f.sql.close();
});
test('revoked sessions, bad intent and client owner injection block read',async()=>{
 const f=fixture();
 await f.gate.claim(CLAIM);
 for(const response of [
  await f.handler.fetch(req(undefined,undefined,{'x-proofline-intent':'capture'})),
  await f.handler.fetch(req(undefined,{requestId:'req1',quoteId:'quote1',quoteVersion:1,ownerId:OWNER})),
  await f.handler.fetch(req(undefined,undefined,{origin:'https://attacker.invalid'})),
  await f.handler.fetch(req(undefined,undefined,{cookie:''}))
 ])assert.notEqual(response.status,200);
 assert.equal(f.reads(),0);
 f.sql.prepare('UPDATE worker_private_sessions SET revoked_at_ms=?').run(T-1);
 assert.equal((await f.handler.fetch(req())).status,401);
 assert.equal(f.reads(),0);
 f.sql.close();
});
test('revocation during audit D1 read denies response even after rows are fetched',async()=>{
 const f=fixture({afterAuditRead:sql=>sql.prepare('UPDATE worker_private_sessions SET revoked_at_ms=?').run(T-1)});
 await f.gate.claim(CLAIM);
 const response=await f.handler.fetch(req());
 assert.equal(response.status,401);
 const body=await response.json();
 assert.equal(body.events,undefined);
 assert.equal(body.paymentAuthorized,false);
 assert.equal(auditRows(f.sql),1);
 f.sql.close();
});
test('auditing without the offline schema fails closed with no state mutation',async()=>{
 const f=fixture();
 await f.gate.claim(CLAIM);
 f.sql.exec('DROP TABLE payment_attempt_audit');
 const response=await f.handler.fetch(req());
 assert.equal(response.status,503);
 assert.equal((await response.json()).events,undefined);
 assert.equal(f.sql.prepare('SELECT state FROM payment_attempts').get().state,'IN_FLIGHT');
 f.sql.close();
});
test('audit feed is bounded at last 50 events with hasMore marker',async()=>{
 const f=fixture();
 await f.gate.claim(CLAIM);
 const insert=f.sql.prepare(`INSERT INTO payment_attempt_audit
 (request_id,quote_id,quote_version,merchant_id,operation,event_type,before_state,after_state,remote_id)
 VALUES('req1','quote1',1,?,'create','STATE_CHANGED','IN_FLIGHT','UNKNOWN',NULL)`);
 for(let i=0;i<55;i++)insert.run(MERCHANT);
 const response=await f.handler.fetch(req());
 assert.equal(response.status,200);
 const body=await response.json();
 assert.equal(body.events.length,50);
 assert.equal(body.hasMore,true);
 assert.ok(body.events.every(x=>x.eventType==='STATE_CHANGED'));
 f.sql.close();
});
