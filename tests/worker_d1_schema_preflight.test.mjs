import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync,backup} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync,copyFileSync,readdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {auditWorkerD1SchemaReadOnly} from '../src/worker_d1_schema_preflight.mjs';

const migrationNames=['0001_payment_claims.sql','0002_worker_private_sessions.sql',
 '0003_worker_private_oidc.sql','0004_worker_private_binding_epoch.sql'];
const scripts=migrationNames.map(n=>readFileSync(
 new URL('../migrations/d1/'+n,import.meta.url),'utf8'));
const quarantine=readFileSync(
 new URL('../scripts/restore_quarantine_private_sessions.sql',import.meta.url),'utf8');

function fixture(level=4){
 const dir=mkdtempSync(join(tmpdir(),'paypal-d1-schema-preflight-'));
 const path=join(dir,'fixture.sqlite'),writer=new DatabaseSync(path);
 for(let i=0;i<level;i++)writer.exec(scripts[i]);
 const log={modes:[],sql:[],writes:0};
 const db={withSession(mode){
  log.modes.push(mode);
  return {prepare(sql){
   log.sql.push(sql);
   assert.match(sql,/^(SELECT|PRAGMA)\s/i);
   return {async all(){
    const ro=new DatabaseSync(path,{readOnly:true});
    try{return {results:ro.prepare(sql).all()};}
    finally{ro.close();}
   }};
  }};
 }};
 return {writer,path,dir,db,log,
  close(){try{writer.close();}catch{}rmSync(dir,{force:true,recursive:true});}};
}
const scoped=fn=>async()=>{
 const f=fixture();
 try{await fn(f);}finally{f.close();}
};

test('four ordered D1 migrations pass read-only structural audit without authorizing launch',scoped(async f=>{
 const before=f.writer.prepare('SELECT count(*) n FROM worker_private_sessions').get().n;
 const report=await auditWorkerD1SchemaReadOnly({db:f.db});
 assert.equal(report.status,'OFFLINE_SCHEMA_CANDIDATE_ONLY');
 assert.deepEqual(report.issueCodes,[]);
 assert.equal(report.readOnly,true);
 assert.equal(report.providerCalls,0);
 assert.equal(report.dbWrites,0);
 assert.equal(report.liveCloudflareD1Verified,false);
 assert.equal(report.restoreFreshnessVerified,false);
 assert.equal(report.releaseAuthorized,false);
 assert.ok(f.log.modes.every(x=>x==='first-primary'));
 assert.ok(f.log.sql.every(x=>/^(SELECT|PRAGMA)\s/i.test(x)));
 assert.equal(f.writer.prepare('SELECT count(*) n FROM worker_private_sessions').get().n,before);
}));

test('missing revision migration blocks release and lists exact missing columns',async()=>{
 const f=fixture(3);
 try{
  const result=await auditWorkerD1SchemaReadOnly({db:f.db});
  assert.equal(result.status,'BLOCKED_OFFLINE_D1_SCHEMA');
  assert.ok(result.issueCodes.includes('MISSING_COLUMN:worker_private_oidc_bindings.revision'));
  assert.ok(result.issueCodes.includes('MISSING_COLUMN:worker_private_sessions.binding_revision'));
  assert.equal(result.releaseAuthorized,false);
 }finally{f.close();}
});

test('missing security trigger and assertion unique index block structural evidence',scoped(async f=>{
 f.writer.exec('DROP TRIGGER worker_private_binding_no_delete');
 f.writer.exec('DROP INDEX ux_worker_session_assertion');
 const result=await auditWorkerD1SchemaReadOnly({db:f.db});
 assert.equal(result.status,'BLOCKED_OFFLINE_D1_SCHEMA');
 assert.ok(result.issueCodes.includes('MISSING_TRIGGER:worker_private_binding_no_delete'));
 assert.ok(result.issueCodes.includes('MISSING_INDEX:ux_worker_session_assertion'));
}));

test('replaced empty guard trigger cannot masquerade as a valid guard',scoped(async f=>{
 f.writer.exec('DROP TRIGGER worker_private_binding_no_delete');
 f.writer.exec('CREATE TRIGGER worker_private_binding_no_delete BEFORE DELETE ON worker_private_oidc_bindings BEGIN SELECT 1; END');
 const report=await auditWorkerD1SchemaReadOnly({db:f.db});
 assert.equal(report.status,'BLOCKED_OFFLINE_D1_SCHEMA');
 assert.ok(report.issueCodes.includes('GUARD_SIGNATURE_UNEXPECTED:worker_private_binding_no_delete'));
}));

test('missing table, D1 outage and missing read-only metadata capability fail closed',async()=>{
 const f=fixture();
 try{
  f.writer.exec('DROP TABLE worker_private_login_challenges');
  const missing=await auditWorkerD1SchemaReadOnly({db:f.db});
  assert.ok(missing.issueCodes.includes('MISSING_TABLE:worker_private_login_challenges'));
  for(const db of [undefined,{withSession(){throw Error('secret DB details');}},
   {withSession(){return {prepare(){return {run(){throw Error('WRITE_NOT_ALLOWED');}};}};}}]){
   const blocked=await auditWorkerD1SchemaReadOnly({db});
   assert.equal(blocked.status,'BLOCKED_OFFLINE_D1_SCHEMA');
   assert.equal(JSON.stringify(blocked).includes('secret DB details'),false);
   assert.equal(blocked.releaseAuthorized,false);
  }
 }finally{f.close();}
});

test('restored old snapshot remains untrusted even if schema passes; quarantine then audit',async()=>{
 const f=fixture();
 let restored;
 try{
  f.writer.prepare('INSERT INTO worker_private_oidc_bindings (issuer,subject_hmac,actor_id,merchant_id,role,active) VALUES(?,?,?,?,?,?)')
   .run('https://idp.example.test','a'.repeat(64),'owner','merchant','OWNER',1);
  f.writer.prepare('INSERT INTO worker_private_sessions (token_sha256,actor_id,merchant_id,role,issuer,issuer_verified_at_ms,expires_at_ms,binding_subject_hmac,binding_revision) VALUES(?,?,?,?,?,?,?,?,?)')
   .run('b'.repeat(64),'owner','merchant','OWNER','https://idp.example.test',1000,9000000,'a'.repeat(64),1);
  const snapshot=join(f.dir,'snapshot.sqlite');
  await backup(f.writer,snapshot);
  f.writer.exec('UPDATE worker_private_oidc_bindings SET active=0');
  f.writer.close();
  copyFileSync(snapshot,f.path);
  restored=new DatabaseSync(f.path);
  const readDb={withSession(mode){assert.equal(mode,'first-primary');return {
   prepare(sql){assert.match(sql,/^(SELECT|PRAGMA)\s/i);
    return {all:async()=>({results:restored.prepare(sql).all()})};}};}};
  const pre=await auditWorkerD1SchemaReadOnly({db:readDb});
  assert.equal(pre.status,'OFFLINE_SCHEMA_CANDIDATE_ONLY');
  assert.equal(pre.restoreFreshnessVerified,false);
  assert.equal(pre.releaseAuthorized,false);
  restored.exec('BEGIN IMMEDIATE;'+quarantine+' COMMIT;');
  assert.equal(restored.prepare('SELECT active FROM worker_private_oidc_bindings').get().active,0);
  assert.ok(restored.prepare('SELECT revoked_at_ms FROM worker_private_sessions').get().revoked_at_ms>0);
  const post=await auditWorkerD1SchemaReadOnly({db:readDb});
  assert.equal(post.status,'OFFLINE_SCHEMA_CANDIDATE_ONLY');
  assert.equal(post.restoreFreshnessVerified,false);
  assert.equal(post.releaseAuthorized,false);
 }finally{if(restored)restored.close();f.close();}
});

test('same-named UNIQUE index on wrong key cannot masquerade as assertion replay guard',scoped(async f=>{
 f.writer.exec('DROP INDEX ux_worker_session_assertion');
 f.writer.exec('CREATE UNIQUE INDEX ux_worker_session_assertion ON worker_private_sessions(actor_id) WHERE actor_id IS NOT NULL');
 const report=await auditWorkerD1SchemaReadOnly({db:f.db});
 assert.equal(report.status,'BLOCKED_OFFLINE_D1_SCHEMA');
 assert.ok(report.issueCodes.includes('ASSERTION_INDEX_WRONG_COLUMNS'));
 assert.ok(report.issueCodes.includes('ASSERTION_INDEX_PREDICATE_UNEXPECTED'));
 assert.equal(report.releaseAuthorized,false);
}));

test('partial index with a silent always-false predicate is rejected',scoped(async f=>{
 f.writer.exec('DROP INDEX ux_worker_session_assertion');
 f.writer.exec('CREATE UNIQUE INDEX ux_worker_session_assertion ON worker_private_sessions(assertion_sha256) WHERE assertion_sha256 IS NOT NULL AND 0');
 const report=await auditWorkerD1SchemaReadOnly({db:f.db});
 assert.equal(report.status,'BLOCKED_OFFLINE_D1_SCHEMA');
 assert.ok(report.issueCodes.includes('ASSERTION_INDEX_PREDICATE_UNEXPECTED'));
 assert.equal(report.dbWrites,0);
 assert.equal(report.releaseAuthorized,false);
}));

test('security guard with inert WHEN 0 and valid RAISE text is blocked',scoped(async f=>{
 f.writer.exec('DROP TRIGGER worker_private_binding_no_delete');
 f.writer.exec(`CREATE TRIGGER worker_private_binding_no_delete
  BEFORE DELETE ON worker_private_oidc_bindings WHEN 0
  BEGIN SELECT RAISE(ABORT,'OIDC_BINDING_MUST_BE_REVOKED'); END`);
 const report=await auditWorkerD1SchemaReadOnly({db:f.db});
 assert.equal(report.status,'BLOCKED_OFFLINE_D1_SCHEMA');
 assert.ok(report.issueCodes.includes('GUARD_SQL_DRIFT:worker_private_binding_no_delete'));
 assert.equal(report.dbWrites,0);
 assert.equal(report.releaseAuthorized,false);
}));

test('revision trigger with inert WHEN 0 cannot spoof full migration guard',scoped(async f=>{
 f.writer.exec('DROP TRIGGER worker_private_binding_revision_on_change');
 f.writer.exec(`CREATE TRIGGER worker_private_binding_revision_on_change
  AFTER UPDATE OF active,actor_id,merchant_id,role,issuer,subject_hmac
  ON worker_private_oidc_bindings WHEN 0 BEGIN
  UPDATE worker_private_oidc_bindings SET revision = OLD.revision + 1
  WHERE issuer = NEW.issuer AND subject_hmac = NEW.subject_hmac;
  END`);
 const report=await auditWorkerD1SchemaReadOnly({db:f.db});
 assert.equal(report.status,'BLOCKED_OFFLINE_D1_SCHEMA');
 assert.ok(report.issueCodes.includes('GUARD_SQL_DRIFT:worker_private_binding_revision_on_change'));
 assert.equal(report.releaseAuthorized,false);
}));

test('only ordered versioned migrations are discoverable by Wrangler default SQL glob',()=>{
 const migrationsDir=new URL('../migrations/d1/',import.meta.url);
 const discovered=readdirSync(migrationsDir).filter(x=>x.endsWith('.sql')).sort();
 // Only the original four are audited by this legacy read-only contract.
 // 0005/0006 are separate offline migration candidates, NOT remote-approved.
 assert.deepEqual(discovered,[...migrationNames,
  '0005_payment_attempt_audit.sql','0006_payment_state_integrity.sql'].sort());
 assert.ok(discovered.every(x=>/^000[1-9][0-9]*_[a-z0-9_]+\.sql$/.test(x)));
 assert.ok(existsSync(new URL('../scripts/restore_quarantine_private_sessions.sql',import.meta.url)));
 assert.equal(discovered.some(x=>x.includes('quarantine')),false);
});
