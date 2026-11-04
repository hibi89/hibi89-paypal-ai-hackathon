import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const file=fileURLToPath(new URL('../scripts/run_owner_private_gemini_innovation.mjs',import.meta.url));
const call=args=>spawnSync(process.execPath,['--experimental-sqlite',file,...args],{
 encoding:'utf8',timeout:9000,
 env:{...process.env,GEMINI_API_KEY:'FAKE_NOT_REAL_TEST_KEY'}
});
test('private Part2 CLI defaults to no network, no disk, no provider attestation',()=>{
 const result=call([]);
 assert.equal(result.status,0,result.stderr);
 const out=JSON.parse(result.stdout);
 assert.equal(out.status,'DRY_RUN_NO_NETWORK');
 assert.equal(out.networkRequests,0);
 assert.equal(out.paymentState,'NOT_PAID');
 assert.equal(out.providerAccountFreeTierVerified,false);
 assert.deepEqual(out.requiresExactFlags,
  ['--execute','--owner-authorized','--free-tier-confirmed']);
});
test('private Part2 CLI refuses non-interactive approval even with all flags and fake key',()=>{
 const result=call(['--execute','--owner-authorized','--free-tier-confirmed']);
 assert.equal(result.status,2,result.stderr);
 const out=JSON.parse(result.stdout);
 assert.equal(out.status,'PRIVATE_TTY_REQUIRED');
 assert.equal(out.networkRequests,0);
});
