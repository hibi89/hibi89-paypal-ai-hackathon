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
