import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const script=new URL('../scripts/verify_local.mjs',import.meta.url);
test('local verification plan is offline only and avoids owner API and payment commands',()=>{
 const p=spawnSync(process.execPath,[fileURLToPath(script),'--plan'],{encoding:'utf8',timeout:5000});
 assert.equal(p.status,0,p.stderr);
 const r=JSON.parse(p.stdout);
 assert.equal(r.status,'VERIFY_LOCAL_PLAN_ONLY');
 assert.equal(r.paymentPosts,0);
 assert.equal(r.privateDbWrites,0);
 assert.deepEqual(r.steps.filter(x=>x.run).map(x=>x.name),[
  'GIT_HEAD','NODE_VERSION','MASTER_PROGRESS','NODE_REGRESSION',
  'SYNTHETIC_MVP_E2E','REVIEWER_LOOPBACK','CHROMIUM_LOOPBACK']);
 assert.ok(!JSON.stringify(r).includes('mvp:quick'));
});
test('core plan skips optional browser without skipping core regression and mock MVP',()=>{
 const p=spawnSync(process.execPath,[fileURLToPath(script),'--plan','--core'],{encoding:'utf8',timeout:5000});
 assert.equal(p.status,0,p.stderr);
 const r=JSON.parse(p.stdout);
 assert.equal(r.steps.find(x=>x.name==='NODE_REGRESSION').run,true);
 assert.equal(r.steps.find(x=>x.name==='CHROMIUM_LOOPBACK').reason,'CORE_MODE');
});
test('unknown verify flags cannot trigger external side effects or tests',()=>{
 const p=spawnSync(process.execPath,[fileURLToPath(script),'--execute'],{encoding:'utf8',timeout:5000});
 assert.equal(p.status,2);
 assert.equal(JSON.parse(p.stdout).status,'INVALID_VERIFY_ARGUMENTS');
});
test('Windows one-command wrapper delegates to safe Node verifier only',()=>{
 const txt=readFileSync(new URL('../verify_local.ps1',import.meta.url),'utf8');
 assert.ok(txt.includes('scripts\\verify_local.mjs'));
 assert.ok(!txt.includes('Remove-Item'));
 assert.ok(!txt.includes('Invoke-WebRequest'));
 assert.ok(!txt.includes('npm install'));
});
