import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createWorkerPaymentClaimGate} from '../src/worker_payment_claim_gate.mjs';

const merchant='PAYPALMERCH13';
const attrs={requestId:'req1',quoteId:'quote1',quoteVersion:1,
 ownerId:'owner1',merchantId:merchant};
const load=name=>readFileSync(new URL('../migrations/d1/'+name,import.meta.url),'utf8');
function fixture({oldState}={}){
 const sql=new DatabaseSync(':memory:');
 sql.exec(load('0001_payment_claims.sql'));
 sql.prepare(`INSERT INTO quotes(id,owner_id,merchant_id,version,currency,status,approval_actor,approval_version,approval_amount_minor)
  VALUES(?,?,?,?,?,?,?,?,?)`).run('quote1','owner1',merchant,1,'USD','APPROVED','owner1',1,150);
 if(oldState){
  sql.prepare(`INSERT INTO payment_attempts(request_id,quote_id,quote_version,merchant_id,operation,state,amount_minor,currency,remote_id)
  VALUES(?,?,?,?,?,?,?,?,?)`).run('req1','quote1',1,merchant,'create',oldState,150,'USD',null);
 }
 sql.exec(load('0005_payment_attempt_audit.sql'));
 sql.exec(load('0006_payment_state_integrity.sql'));
 const db={withSession(type){assert.equal(type,'first-primary');return {
  prepare(query){return {bind(...params){return {
   async run(){const result=sql.prepare(query).run(...params);return {meta:{changes:result.changes}};},
   async first(){return sql.prepare(query).get(...params)??null;}
  }}}}
 };}};
 return {sql,gate:createWorkerPaymentClaimGate({db})};
}
const status=sql=>sql.prepare('SELECT state,remote_id FROM payment_attempts WHERE request_id=?').get('req1');
const events=sql=>sql.prepare('SELECT event_type,after_state FROM payment_attempt_audit ORDER BY sequence').all().map(x=>({...x}));

test('valid initial claim, remote ID bind, approve and PAID generate durable audit trail',async()=>{
 const {sql,gate}=fixture();
 assert.equal((await gate.claim(attrs)).claimed,true);
 assert.equal((await gate.persistRemoteOrder({...attrs,remoteId:'ORDER_001'})).persisted,true);
 sql.prepare("UPDATE payment_attempts SET state='APPROVED' WHERE request_id=?").run('req1');
 sql.prepare("UPDATE payment_attempts SET state='PAID' WHERE request_id=?").run('req1');
 assert.deepEqual({...status(sql)},{state:'PAID',remote_id:'ORDER_001'});
 assert.deepEqual(events(sql).map(e=>e.event_type),['CLAIM_CREATED','REMOTE_ID_BOUND','STATE_CHANGED','STATE_CHANGED']);
 assert.equal((await gate.claim({...attrs,requestId:'req2'})).claimed,false);
 sql.close();
});

test('PAID cannot regress to UNKNOWN, APPROVED or IN_FLIGHT, and audit is unchanged',async()=>{
 const {sql,gate}=fixture();
 await gate.claim(attrs);
 await gate.persistRemoteOrder({...attrs,remoteId:'ORDER_001'});
 sql.exec("UPDATE payment_attempts SET state='APPROVED'");
 sql.exec("UPDATE payment_attempts SET state='PAID'");
 const count=events(sql).length;
 for(const state of ['UNKNOWN','APPROVED','IN_FLIGHT']){
  assert.throws(()=>sql.prepare('UPDATE payment_attempts SET state=?').run(state),/PAYMENT_STATE_TRANSITION_FORBIDDEN/);
  assert.deepEqual({...status(sql)},{state:'PAID',remote_id:'ORDER_001'});
 }
 assert.equal(events(sql).length,count);
 sql.close();
});

test('UNKNOWN or APPROVED never reenter IN_FLIGHT after ambiguous outcome',async()=>{
 for(const state of ['UNKNOWN','APPROVED']){
  const f=fixture();await f.gate.claim(attrs);
  if(state==='UNKNOWN')await f.gate.markUnknown(attrs);
  else {
   await f.gate.persistRemoteOrder({...attrs,remoteId:'ORDER_001'});
   f.sql.exec("UPDATE payment_attempts SET state='APPROVED'");
  }
  assert.throws(()=>f.sql.exec("UPDATE payment_attempts SET state='IN_FLIGHT'"),/PAYMENT_STATE_TRANSITION_FORBIDDEN/);
  assert.equal(status(f.sql).state,state);
  f.sql.close();
 }
});

test('APPROVED and PAID require a durable order ID; failed writes emit no audit events',async()=>{
 const {sql,gate}=fixture();await gate.claim(attrs);
 const originalCount=events(sql).length;
 for(const state of ['APPROVED','PAID']){
  assert.throws(()=>sql.prepare('UPDATE payment_attempts SET state=?').run(state),
   /REMOTE_ORDER_REFERENCE_REQUIRED|PAYMENT_STATE_TRANSITION_FORBIDDEN/);
  assert.equal(events(sql).length,originalCount);
  assert.deepEqual({...status(sql)},{state:'IN_FLIGHT',remote_id:null});
 }
 sql.close();
});

test('direct PAID/APPROVED/UNKNOWN inserts cannot bypass first-claim gate',()=>{
 for(const initialState of ['PAID','APPROVED','UNKNOWN']){
  const {sql}=fixture();
  assert.throws(()=>sql.prepare(`INSERT INTO payment_attempts
   (request_id,quote_id,quote_version,merchant_id,operation,state,amount_minor,currency,remote_id)
   VALUES(?,?,?,?,?,?,?,?,?)`).run('req1','quote1',1,merchant,'create',initialState,150,'USD','ORDER_001'),
   /PAYMENT_CLAIM_MUST_START_IN_FLIGHT/);
  assert.equal(sql.prepare('SELECT count(*) n FROM payment_attempts').get().n,0);
  assert.equal(events(sql).length,0);
  sql.close();
 }
});

test('legitimate UNKNOWN reconciliation with recorded ID can move to APPROVED then PAID',async()=>{
 const {sql,gate}=fixture();await gate.claim(attrs);
 await gate.persistRemoteOrder({...attrs,remoteId:'ORDER_001'});
 await gate.markUnknown(attrs);
 sql.exec("UPDATE payment_attempts SET state='APPROVED'");
 sql.exec("UPDATE payment_attempts SET state='PAID'");
 assert.deepEqual({...status(sql)},{state:'PAID',remote_id:'ORDER_001'});
 assert.equal(events(sql).length,5);
 sql.close();
});

test('migration with preexisting ledger does not rewrite original rows or fabricate history',()=>{
 const {sql}=fixture({oldState:'UNKNOWN'});
 assert.deepEqual({...status(sql)},{state:'UNKNOWN',remote_id:null});
 assert.deepEqual(events(sql),[{event_type:'MIGRATION_BASELINE',after_state:'UNKNOWN'}]);
 assert.throws(()=>sql.exec("UPDATE payment_attempts SET state='IN_FLIGHT'"),/PAYMENT_STATE_TRANSITION_FORBIDDEN/);
 sql.close();
});

test('replaying migration is stable and does not multiply triggers/audit rows',async()=>{
 const {sql,gate}=fixture();
 sql.exec(load('0006_payment_state_integrity.sql'));
 await gate.claim(attrs);
 await gate.markUnknown(attrs);
 assert.deepEqual(events(sql).map(x=>x.event_type),['CLAIM_CREATED','STATE_CHANGED']);
 sql.close();
});
