import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createWorkerContractRoleSessionResolver} from '../src/worker_contract_role_session_resolver.mjs';

const T=1793720000000,ISSUER='https://idp.fixture.invalid',MERCHANT='merchant-ci';
const SUBJECT='a'.repeat(64),ASSERTION='b'.repeat(64);
const TOKEN=Buffer.alloc(32,21).toString('base64url');
const DIGEST=createHash('sha256').update(TOKEN).digest('hex');
const ORIGIN='https://proofline.fixture.invalid';
function dbFixture(role='SELLER'){
 const sqlite=new DatabaseSync(':memory:');
 for(const f of ['0001_payment_claims.sql','0002_worker_private_sessions.sql',
   '0003_worker_private_oidc.sql','0004_worker_private_binding_epoch.sql']){
  sqlite.exec(readFileSync(new URL('../migrations/d1/'+f,import.meta.url),'utf8'));
 }
 for(const f of ['0005_contract_role_milestones.sql','0006_contract_role_sessions.sql'])
  sqlite.exec(readFileSync(new URL('../migrations/d1_candidate/'+f,import.meta.url),'utf8'));
 const actor=role==='SELLER'?'seller-ci':'reviewer-ci';
 sqlite.prepare('INSERT INTO worker_contract_memberships(actor_id,merchant_id,role) VALUES(?,?,?)').run(actor,MERCHANT,role);
 sqlite.prepare('INSERT INTO worker_contract_role_bindings(issuer,subject_hmac,actor_id,merchant_id,role) VALUES(?,?,?,?,?)')
  .run(ISSUER,SUBJECT,actor,MERCHANT,role);
 sqlite.prepare('INSERT INTO worker_contract_role_sessions(token_sha256,issuer,subject_hmac,actor_id,merchant_id,role,binding_revision,membership_revision,assertion_sha256,issued_at_ms,expires_at_ms) VALUES(?,?,?,?,?, ?,1,1,?,?,?)')
  .run(DIGEST,ISSUER,SUBJECT,actor,MERCHANT,role,ASSERTION,T-60000,T+60000);
 const db={withSession(mode){
  assert.equal(mode,'first-primary');
  return {prepare(sql){return {bind(...args){return {async first(){return sqlite.prepare(sql).get(...args);}}}}};
 }};
 return {sqlite,actor,resolve:createWorkerContractRoleSessionResolver({db,now:()=>T})};
}
const request=(cookie=TOKEN)=>new Request(ORIGIN+'/__private/contracts',{
 headers:{cookie:'__Host-proofline_contract_role='+cookie}
});
test('candidate 0006 uses isolated schema, only hashed sessions and real FK',()=>{
 const f=dbFixture();
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name LIKE 'worker_contract_role_%'").get().n,2);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM worker_private_sessions').get().n,0);
 assert.equal(f.sqlite.prepare('SELECT token_sha256 FROM worker_contract_role_sessions').get().token_sha256,DIGEST);
 assert.equal(f.sqlite.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
 assert.throws(()=>f.sqlite.prepare("DELETE FROM worker_contract_role_sessions").run(),/ROLE_SESSION_DELETE_FORBIDDEN/);
 f.sqlite.close();
});
test('preprovisioned seller and reviewer obtain only their current scoped identity',async()=>{
 for(const role of ['SELLER','REVIEWER']){
  const f=dbFixture(role),p=await f.resolve(request());
  assert.deepEqual({verified:p.verified,actor:p.actorId,merchant:p.merchantId,role:p.identityRole},
   {verified:true,actor:f.actor,merchant:MERCHANT,role});
  assert.equal(p.roleSessionHash,DIGEST);
  assert.equal(p.roleBindingRevision,1);
  assert.equal(Object.isFrozen(p),true);
  f.sqlite.close();
 }
});
test('anonymous, forged, duplicate, owner and expired credentials fail closed',async()=>{
 const f=dbFixture();
 await assert.rejects(f.resolve(new Request(ORIGIN+'/__private/contracts')));
 await assert.rejects(f.resolve(request('x'.repeat(43))));
 await assert.rejects(f.resolve(new Request(ORIGIN,{headers:{
  cookie:'__Host-proofline_contract_role='+TOKEN+'; __Host-proofline_contract_role='+TOKEN
 }})));
 assert.throws(()=>f.sqlite.prepare("UPDATE worker_contract_role_sessions SET role='OWNER'").run());
 f.sqlite.prepare('UPDATE worker_contract_role_sessions SET expires_at_ms=?').run(T-1);
 await assert.rejects(f.resolve(request()));
 f.sqlite.close();
});
test('revocation, role binding generation and member generation prevent ABA reuse',async()=>{
 const f=dbFixture();
 assert.equal((await f.resolve(request())).identityRole,'SELLER');
 f.sqlite.prepare('UPDATE worker_contract_role_bindings SET active=0,revision=2').run();
 await assert.rejects(f.resolve(request()));
 f.sqlite.prepare('UPDATE worker_contract_role_bindings SET active=1,revision=3').run();
 await assert.rejects(f.resolve(request()));
 assert.throws(()=>f.sqlite.prepare('UPDATE worker_contract_role_bindings SET revision=1').run(),/ROLE_BINDING_EPOCH_MUST_INCREASE/);
 f.sqlite.prepare('UPDATE worker_contract_role_sessions SET binding_revision=3').run();
 assert.equal((await f.resolve(request())).identityRole,'SELLER');
 f.sqlite.prepare('UPDATE worker_contract_memberships SET active=0,revision=2').run();
 await assert.rejects(f.resolve(request()));
 f.sqlite.prepare('UPDATE worker_contract_memberships SET active=1,revision=3').run();
 await assert.rejects(f.resolve(request()));
 assert.throws(()=>f.sqlite.prepare('UPDATE worker_contract_memberships SET revision=1').run(),/CONTRACT_ROLE_EPOCH_MUST_INCREASE/);
 f.sqlite.prepare('UPDATE worker_contract_role_sessions SET membership_revision=3,revoked_at_ms=?').run(T);
 await assert.rejects(f.resolve(request()));
 f.sqlite.close();
});
test('candidate 0006 never adds an HTTP user-enrollment or PayPal API route',()=>{
 const f=dbFixture();
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='worker_contract_role_sessions'").get().n,1);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='worker_private_sessions'").get().n,1);
 f.sqlite.close();
});
