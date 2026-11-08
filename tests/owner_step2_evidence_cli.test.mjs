import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const entry=fileURLToPath(new URL('../scripts/check_owner_step2_submission_evidence.mjs',import.meta.url));
test('no owner DB => safe machine-readable status, no external calls or DB writes',()=>{
 const home=mkdtempSync(join(tmpdir(),'worknova-step2-no-private-'));
 try{
  const before=readdirSync(home);
  const result=spawnSync(process.execPath,['--experimental-sqlite',entry],{
   env:{...process.env,HOME:home,USERPROFILE:home,
    PAYPAL_SANDBOX_CLIENT_SECRET:'NEVER_PRINT_SECRET_123',
    GEMINI_API_KEY:'NEVER_PRINT_AI_SECRET_456'},
   timeout:10000,encoding:'utf8'
  });
  assert.equal(result.status,2,result.stderr);
  assert.equal(result.stdout.trim().split(/\n/).length,1);
  const json=JSON.parse(result.stdout);
  assert.equal(json.state,'LOCAL_EVIDENCE_REVIEW_REQUIRED');
  assert.equal(json.providerRequestsPerformedNow,0);
  assert.equal(json.paymentPostsPerformedNow,0);
  assert.equal(json.localDatabaseWritesPerformed,false);
  assert.equal(json.safeToRepeatPayment,false);
  assert.equal(json.releaseHold,true);
  for(const s of ['NEVER_PRINT_SECRET_123','NEVER_PRINT_AI_SECRET_456',home]){
   assert.equal(result.stdout.includes(s),false);
   assert.equal(result.stderr.includes(s),false);
  }
  assert.deepEqual(readdirSync(home),before);
 }finally{rmSync(home,{recursive:true,force:true})}
});
test('unknown CLI flags never inspect or print private evidence',()=>{
 const result=spawnSync(process.execPath,['--experimental-sqlite',entry,'--execute'],{
  timeout:10000,encoding:'utf8'});
 assert.equal(result.status,2);
 assert.equal(JSON.parse(result.stdout).state,'NO_ARGUMENTS_SUPPORTED');
});
