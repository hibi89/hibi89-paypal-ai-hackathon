import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const path=fileURLToPath(new URL('../scripts/check_injected_a2a_cross_part.mjs',import.meta.url));
function run(args=[]){
 return spawnSync(process.execPath,['--experimental-sqlite',path,...args],{
  encoding:'utf8',timeout:20000,
  // Do not pass real AI/PayPal credentials into a proof that needs none.
  env:{PATH:process.env.PATH,HOME:process.env.HOME}
 });
}
test('real Part1/Part2 SQLite and injected fake Gemini A2A use durable quota and no payments',()=>{
 const p=run();
 assert.equal(p.error,undefined,String(p.error));
 assert.equal(p.status,0,p.stderr);
 const lines=p.stdout.trim().split('\n');
 assert.equal(lines.length,1,p.stdout);
 const proof=JSON.parse(lines[0]);
 assert.equal(proof.status,'INJECTED_FAKE_A2A_CROSS_PART_SQLITE_E2E_PASS');
 assert.equal(proof.mode,'OFFLINE_FAKE_GEMINI_TRANSPORT_ONLY');
 assert.equal(proof.fakeGeminiShapedRequests,2);
 assert.equal(proof.fakeQuotaFailureRequests,1);
 assert.equal(proof.realGeminiRequests,0);
 assert.equal(proof.realPayPalRequests,0);
 assert.equal(proof.quotaClaims,2);
 assert.equal(proof.measuredFakeTokens,80);
 assert.deepEqual(proof.storedQuotaStates,['DONE','DONE']);
 assert.equal(proof.failedProviderQuotaState,'UNKNOWN');
 for(const k of ['part2ReplayPersisted','part1ApprovedQuoteVerified',
  'privateCrossPartReviewVerified','forgedHostDenied','quotaFailureNoRetry']){
  assert.equal(proof[k],true,k);
 }
 for(const k of ['actualProviderAttestation','paymentAuthorized',
  'paypalCapturePerformed','publicationAuthorized']){
  assert.equal(proof[k],false,k);
 }
 assert.doesNotMatch(p.stdout,/x-goog-api-key|PAYPAL_SANDBOX_CLIENT_SECRET|TEST_DOUBLE_ONLY_NOT_AN_API_KEY/);
});
test('private fake A2A proof denies all caller-supplied flags',()=>{
 const p=run(['--execute','--real-gemini']);
 assert.equal(p.error,undefined,String(p.error));
 assert.equal(p.status,2,p.stderr);
 assert.equal(p.stdout,'');
 assert.match(p.stderr,/FAKE_A2A_PROOF_NO_ARGUMENTS/);
});
