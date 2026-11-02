import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {assertMigrationDirectory,parseDatabases,checkUniqueNewDatabase,validateArguments}
 from '../scripts/owner_cloudflare_d1_isolated.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
test('plan only checks fixed migrations and never invokes npx or Wrangler',()=>{
 assert.equal(assertMigrationDirectory(root).length,4);
 const probe=spawnSync(process.execPath,
  [resolve(root,'scripts/owner_cloudflare_d1_isolated.mjs')],{
   cwd:root,encoding:'utf8',env:{PATH:''},timeout:10000});
 assert.equal(probe.status,0);
 const report=JSON.parse(probe.stdout);
 assert.equal(report.status,'LOCAL_PLAN_ONLY_NO_ACCOUNT_CALLS');
 assert.equal(report.releaseAuthorized,false);
});
test('creation and migration require independently explicit operation and Free confirmation',()=>{
 assert.equal(validateArguments(['--create-isolated','--free-confirmed']).mode,'create');
 const id='11111111-1111-4111-8111-111111111111';
 assert.deepEqual(validateArguments(['--apply-isolated','proofline-d1-isolated-0123456789abcdef',id,'--free-confirmed']),
  {mode:'apply',name:'proofline-d1-isolated-0123456789abcdef',uuid:id});
 for(const a of [
  ['--create-isolated'],['--apply-isolated','name',id],
  ['--delete'],['--remote'],['--create-isolated','--paid-tier']
 ])assert.throws(()=>validateArguments(a),/EXPLICIT_OWNER_MODE/);
});
test('remote Wrangler database inventory must return recognized complete identities',()=>{
 const row={name:'proofline-d1-isolated-0123456789abcdef',uuid:'11111111-1111-4111-8111-111111111111'};
 assert.deepEqual(parseDatabases(JSON.stringify([row])),[row]);
 assert.deepEqual(parseDatabases({result:[row]}),[row]);
 for(const x of [undefined,{},'INVALID','{"result":{}}',
  '[{"name":"demo"}]'])assert.throws(()=>parseDatabases(x));
});
test('no existing DB or mismatched identity can be selected for migration',()=>{
 const name='proofline-d1-isolated-0123456789abcdef',id='11111111-1111-4111-8111-111111111111';
 assert.equal(checkUniqueNewDatabase([{name,uuid:id}],name,id),true);
 for(const rows of [
  [],[{name,uuid:'22222222-2222-4222-8222-222222222222'}],
  [{name,uuid:id},{name,uuid:id}],
  [{name:'production',uuid:id}]
 ])assert.throws(()=>checkUniqueNewDatabase(rows,name,id));
 assert.throws(()=>checkUniqueNewDatabase([{name,uuid:id}],'production',id));
});
