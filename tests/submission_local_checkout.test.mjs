import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectLocalCheckout} from '../scripts/prepare_submission_candidate.mjs';

const sha='a'.repeat(40);
const stub=(branchResult)=>((binary,args,options)=>{
  assert.equal(binary,'git');
  assert.equal(options.shell,false);
  assert.ok(options.timeout>0);
  if(args[0]==='rev-parse')return {status:0,stdout:sha+'\n'};
  if(args[0]==='symbolic-ref')return branchResult;
  throw new Error('UNEXPECTED_GIT_COMMAND');
});

test('private submission packet identifies its exact checkout instead of assuming lead/paypal',()=>{
  const result=inspectLocalCheckout('/repo',stub({
    status:0,stdout:'work/paypal-final-qa-20261030\n'
  }));
  assert.deepEqual(result,{
    status:'LOCAL_GIT_COMMIT_RECORDED_NOT_RELEASED',
    commitSha:sha,branch:'work/paypal-final-qa-20261030'
  });
});

test('detached GitHub Actions checkout keeps commit provenance without fake branch',()=>{
  const result=inspectLocalCheckout('/repo',stub({status:1,stdout:''}));
  assert.equal(result.commitSha,sha);
  assert.equal(result.branch,null);
  assert.match(result.status,/NOT_RELEASED/);
});

test('missing or malformed Git source cannot be reported as verified',()=>{
  for(const result of [{status:1,stdout:''},{status:0,stdout:'bad\n'},
    {status:0,stdout:'../../private\n'}]){
    const read=inspectLocalCheckout('/repo',()=>result);
    assert.equal(read.status,'LOCAL_GIT_COMMIT_UNVERIFIED');
    assert.equal(read.commitSha,null);
    assert.equal(read.branch,null);
  }
});
