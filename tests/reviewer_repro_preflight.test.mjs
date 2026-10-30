import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {inspectReviewerPrereqs,REVIEW_FILES,REVIEW_SCRIPT_ROUTES} from '../src/reviewer_repro_preflight.mjs';

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
test('all ten browser scripts have explicit local source and HTTP route coverage',()=>{
 assert.equal(REVIEW_SCRIPT_ROUTES.length,10);
 assert.equal(new Set(REVIEW_SCRIPT_ROUTES.map(x=>x.url)).size,10);
 assert.equal(new Set(REVIEW_SCRIPT_ROUTES.map(x=>x.file)).size,10);
 assert.equal(inspect().checks.browserScripts,'READY');
 for(const {file} of REVIEW_SCRIPT_ROUTES){
   const result=inspect({files:{...files,[file]:''}});
   assert.equal(result.ready,false,file);
   assert.ok(result.missingAssets.includes(file),file);
 }
});
test('missing, extra or reordered script links cannot pass reviewer preflight',()=>{
 const html=files['web/offline_demo.html'];
 const first=REVIEW_SCRIPT_ROUTES[0].url;
 const second=REVIEW_SCRIPT_ROUTES[1].url;
 for(const altered of [
   html.replace('src="'+first+'"','src="/demo/not-present.js"'),
   html.replace('src="'+first+'"','src="'+second+'"'),
   html.replace(/<script src="\/demo\/marketplace.js" defer><\/script>/,''),
   html.replace('</body>','<script src="https://example.com/js"></script></body>'),
   html.replace('</body>','<script src=https://example.com/evil.js></script></body>'),
   html.replace('</body>','<script>window.exampleOnly=true</script></body>')
 ]){
   const result=inspect({files:{...files,'web/offline_demo.html':altered}});
   assert.equal(result.ready,false);
   assert.equal(result.checks.browserScripts,'BROWSER_SCRIPT_LINKS_MISSING_OR_CHANGED');
 }
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
test('CLI serves ten exact browser JavaScript sources plus eight core reads and rejects POST mutations',()=>{
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
 assert.equal(r.readOnlyRequests,18);
 assert.equal(r.blockedMutationRequests,2);
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
