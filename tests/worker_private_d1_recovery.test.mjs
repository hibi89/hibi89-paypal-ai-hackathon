import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync,backup} from 'node:sqlite';
import {mkdtempSync,rmSync,copyFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const read=(name)=>readFileSync(new URL('../migrations/d1/'+name,import.meta.url),'utf8');
const migrations=['0001_payment_claims.sql','0002_worker_private_sessions.sql','0003_worker_private_oidc.sql'].map(read);
const next=read('0004_worker_private_binding_epoch.sql'),quarantine=read('restore_quarantine_private_sessions.sql');
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'worker-d1-restore-')),file=join(root,'db.sqlite');
 const db=new DatabaseSync(file);
 for(const m of migrations)db.exec(m);
 db.prepare('INSERT INTO worker_private_oidc_bindings (issuer,subject_hmac,actor_id,merchant_id,role,active) VALUES(?,?,?,?,?,?)')
  .run('https://idp.example.test','a'.repeat(64),'owner','merchant','OWNER',1);
 db.prepare('INSERT INTO worker_private_sessions (token_sha256,actor_id,merchant_id,role,issuer,issuer_verified_at_ms,expires_at_ms) VALUES(?,?,?,?,?,?,?)')
  .run('b'.repeat(64),'owner','merchant','OWNER','https://idp.example.test',1000,9000000);
 return {root,file,db,close(){try{db.close();}catch{}rmSync(root,{recursive:true,force:true});}};
}
const col=(db,name)=>db.prepare("SELECT name FROM pragma_table_info('worker_private_sessions') WHERE name=?").get(name);

test('offline backup, deliberate migration fault rollback and ordered successful migration retain source rows',async()=>{
 const f=fixture();
 try{
  const backupPath=join(f.root,'baseline.sqlite');
  await backup(f.db,backupPath);
  assert.equal(f.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.throws(()=>f.db.exec('BEGIN IMMEDIATE;'+next+' NOT_SQL_VALID; COMMIT;'));
  f.db.exec('ROLLBACK');
  assert.equal(col(f.db,'binding_revision'),undefined);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM worker_private_sessions').get().n,1);
  f.db.exec(next);
  assert.equal(f.db.prepare('SELECT binding_revision FROM worker_private_sessions').get().binding_revision,null);
  assert.equal(f.db.prepare('SELECT revision FROM worker_private_oidc_bindings').get().revision,1);
  assert.equal(f.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  const b=new DatabaseSync(backupPath,{readOnly:true});
  try{assert.equal(col(b,'binding_revision'),undefined);
    assert.equal(b.prepare('SELECT count(*) AS n FROM worker_private_sessions').get().n,1);}
  finally{b.close();}
 }finally{f.close();}
});
test('restoring old identity backup must quarantine all mappings and cookies before auth can resume',async()=>{
 const f=fixture();
 try{
  f.db.exec(next);
  f.db.exec("UPDATE worker_private_sessions SET binding_subject_hmac='"+'a'.repeat(64)+"',binding_revision=1");
  const backupPath=join(f.root,'snapshot.sqlite');
  await backup(f.db,backupPath);
  f.db.exec('UPDATE worker_private_oidc_bindings SET active=0');
  assert.equal(f.db.prepare('SELECT revision FROM worker_private_oidc_bindings').get().revision,2);
  f.db.close();
  copyFileSync(backupPath,f.file);
  const restored=new DatabaseSync(f.file);
  try{
   assert.equal(restored.prepare('SELECT active FROM worker_private_oidc_bindings').get().active,1);
   restored.exec('BEGIN IMMEDIATE;'+quarantine+' COMMIT;');
   assert.equal(restored.prepare('SELECT active FROM worker_private_oidc_bindings').get().active,0);
   assert.equal(restored.prepare('SELECT revision FROM worker_private_oidc_bindings').get().revision,2);
   assert.ok(restored.prepare('SELECT revoked_at_ms FROM worker_private_sessions').get().revoked_at_ms>0);
   assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  }finally{restored.close();}
 }finally{f.close();}
});
