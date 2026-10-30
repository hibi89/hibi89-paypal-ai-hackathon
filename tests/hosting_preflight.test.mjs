import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {assessHostingPreflight, AUDITED_SOURCES} from '../src/hosting_preflight.mjs';
const source = ()=>Object.fromEntries(AUDITED_SOURCES.map(p=>[
  p, readFileSync(new URL('../'+p,import.meta.url),'utf8')
]));

test('D15 real sources produce explicit no-deploy security blockers',()=>{
  const value=assessHostingPreflight(source());
  assert.equal(value.status,'DEPLOYMENT_BLOCKED');
  assert.equal(value.mayDeploy,false);
  const codes=new Set(value.blockers.map(x=>x.code));
  for (const expected of ['LOOPBACK_NODE_HTTP','SYNTHETIC_IDENTITY',
    'DISK_SQLITE_LEDGER','DEMO_SUBSCRIPTION_ONLY','PROCESS_LOCAL_LIMIT',
    'MOCK_AI_ONLY','PAYMENT_POST_DISABLED','AUTHORIZATION_REQUIRED',
    'REMOTE_PROOF_REQUIRED']) assert.ok(codes.has(expected),expected);
  assert.equal(value.external.productionUrl,'NOT_TESTED');
  assert.equal(value.external.realPayPal,'NOT_TESTED');
  assert.equal(value.external.realAI,'NOT_TESTED');
});

test('missing source cannot silently remove no-deploy determination',()=>{
  const value=assessHostingPreflight({});
  assert.equal(value.mayDeploy,false);
  assert.ok(value.blockers.some(x=>x.code==='SOURCE_NOT_VERIFIED'));
  assert.ok(value.blockers.some(x=>x.code==='REMOTE_PROOF_REQUIRED'));
});

test('untrusted approval and deployment metadata do not override static gate',()=>{
  const input={...source(),approved:true,productionUrl:'https://not-real.example',
    cloudflareToken:'DO_NOT_ECHO_THIS'};
  const value=assessHostingPreflight(input);
  assert.equal(value.status,'DEPLOYMENT_BLOCKED');
  assert.equal(value.mayDeploy,false);
  assert.ok(!JSON.stringify(value).includes('DO_NOT_ECHO_THIS'));
  assert.ok(!JSON.stringify(value).includes('not-real.example'));
});

test('CLI is deterministic, no network and returns nonzero to forbid mistaken deploy',()=>{
  const child=spawnSync(process.execPath,
    ['scripts/check_hosting_preflight.mjs'],{encoding:'utf8',timeout:5000});
  assert.equal(child.status,2);
  assert.equal(child.stderr,'');
  const report=JSON.parse(child.stdout);
  assert.equal(report.mode,'STATIC_SOURCE_REVIEW_ONLY');
  assert.equal(report.mayDeploy,false);
});
