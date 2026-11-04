import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createWorkerPaymentClaimGate} from '../src/worker_payment_claim_gate.mjs';
const merchant='PAYPALMERCH13';
function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(readFileSync(new URL('../migrations/d1/0001_payment_claims.sql',import.meta.url),'utf8'));
 sql.prepare('INSERT INTO quotes(id,owner_id,merchant_id,version,currency,status,approval_actor,approval_version,approval_amount_minor) VALUES(?,?,?,?,?,?,?,?,?)')
 .run('quote1','owner1',merchant,1,'USD','APPROVED','owner1',1,150);
 const db={withSession(mode){
  assert.equal(mode,'first-primary');
  return {prepare(query){return {bind(...args){return {
   async run(){const result=sql.prepare(query).run(...args);return {meta:{changes:result.changes}};},
   async first(){return sql.prepare(query).get(...args)??null;}
  }}}}};
 }};
 return {sql,gate:createWorkerPaymentClaimGate({db})};
}
const input={requestId:'request1',quoteId:'quote1',quoteVersion:1,ownerId:'owner1',merchantId:merchant};
test('D1 claim is single-winner and duplicate attempts never create another provider order',async()=>{
 const {sql,gate}=fixture();
 const first=await gate.claim(input);
 assert.equal(first.claimed,true);
 assert.equal(first.providerCalls,0);
 assert.equal(first.paymentAuthorized,false);
 const repeat=await gate.claim(input);
 assert.equal(repeat.claimed,false);
 assert.equal(repeat.state,'UNKNOWN_RECONCILIATION_REQUIRED');
 const second=await gate.claim({...input,requestId:'request2'});
 assert.equal(second.claimed,false);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM payment_attempts').get().n,1);
 sql.close();
});
test('unapproved and invalid claims cannot create a payment attempt',async()=>{
 const {sql,gate}=fixture();
 await assert.rejects(gate.claim({...input,ownerId:'wrong'}),{code:'CLAIM_NOT_APPROVED'});
 await assert.rejects(gate.claim({...input,quoteVersion:2}),{code:'CLAIM_NOT_APPROVED'});
 await assert.rejects(gate.claim({...input,requestId:'../bad'}),{code:'INVALID_CLAIM_INPUT'});
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM payment_attempts').get().n,0);
 sql.close();
});
test('D1 write errors remain ambiguous and fail closed',async()=>{
 const {sql,gate}=fixture();
 sql.close();
 await assert.rejects(gate.claim(input),{code:'CLAIM_OUTCOME_UNKNOWN_RECONCILE_BEFORE_RETRY'});
});

test('remote order binding is compare-and-set, idempotent and rejects conflicting IDs',async()=>{
 const {sql,gate}=fixture();
 await gate.claim(input);
 const first=await gate.persistRemoteOrder({...input,remoteId:'ORDER_001'});
 assert.equal(first.persisted,true);
 const same=await gate.persistRemoteOrder({...input,remoteId:'ORDER_001'});
 assert.equal(same.persisted,false);
 assert.equal(same.state,'ALREADY_BOUND_RECONCILE');
 await assert.rejects(gate.persistRemoteOrder({...input,remoteId:'ORDER_002'}),
  {code:'REMOTE_ORDER_BINDING_UNKNOWN_RECONCILE_BEFORE_RETRY'});
 assert.equal(sql.prepare('SELECT remote_id FROM payment_attempts').get().remote_id,'ORDER_001');
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM payment_attempts').get().n,1);
 sql.close();
});
test('remote order binding cannot create a claim or bind an unowned request',async()=>{
 const {sql,gate}=fixture();
 await assert.rejects(gate.persistRemoteOrder({...input,remoteId:'ORDER_001'}),
  {code:'REMOTE_ORDER_BINDING_UNKNOWN_RECONCILE_BEFORE_RETRY'});
 await gate.claim(input);
 await assert.rejects(gate.persistRemoteOrder({...input,requestId:'other',remoteId:'ORDER_001'}),
  {code:'REMOTE_ORDER_BINDING_UNKNOWN_RECONCILE_BEFORE_RETRY'});
 await assert.rejects(gate.persistRemoteOrder({...input,remoteId:'../capture'}),
  {code:'INVALID_REMOTE_ORDER_BINDING'});
 assert.equal(sql.prepare('SELECT remote_id FROM payment_attempts').get().remote_id,null);
 sql.close();
});

test('UNKNOWN transition is atomic, idempotent and blocks new create after ambiguous result',async()=>{
 const {sql,gate}=fixture();
 await gate.claim(input);
 const first=await gate.markUnknown(input);
 assert.equal(first.marked,true);
 assert.equal(first.state,'UNKNOWN');
 assert.equal(first.next,'MANUAL_PROVIDER_LOOKUP_REQUIRED');
 const repeat=await gate.markUnknown(input);
 assert.equal(repeat.marked,false);
 assert.equal((await gate.claim({...input,requestId:'request2'})).claimed,false);
 const status=await gate.inspectRecovery(input);
 assert.equal(status.remoteIdKnown,false);
 assert.equal(status.paymentAuthorized,false);
 assert.equal(status.providerCalls,0);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM payment_attempts').get().n,1);
 sql.close();
});
test('UNKNOWN recovery with persisted remote order requires GET, not another CREATE',async()=>{
 const {sql,gate}=fixture();
 await gate.claim(input);
 await gate.persistRemoteOrder({...input,remoteId:'ORDER_001'});
 const marked=await gate.markUnknown(input);
 assert.equal(marked.next,'REMOTE_ORDER_GET_RECONCILIATION_REQUIRED');
 assert.equal((await gate.inspectRecovery(input)).remoteIdKnown,true);
 await assert.rejects(gate.persistRemoteOrder({...input,remoteId:'ORDER_002'}),
 {code:'REMOTE_ORDER_BINDING_UNKNOWN_RECONCILE_BEFORE_RETRY'});
 assert.equal(sql.prepare('SELECT remote_id FROM payment_attempts').get().remote_id,'ORDER_001');
 sql.close();
});
test('UNKNOWN mark and inspection reject wrong owner and missing claims',async()=>{
 const {sql,gate}=fixture();
 await gate.claim(input);
 await assert.rejects(gate.markUnknown({...input,ownerId:'other'}),
 {code:'UNKNOWN_MARK_UNCONFIRMED_NO_RETRY'});
 await assert.rejects(gate.inspectRecovery({...input,ownerId:'other'}),
 {code:'RECOVERY_UNAVAILABLE_NO_RETRY'});
 await assert.rejects(gate.markUnknown({...input,requestId:'other'}),
 {code:'UNKNOWN_MARK_UNCONFIRMED_NO_RETRY'});
 await assert.rejects(gate.markUnknown({...input,requestId:'..'}),
 {code:'INVALID_UNKNOWN_MARK_INPUT'});
 assert.equal(sql.prepare('SELECT state FROM payment_attempts').get().state,'IN_FLIGHT');
 sql.close();
});
test('UNKNOWN cannot downgrade already approved or paid ledger state',async()=>{
 const {sql,gate}=fixture();
 await gate.claim(input);
 sql.prepare("UPDATE payment_attempts SET state='APPROVED' WHERE request_id=?").run(input.requestId);
 await assert.rejects(gate.markUnknown(input),{code:'UNKNOWN_MARK_UNCONFIRMED_NO_RETRY'});
 assert.equal((await gate.inspectRecovery(input)).next,'READ_ONLY_REMOTE_VERIFICATION_REQUIRED');
 sql.prepare("UPDATE payment_attempts SET state='PAID' WHERE request_id=?").run(input.requestId);
 await assert.rejects(gate.markUnknown(input),{code:'UNKNOWN_MARK_UNCONFIRMED_NO_RETRY'});
 assert.equal((await gate.inspectRecovery(input)).next,'PAYMENT_ATTESTATION_NOT_PROVIDED');
 sql.close();
});

test('remote order CAS requires matching quote owner on both update and verification read',async()=>{
 const {sql,gate}=fixture();
 await gate.claim(input);
 await assert.rejects(gate.persistRemoteOrder({...input,ownerId:'other',remoteId:'ORDER_001'}),
  {code:'REMOTE_ORDER_BINDING_UNKNOWN_RECONCILE_BEFORE_RETRY'});
 await assert.rejects(gate.persistRemoteOrder({...input,ownerId:undefined,remoteId:'ORDER_001'}),
  {code:'INVALID_REMOTE_ORDER_BINDING'});
 await assert.rejects(gate.persistRemoteOrder({...input,merchantId:'UNRELATED1234',remoteId:'ORDER_001'}),
  {code:'REMOTE_ORDER_BINDING_UNKNOWN_RECONCILE_BEFORE_RETRY'});
 assert.equal(sql.prepare('SELECT remote_id FROM payment_attempts').get().remote_id,null);
 const valid=await gate.persistRemoteOrder({...input,remoteId:'ORDER_001'});
 assert.equal(valid.persisted,true);
 assert.equal(sql.prepare('SELECT remote_id FROM payment_attempts').get().remote_id,'ORDER_001');
 sql.close();
});
