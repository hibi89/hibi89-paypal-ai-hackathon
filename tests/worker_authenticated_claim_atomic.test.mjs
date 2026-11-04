import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createWorkerPaymentClaimGate} from '../src/worker_payment_claim_gate.mjs';
const OWNER='owner1',MERCHANT='PAYPALMERCH13',SUBJECT='a'.repeat(64),DIGEST='b'.repeat(64);
const T=1800000000000;
const args={requestId:'req1',quoteId:'quote1',quoteVersion:1,ownerId:OWNER,
 merchantId:MERCHANT,sessionDigest:DIGEST,checkedAt:T};
function fixture({beforeWrite,withAudit=false,d1TotalChanges=false}={}){
 const sql=new DatabaseSync(':memory:');
 for(const name of ['0001_payment_claims.sql','0002_worker_private_sessions.sql',
  '0003_worker_private_oidc.sql','0004_worker_private_binding_epoch.sql'])
  sql.exec(readFileSync(new URL('../migrations/d1/'+name,import.meta.url),'utf8'));
 sql.prepare(`INSERT INTO quotes(id,owner_id,merchant_id,version,currency,status,
  approval_actor,approval_version,approval_amount_minor) VALUES(?,?,?,?,?,?,?,?,?)`)
  .run('quote1',OWNER,MERCHANT,1,'USD','APPROVED',OWNER,1,150);
 sql.prepare('INSERT INTO worker_private_oidc_bindings(issuer,subject_hmac,actor_id,merchant_id,role) VALUES(?,?,?,?,?)')
  .run('https://idp.invalid',SUBJECT,OWNER,MERCHANT,'OWNER');
 sql.prepare(`INSERT INTO worker_private_sessions(token_sha256,actor_id,merchant_id,role,
  issuer,issuer_verified_at_ms,expires_at_ms,binding_subject_hmac,binding_revision)
  VALUES(?,?,?,?,?,?,?,?,1)`)
  .run(DIGEST,OWNER,MERCHANT,'OWNER','https://idp.invalid',T-1000,T+60000,SUBJECT);
 if(withAudit)sql.exec(readFileSync(
  new URL('../migrations/d1/0005_payment_attempt_audit.sql',import.meta.url),'utf8'));
 const db={withSession(mode){assert.equal(mode,'first-primary');return {
  prepare(query){return {bind(...parameters){return {
   async run(){if(beforeWrite&&query.includes('JOIN worker_private_sessions'))
     beforeWrite(sql);const out=sql.prepare(query).run(...parameters);
     const changes=d1TotalChanges&&query.startsWith('INSERT INTO payment_attempts')&&out.changes===1?
      2:out.changes;
     return {meta:{changes}};},
   async first(){return sql.prepare(query).get(...parameters)??null;}
  }}}}
 };}};
 return {sql,gate:createWorkerPaymentClaimGate({db})};
}
const count=sql=>sql.prepare('SELECT count(*) AS n FROM payment_attempts').get().n;
test('valid live OWNER session creates exactly one D1 first claim',async()=>{
 const f=fixture();const first=await f.gate.claimWithVerifiedSession(args);
 assert.equal(first.claimed,true);assert.equal(first.paymentAuthorized,false);
 assert.equal((await f.gate.claimWithVerifiedSession(args)).claimed,false);
 assert.equal(count(f.sql),1);f.sql.close();
});
test('D1 trigger-inclusive two-row first claim succeeds only with exact audit',async()=>{
 const f=fixture({withAudit:true,d1TotalChanges:true});
 const first=await f.gate.claimWithVerifiedSession(args);
 assert.equal(first.claimed,true);
 assert.equal(first.providerCalls,0);
 assert.equal(f.sql.prepare("SELECT event_type FROM payment_attempt_audit").get().event_type,
  'CLAIM_CREATED');
 assert.equal((await f.gate.claimWithVerifiedSession(args)).claimed,false);
 assert.equal(count(f.sql),1);f.sql.close();
});
test('trigger-inclusive count without audit is ambiguous, never claimed success',async()=>{
 const f=fixture({d1TotalChanges:true});
 await assert.rejects(f.gate.claimWithVerifiedSession(args),
  {code:'AUTHENTICATED_CLAIM_UNAVAILABLE_NO_RETRY'});
 assert.equal(count(f.sql),1);f.sql.close();
});
test('revocation immediately before the atomic INSERT prevents D1 claim',async()=>{
 const f=fixture({beforeWrite:sql=>sql.prepare(
 'UPDATE worker_private_sessions SET revoked_at_ms=? WHERE token_sha256=?')
 .run(T-1,DIGEST)});
 assert.equal((await f.gate.claimWithVerifiedSession(args)).claimed,false);
 assert.equal(count(f.sql),0);f.sql.close();
});
test('OIDC deactivation immediately before the INSERT prevents D1 claim',async()=>{
 const f=fixture({beforeWrite:sql=>sql.prepare(
 'UPDATE worker_private_oidc_bindings SET active=0 WHERE issuer=?')
 .run('https://idp.invalid')});
 assert.equal((await f.gate.claimWithVerifiedSession(args)).claimed,false);
 assert.equal(count(f.sql),0);f.sql.close();
});
test('binding revision or session expiry changes before SQL reject claim',async()=>{
 for(const mutate of [
  sql=>sql.prepare('UPDATE worker_private_oidc_bindings SET actor_id=?').run('other'),
  sql=>sql.prepare('UPDATE worker_private_sessions SET expires_at_ms=?').run(T),
  sql=>sql.prepare('UPDATE worker_private_sessions SET issuer_verified_at_ms=?').run(T+1)
 ]){
  const f=fixture({beforeWrite:mutate});
  assert.equal((await f.gate.claimWithVerifiedSession(args)).claimed,false);
  assert.equal(count(f.sql),0);f.sql.close();
 }
});
test('wrong session/quote ownership or malformed digest does not claim',async()=>{
 const f=fixture();
 for(const update of [{ownerId:'other'}, {merchantId:'WRONGMERCH123'},
  {sessionDigest:'c'.repeat(64)}, {checkedAt:T+70000}]){
  assert.equal((await f.gate.claimWithVerifiedSession({...args,...update})).claimed,false);
 }
 await assert.rejects(f.gate.claimWithVerifiedSession({...args,sessionDigest:'invalid'}),
  {code:'INVALID_AUTHENTICATED_CLAIM'});
 assert.equal(count(f.sql),0);f.sql.close();
});
test('concurrent async claims yield one winner on unique D1 attempt',async()=>{
 const f=fixture();
 const outcomes=await Promise.all(Array.from({length:12},(_,i)=>
  f.gate.claimWithVerifiedSession({...args,requestId:'r'+i})));
 assert.equal(outcomes.filter(x=>x.claimed).length,1);
 assert.equal(count(f.sql),1);f.sql.close();
});
test('unavailable primary write fails closed without retries',async()=>{
 const f=fixture();f.sql.close();
 await assert.rejects(f.gate.claimWithVerifiedSession(args),
  {code:'AUTHENTICATED_CLAIM_UNAVAILABLE_NO_RETRY'});
});
