import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createWorkerPrivatePaymentClaimRoute} from '../src/worker_private_payment_claim_route.mjs';
import {createWorkerPaymentClaimGate} from '../src/worker_payment_claim_gate.mjs';
import {createPrivateWorkerIdentityReadRouter} from '../src/worker_private_identity_read_router.mjs';

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

test('payment claim, recovery and audit reject simultaneous owner plus contract-role cookies',async()=>{
 const f=fixture();
 const ambiguous='__Host-proofline_session='+COOKIE+'; __Host-proofline_contract_role=attacker';
 for(const path of ['/__private/paypal/create-claim',
   '/__private/paypal/claim-recovery','/__private/paypal/claim-audit']){
  const response=await f.handler.fetch(req(path,undefined,{cookie:ambiguous}));
  assert.equal(response.status,401);
  assert.equal((await response.json()).paymentAuthorized,false);
 }
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM payment_attempts').get().n,0);
 assert.equal(f.reads(),0);
 f.sql.close();
});

test('actual private router dispatches owner D1 claim, recovery and audit only with opt-in',async()=>{
 const f=fixture();
 const authority={revoke:async()=>{throw Error('UNUSED')}};
 const pkceCoordinator={start:async()=>new Response(null,{status:503}),
  callback:async()=>new Response(null,{status:503})};
 const basic={db:f.db,allowedOrigin:ORIGIN,authority,pkceCoordinator,
  enabled:true,now:()=>T};
 const dark=createPrivateWorkerIdentityReadRouter(basic);
 for(const path of ['/__private/paypal/create-claim',
   '/__private/paypal/claim-recovery','/__private/paypal/claim-audit']){
  assert.equal((await dark.fetch(req(path))).status,404);
 }
 const host=createPrivateWorkerIdentityReadRouter({...basic,paymentClaimEnabled:true});
 assert.equal((await host.fetch(req('/__private/paypal/create-claim'))).status,201);
 const ledger=f.sql.prepare('SELECT COUNT(*) n FROM payment_attempts').get().n;
 assert.equal(ledger,1);
 await f.gate.persistRemoteOrder({...CLAIM,remoteId:'ORDER_001'});
 await f.gate.markUnknown(CLAIM);
 const recovery=await host.fetch(req('/__private/paypal/claim-recovery'));
 assert.equal(recovery.status,200);
 assert.equal((await recovery.json()).next,'REMOTE_ORDER_GET_RECONCILIATION_REQUIRED');
 const result=await host.fetch(req('/__private/paypal/claim-audit'));
 assert.equal(result.status,200);
 const data=await result.json();
 assert.deepEqual(data.events.map(x=>x.eventType),
  ['CLAIM_CREATED','REMOTE_ID_BOUND','STATE_CHANGED']);
 assert.equal(data.paymentAuthorized,false);
 assert.ok(!JSON.stringify(data).includes('ORDER_001'));
 assert.equal((await host.fetch(req('/__private/paypal/create-claim'))).status,409);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM payment_attempts').get().n,1);
 f.sql.close();
});

test('opted-in private router rejects role-cookie ambiguity and cross-owner audit',async()=>{
 const f=fixture();
 const host=createPrivateWorkerIdentityReadRouter({db:f.db,allowedOrigin:ORIGIN,
  authority:{revoke:async()=>({revoked:false})},
  pkceCoordinator:{start:async()=>new Response(null,{status:503}),
   callback:async()=>new Response(null,{status:503})},
  enabled:true,paymentClaimEnabled:true,now:()=>T});
 const twoCookies='__Host-proofline_session='+COOKIE+'; __Host-proofline_contract_role=role';
 for(const path of ['/__private/paypal/create-claim',
  '/__private/paypal/claim-recovery','/__private/paypal/claim-audit']){
  const bad=await host.fetch(req(path,undefined,{cookie:twoCookies}));
  assert.equal(bad.status,401);
 }
 assert.equal((await host.fetch(req('/__private/paypal/claim-audit',
   {requestId:'other',quoteId:'quote1',quoteVersion:1}))).status,409);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM payment_attempts').get().n,0);
 f.sql.close();
});

test('audit history paginates beyond 50 entries without duplicates or missing events',async()=>{
 const f=fixture();
 await f.gate.claim(CLAIM);
 const insert=f.sql.prepare(`INSERT INTO payment_attempt_audit
 (request_id,quote_id,quote_version,merchant_id,operation,event_type,before_state,after_state,remote_id,observed_at)
 VALUES('req1','quote1',1,?,'create','STATE_CHANGED','IN_FLIGHT','UNKNOWN',NULL,?)`);
 for(let i=0;i<60;i++)insert.run(MERCHANT,'event-'+String(i).padStart(3,'0'));
 const first=await f.handler.fetch(req());
 assert.equal(first.status,200);
 const p1=await first.json();
 assert.equal(p1.events.length,50);
 assert.equal(p1.hasMore,true);
 assert.ok(Number.isSafeInteger(p1.nextBeforeSequence));
 assert.ok(p1.nextBeforeSequence>0);
 const second=await f.handler.fetch(req(undefined,{requestId:'req1',quoteId:'quote1',quoteVersion:1,
  beforeSequence:p1.nextBeforeSequence}));
 assert.equal(second.status,200);
 const p2=await second.json();
 assert.equal(p2.events.length,11);
 assert.equal(p2.hasMore,false);
 assert.equal(p2.nextBeforeSequence,null);
 const all=[...p2.events,...p1.events]; // older page first, all chronological
 const expected=f.sql.prepare('SELECT observed_at FROM payment_attempt_audit ORDER BY sequence').all()
  .map(x=>x.observed_at);
 assert.deepEqual(all.map(e=>e.observedAt),expected);
 assert.ok(all.every(e=>!Object.keys(e).includes('remote_id')));
 assert.equal((await f.handler.fetch(req('/__private/paypal/claim-recovery',
  {requestId:'req1',quoteId:'quote1',quoteVersion:1,
   beforeSequence:p1.nextBeforeSequence}))).status,400);
 f.sql.close();
});

test('audit cursor refuses zero, negative, string, null and unsafe integer input',async()=>{
 const f=fixture();await f.gate.claim(CLAIM);
 for(const beforeSequence of [0,-1,'2',null,Number.MAX_SAFE_INTEGER+1,1.5]){
  const res=await f.handler.fetch(req(undefined,
   {requestId:'req1',quoteId:'quote1',quoteVersion:1,beforeSequence}));
  assert.equal(res.status,400);
 }
 assert.equal(f.reads(),0);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM payment_attempt_audit').get().n,1);
 f.sql.close();
});

test('audit history ignores mismatched attempt identity even with a valid foreign key',async()=>{
 const f=fixture();await f.gate.claim(CLAIM);
 f.sql.prepare(`INSERT INTO payment_attempt_audit
 (request_id,quote_id,quote_version,merchant_id,operation,event_type,before_state,after_state,remote_id,observed_at)
 VALUES('req1','OTHER_QUOTE',1,?,'create','STATE_CHANGED','IN_FLIGHT','UNKNOWN',NULL,'forged-marker')`)
  .run(MERCHANT);
 const response=await f.handler.fetch(req());
 assert.equal(response.status,200);
 const body=await response.json();
 assert.equal(body.events.length,1);
 assert.equal(body.hasMore,false);
 assert.equal(body.nextBeforeSequence,null);
 assert.ok(!JSON.stringify(body).includes('forged-marker'));
 f.sql.close();
});
