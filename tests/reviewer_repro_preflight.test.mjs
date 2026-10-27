import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {inspectReviewerPrereqs,REVIEW_FILES} from '../src/reviewer_repro_preflight.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const manifest=JSON.parse(read('package.json'));
const files=Object.fromEntries(REVIEW_FILES.map(path=>[path,read(path)]));
const inspect=(patch={})=>inspectReviewerPrereqs({
 nodeVersion:'22.5.0',manifest,files,...patch
});
test('checked-in English reviewer assets and no-install Node scripts are locally ready',()=>{
 const r=inspect();
 assert.equal(r.ready,true);
 assert.equal(r.status,'PREREQUISITES_READY');
 assert.equal(r.providerNetworkCalls,0);
 assert.equal(r.externalProviderEvidence,false);
 assert.equal(r.submissionEligible,false);
 assert.deepEqual(r.missingAssets,[]);
});
test('a missing browser client or empty English guide blocks reviewer prerequisites',()=>{
 for(const path of ['web/demo_client.js','web/contract_client.js',
  'web/integration_client.js','docs/JUDGE_REPRODUCTION_EN.md']){
  const next={...files,[path]:''};
  const r=inspect({files:next});
  assert.equal(r.ready,false);
  assert.equal(r.checks.assets,'REQUIRED_ASSET_MISSING');
  assert.ok(r.missingAssets.includes(path));
 }
});
test('Node runtime before node:sqlite availability cannot be labeled ready',()=>{
 for(const version of ['18.20.0','20.19.0','21.0.0','22.4.9','bogus']){
  const r=inspect({nodeVersion:version});
  assert.equal(r.ready,false);
  assert.equal(r.checks.runtime,'UNSUPPORTED_NODE_RUNTIME');
 }
 assert.equal(inspect({nodeVersion:'22.5.0'}).checks.runtime,'READY');
 assert.equal(inspect({nodeVersion:'24.0.0'}).checks.runtime,'READY');
});
test('missing loopback script or local license is a concrete blocker',()=>{
 assert.equal(inspect({manifest:{...manifest,scripts:{}}}).ready,false);
 assert.equal(inspect({files:{...files,LICENSE:'proprietary'}}).checks.license,
  'LOCAL_LICENSE_MISSING');
});
test('CLI actually starts isolated loopback server, reads four paths and closes it',()=>{
 const cmd=fileURLToPath(new URL('../scripts/check_reviewer_repro.mjs',import.meta.url));
 const child=spawnSync(process.execPath,['--experimental-sqlite',cmd],{
  encoding:'utf8',timeout:15000,
  env:{...process.env,PAYPAL_SANDBOX_CLIENT_SECRET:'SYNTHETIC_DO_NOT_PRINT',
   GEMINI_API_KEY:'SYNTHETIC_DO_NOT_PRINT'}
 });
 assert.equal(child.status,0,child.stderr+'\\n'+child.stdout);
 const r=JSON.parse(child.stdout);
 assert.equal(r.status,'REVIEWER_LOCAL_READY');
 assert.equal(r.ready,true);
 assert.equal(r.readOnlyRequests,4);
 assert.equal(r.blockedMutationRequests,1);
 assert.equal(r.paymentPostRequests,0);
 assert.equal(r.providerNetworkCalls,0);
 assert.equal(r.externalProviderEvidence,false);
 assert.equal(r.submissionEligible,false);
 assert.equal(child.stdout.includes('SYNTHETIC_DO_NOT_PRINT'),false);
 assert.equal(r.checks.loopback,'READY');
});

test('manifest must declare the minimum SQLite-capable Node version',()=>{
 const old={...manifest,engines:{node:'>=22'}};
 const result=inspect({manifest:old});
 assert.equal(result.ready,false);
 assert.equal(result.checks.scripts,'MISSING_OR_UNEXPECTED_NPM_SCRIPTS');
});
