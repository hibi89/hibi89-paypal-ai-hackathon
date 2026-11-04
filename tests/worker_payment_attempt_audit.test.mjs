import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createWorkerPaymentClaimGate} from '../src/worker_payment_claim_gate.mjs';
const MERCHANT='PAYPALMERCH13';
const quote={requestId:'REQ1',quoteId:'QUOTE1',quoteVersion:1,ownerId:'owner1',merchantId:MERCHANT};
const migration=name=>readFileSync(new URL('../migrations/d1/'+name,import.meta.url),'utf8');
function dbFixture({baseline=false}={}){
 const sql=new DatabaseSync(':memory:');
 sql.exec(migration('0001_payment_claims.sql'));
 sql.prepare(`INSERT INTO quotes(id,owner_id,merchant_id,version,currency,status,approval_actor,approval_version,approval_amount_minor)
 VALUES(?,?,?,?,?,?,?,?,?)`).run('QUOTE1','owner1',MERCHANT,1,'USD','APPROVED','owner1',1,150);
 if(baseline)sql.prepare(`INSERT INTO payment_attempts(request_id,quote_id,quote_version,merchant_id,operation,state,amount_minor,currency,remote_id)
 VALUES(?,?,?,?,?,?,?,?,?)`).run('REQ1','QUOTE1',1,MERCHANT,'create','UNKNOWN',150,'USD','ORDER_001');
 sql.exec(migration('0005_payment_attempt_audit.sql'));
 const db={withSession(mode){assert.equal(mode,'first-primary');return {
  prepare(query){return {bind(...params){return {
   async run(){const x=sql.prepare(query).run(...params);return {meta:{changes:x.changes}};},
   async first(){return sql.prepare(query).get(...params)??null;}
  }}}}
 };}};
 return {sql,gate:createWorkerPaymentClaimGate({db})};
}
const entries=sql=>sql.prepare('SELECT event_type,before_state,after_state,remote_id FROM payment_attempt_audit ORDER BY sequence').all().map(x=>({...x}));
test('existing ledger is labeled MIGRATION_BASELINE, not fabricated historical events',()=>{
 const f=dbFixture({baseline:true});
 assert.deepEqual(entries(f.sql),[{event_type:'MIGRATION_BASELINE',before_state:null,after_state:'UNKNOWN',remote_id:'ORDER_001'}]);
 f.sql.close();
});
test('first claim and unknown transition leave atomic append-only audit entries; repeat is silent',async()=>{
 const f=dbFixture();
 assert.equal((await f.gate.claim(quote)).claimed,true);
 assert.equal((await f.gate.markUnknown(quote)).marked,true);
 assert.equal((await f.gate.markUnknown(quote)).marked,false);
 assert.deepEqual(entries(f.sql),[
  {event_type:'CLAIM_CREATED',before_state:null,after_state:'IN_FLIGHT',remote_id:null},
  {event_type:'STATE_CHANGED',before_state:'IN_FLIGHT',after_state:'UNKNOWN',remote_id:null}
 ]);
 assert.equal((await f.gate.claim({...quote,requestId:'REQ2'})).claimed,false);
 assert.equal(entries(f.sql).length,2);
 f.sql.close();
});
test('remote ID compare-and-set is audited once and preserved through UNKNOWN',async()=>{
 const f=dbFixture();
 await f.gate.claim(quote);
 assert.equal((await f.gate.persistRemoteOrder({...quote,remoteId:'ORDER_001'})).persisted,true);
 assert.equal((await f.gate.persistRemoteOrder({...quote,remoteId:'ORDER_001'})).persisted,false);
 await f.gate.markUnknown(quote);
 assert.deepEqual(entries(f.sql).map(e=>[e.event_type,e.remote_id]),[
  ['CLAIM_CREATED',null],['REMOTE_ID_BOUND','ORDER_001'],['STATE_CHANGED','ORDER_001']
 ]);
 assert.equal((await f.gate.inspectRecovery(quote)).next,'REMOTE_ORDER_GET_RECONCILIATION_REQUIRED');
 f.sql.close();
});
test('attempted audit update/delete and payment amount rewrite are rejected',async()=>{
 const f=dbFixture();await f.gate.claim(quote);
 assert.throws(()=>f.sql.exec("UPDATE payment_attempt_audit SET after_state='PAID'"),/PAYMENT_AUDIT_APPEND_ONLY/);
 assert.throws(()=>f.sql.exec('DELETE FROM payment_attempt_audit'),/PAYMENT_AUDIT_APPEND_ONLY/);
 assert.throws(()=>f.sql.exec('UPDATE payment_attempts SET amount_minor=999'),/PAYMENT_CLAIM_IDENTITY_IMMUTABLE/);
 assert.equal(entries(f.sql).length,1);
 assert.equal(f.sql.prepare('SELECT amount_minor FROM payment_attempts').get().amount_minor,150);
 f.sql.close();
});
test('recorded remote ID is immutable even when attempting to overwrite or clear it',async()=>{
 const f=dbFixture();await f.gate.claim(quote);
 await f.gate.persistRemoteOrder({...quote,remoteId:'ORDER_001'});
 assert.throws(()=>f.sql.exec("UPDATE payment_attempts SET remote_id='ORDER_002'"),/PAYMENT_REMOTE_ID_IMMUTABLE/);
 assert.throws(()=>f.sql.exec('UPDATE payment_attempts SET remote_id=NULL'),/PAYMENT_REMOTE_ID_IMMUTABLE/);
 assert.equal(entries(f.sql).length,2);
 f.sql.close();
});
test('ledger transition rollback also rolls back its audit record',async()=>{
 const f=dbFixture();await f.gate.claim(quote);
 f.sql.exec('BEGIN');f.sql.exec("UPDATE payment_attempts SET state='UNKNOWN'");
 assert.equal(entries(f.sql).length,2);
 f.sql.exec('ROLLBACK');
 assert.equal(entries(f.sql).length,1);
 assert.equal(f.sql.prepare('SELECT state FROM payment_attempts').get().state,'IN_FLIGHT');
 f.sql.close();
});
test('audit failure rolls back claim write rather than leaving unaudited money state',async()=>{
 const f=dbFixture();
 f.sql.exec('DROP TABLE payment_attempt_audit');
 await assert.rejects(f.gate.claim(quote),{code:'CLAIM_OUTCOME_UNKNOWN_RECONCILE_BEFORE_RETRY'});
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM payment_attempts').get().n,0);
 f.sql.close();
});
test('migration replay preserves existing audit events without inventing backfill',async()=>{
 const f=dbFixture();
 await f.gate.claim(quote);
 await f.gate.markUnknown(quote);
 const prior=entries(f.sql);
 f.sql.exec(migration('0005_payment_attempt_audit.sql'));
 assert.deepEqual(entries(f.sql),prior);
 f.sql.close();
});
