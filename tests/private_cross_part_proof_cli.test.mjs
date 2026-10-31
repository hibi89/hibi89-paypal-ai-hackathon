import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('../scripts/check_cross_part_proof.mjs',import.meta.url));
function invoke(args=[]){
 return spawnSync(process.execPath,['--experimental-sqlite',script,...args],{
  encoding:'utf8',timeout:20000,env:{PATH:process.env.PATH,HOME:process.env.HOME}
 });
}
test('offline private proof spans genuine Part1 and Part2 SQLite, survives restart and denies forged requests',()=>{
 const run=invoke();
 assert.equal(run.error,undefined,String(run.error));
 assert.equal(run.status,0,run.stderr);
 const lines=run.stdout.trim().split('\n');
 assert.equal(lines.length,1,run.stdout);
 const p=JSON.parse(lines[0]);
 assert.equal(p.status,'CROSS_PART_PRIVATE_SYNTHETIC_SQLITE_E2E_PASS');
 assert.equal(p.mode,'OFFLINE_SYNTHETIC_ONLY');
 for(const key of ['part1ApprovedQuote','part2SyntheticA2A',
  'sqlitePersistenceAfterRestart','verifiedBuyerReadOnly',
  'forgedRequestDenied','revokedMembershipDenied']){
  assert.equal(p[key],true,key);
 }
 assert.equal(p.amountMinor,29900);
 assert.equal(p.currency,'USD');
 assert.match(p.reviewFingerprint,/^[a-f0-9]{64}$/);
 for(const key of ['paymentAuthorized','paypalOrderCreated',
  'paypalCapturePerformed','realProviderEvidence',
  'publicHttpServerStarted','publicationAuthorized']){
  assert.equal(p[key],false,key);
 }
 assert.equal(p.providerCalls,0);
});
test('private proof rejects all caller-supplied flags instead of receiving production data',()=>{
 const run=invoke(['--real-provider']);
 assert.equal(run.error,undefined,String(run.error));
 assert.equal(run.status,2);
 assert.equal(run.stdout,'');
 assert.match(run.stderr,/OFFLINE_SYNTHETIC_ONLY_NO_ARGUMENTS/);
});
