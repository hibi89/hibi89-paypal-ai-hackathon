import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {runOfflineOperatorMvpSmoke} from '../src/offline_operator_mvp_smoke.mjs';

test('one-command full operator MVP runs with no credentials and two persisted claims',async()=>{
 const originalFetch=globalThis.fetch;
 // If a programmer accidentally calls the real global fetch, fail immediately.
 globalThis.fetch=async()=>{throw Error('FORBIDDEN_EXTERNAL_NETWORK')};
 try{
   const x=await runOfflineOperatorMvpSmoke();
   assert.equal(x.status,'MOCK_MVP_E2E_PASS');
   assert.equal(x.scope,'SYNTHETIC_PROVIDER_FIXTURE_ONLY');
   assert.equal(x.realGeminiCalls,0);
   assert.equal(x.realPayPalCalls,0);
   assert.equal(x.realPaymentCaptured,false);
   assert.equal(x.privateSqliteLedgerVerified,true);
   assert.equal(x.mockCaptureState,'PAID_VERIFIED_BY_INJECTED_PROVIDER_GET');
   assert.equal(x.createPostsToFakeTransport,1);
   assert.equal(x.capturePostsToFakeTransport,1);
   assert.deepEqual(x.missingSkills,['qa']);
 }finally{globalThis.fetch=originalFetch}
});
test('CLI can be executed without private environment, reports offline scope only',()=>{
 const cmd=new URL('../scripts/run_mvp_mock_smoke.mjs',import.meta.url);
 const x=spawnSync(process.execPath,['--experimental-sqlite',cmd.pathname],{
   encoding:'utf8',timeout:15000,
   env:{PATH:process.env.PATH,HOME:process.env.HOME,USERPROFILE:process.env.USERPROFILE}
 });
 assert.equal(x.status,0,x.stderr);
 const out=JSON.parse(x.stdout.trim());
 assert.equal(out.status,'MOCK_MVP_E2E_PASS');
 assert.equal(out.realPayPalCalls,0);
 assert.equal(out.realGeminiCalls,0);
 assert.equal(out.implicitNetworkAccess,false);
 assert.equal(out.syntheticQuoteAmount,'1.50');
 assert.ok(!x.stdout.includes('FAKE_GEMINI_KEY'));
});
