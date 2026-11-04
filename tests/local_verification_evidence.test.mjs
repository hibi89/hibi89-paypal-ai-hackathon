import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyLocalVerification,localVerificationExitCode} from '../src/local_verification_evidence.mjs';
const base=['GIT_HEAD','NODE_VERSION','MASTER_PROGRESS','NODE_REGRESSION',
 'SYNTHETIC_MVP_E2E','REVIEWER_LOOPBACK','CHROMIUM_LOOPBACK','CHROMIUM_PART2'];
const rows=()=>base.map(name=>({name,status:'PASS'}));
test('only real Part1+Part2 browser PASS can certify local two-part reviewer proof',()=>{
 const r=classifyLocalVerification(rows());
 assert.equal(r.status,'VERIFY_LOCAL_TWO_PART_PASS');
 assert.equal(r.twoPartBrowserVerified,true);
 assert.equal(r.realProviderVerified,false);
 assert.equal(r.productionVerified,false);
 assert.equal(r.submissionEligible,false);
});
test('skipped Part2 browser explicitly prevents full reviewer PASS',()=>{
 const list=rows();
 list.find(r=>r.name==='CHROMIUM_PART2').status='SKIP';
 const r=classifyLocalVerification(list);
 assert.equal(r.status,'VERIFY_LOCAL_PARTIAL');
 assert.equal(r.twoPartBrowserVerified,false);
 assert.equal(r.browserProof.CHROMIUM_PART2,'SKIP');
});
test('no browser runtime cannot be reported as a two-part completed review',()=>{
 const list=rows().map(r=>r.name.startsWith('CHROMIUM_')?{...r,status:'SKIP'}:r);
 assert.equal(classifyLocalVerification(list).status,'VERIFY_LOCAL_PARTIAL');
});
test('explicit core mode is distinguished from a full browser test',()=>{
 const list=rows().map(r=>['REVIEWER_LOOPBACK','CHROMIUM_LOOPBACK','CHROMIUM_PART2'].includes(r.name)?
  {...r,status:'SKIP'}:r);
 const result=classifyLocalVerification(list,{core:true});
 assert.equal(result.status,'VERIFY_LOCAL_CORE_PASS');
 assert.equal(result.twoPartBrowserVerified,false);
});
test('critical regression failure blocks even when both browsers passed',()=>{
 const list=rows(); list.find(r=>r.name==='NODE_REGRESSION').status='FAIL';
 assert.equal(classifyLocalVerification(list).status,'VERIFY_LOCAL_FAIL');
});
test('missing mandatory test cannot silently pass',()=>{
 const list=rows().filter(r=>r.name!=='NODE_REGRESSION');
 assert.equal(classifyLocalVerification(list).status,'VERIFY_LOCAL_FAIL');
 assert.throws(()=>classifyLocalVerification([{name:'X',status:'PENDING'}]),/INVALID_LOCAL_VERIFICATION_RESULTS/);
});

test('exit 2 blocks full-review automation when a browser test is skipped',()=>{
 assert.equal(localVerificationExitCode('VERIFY_LOCAL_TWO_PART_PASS'),0);
 assert.equal(localVerificationExitCode('VERIFY_LOCAL_CORE_PASS'),0);
 assert.equal(localVerificationExitCode('VERIFY_LOCAL_PARTIAL'),2);
 assert.equal(localVerificationExitCode('VERIFY_LOCAL_FAIL'),1);
 assert.throws(()=>localVerificationExitCode('UNKNOWN'),/UNRECOGNIZED_LOCAL_VERIFICATION_STATUS/);
});
