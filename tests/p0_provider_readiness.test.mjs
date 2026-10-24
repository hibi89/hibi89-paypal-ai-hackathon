import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {inspectP0ProviderReadiness} from '../src/p0_provider_readiness.mjs';

const full={
 PAYPAL_SANDBOX_CLIENT_ID:'SYNTHETIC_CLIENT_SHOULD_NEVER_BE_LOGGED',
 PAYPAL_SANDBOX_CLIENT_SECRET:'SYNTHETIC_SECRET_SHOULD_NEVER_BE_LOGGED',
 GEMINI_API_KEY:'SYNTHETIC_AI_KEY_SHOULD_NEVER_BE_LOGGED'
};
test('nothing configured: all external gates stay blocked',()=>{
 const r=inspectP0ProviderReadiness({});
 assert.equal(r.status,'EXTERNAL_PROVIDER_EVIDENCE_REQUIRED');
 assert.deepEqual(r.missingVariableNames,[
 'PAYPAL_SANDBOX_CLIENT_ID','PAYPAL_SANDBOX_CLIENT_SECRET','GEMINI_API_KEY']);
 assert.equal(r.paypal.OAuth,'NOT_TESTED');
 assert.equal(r.ai.generation,'NOT_TESTED');
});
test('even when all variables are present they are not treated as real provider proof',()=>{
 const r=inspectP0ProviderReadiness(full);
 assert.equal(r.paypal.sandboxLocalConfiguration,'LOCALLY_PRESENT_NOT_VERIFIED');
 assert.equal(r.ai.localConfiguration,'LOCALLY_PRESENT_NOT_VERIFIED');
 assert.equal(r.paypal.OAuth,'NOT_TESTED');
 assert.equal(r.ai.freeTierEligibility,'NOT_VERIFIED');
 assert.equal(r.ai.generation,'NOT_TESTED');
 assert.equal(r.canCallPayPal,false);
 assert.equal(r.canCallAI,false);
 assert.equal(r.approvalGranted,false);
});
test('partial PayPal pair must not pass readiness',()=>{
 const r=inspectP0ProviderReadiness({PAYPAL_SANDBOX_CLIENT_ID:'x',GEMINI_API_KEY:'y'});
 assert.equal(r.paypal.sandboxLocalConfiguration,'MISSING');
 assert.ok(r.missingVariableNames.includes('PAYPAL_SANDBOX_CLIENT_SECRET'));
});
test('whitespace does not count as a locally configured credential',()=>{
 const r=inspectP0ProviderReadiness({
  PAYPAL_SANDBOX_CLIENT_ID:' ',PAYPAL_SANDBOX_CLIENT_SECRET:'  \n',
  GEMINI_API_KEY:'\t'
 });
 assert.equal(r.missingVariableNames.length,3);
});
test('invalid map fails before producing a report',()=>{
 for(const invalid of [null,[],3,'secret'])
  assert.throws(()=>inspectP0ProviderReadiness(invalid),{name:'TypeError'});
});
test('secret values never appear anywhere in serialized structured report',()=>{
 const r=inspectP0ProviderReadiness(full),s=JSON.stringify(r);
 for(const value of Object.values(full))assert.equal(s.includes(value),false);
 assert.equal(s.includes('PAYPAL_SANDBOX_CLIENT_SECRET'),false);
 // Missing variable names are intended metadata only.
 assert.ok(r.credentialsNeverEmitted);
});
test('readiness report never recommends a real network or public deployment action',()=>{
 const r=inspectP0ProviderReadiness(full);
 assert.equal(r.mayDeploy,false);
 assert.equal(r.mode,'LOCAL_VARIABLE_NAMES_ONLY_NO_NETWORK');
 assert.equal(r.next,'READ_docs/technical/PPL_P0_REAL_PROVIDER_UNBLOCK_20261024.md');
});
test('CLI exits blocked (2) without exposing credentials, even if names are populated',()=>{
 const path=fileURLToPath(new URL('../scripts/check_p0_provider_readiness.mjs',import.meta.url));
 const p=spawnSync(process.execPath,[path],{
  encoding:'utf8',timeout:10000,
  env:{...process.env,...full}
 });
 assert.equal(p.status,2,p.stderr);
 for(const value of Object.values(full)){
  assert.equal(p.stdout.includes(value),false);
  assert.equal(p.stderr.includes(value),false);
 }
 assert.equal(JSON.parse(p.stdout).ai.generation,'NOT_TESTED');
});
