import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectTrackedTreeClean,compareRecordedSource} from '../scripts/prepare_submission_candidate.mjs';

const sha='a'.repeat(40);
const video={status:'LOCAL_SYNTHETIC_WEBM_INTEGRITY_VERIFIED',
  sourceCommitSha:sha,sourceTrackedClean:true};
const checkout={commitSha:sha,branch:'work/paypal-final-qa-20261030'};

test('recorded private WebM only matches the exact clean Git checkout',()=>{
 assert.equal(compareRecordedSource(video,checkout,true),'MATCHED_CLEAN_SOURCE');
 assert.equal(compareRecordedSource(video,{...checkout,commitSha:'b'.repeat(40)},true),
   'VIDEO_SOURCE_MISMATCH_OR_DIRTY');
 assert.equal(compareRecordedSource(video,checkout,false),'VIDEO_SOURCE_MISMATCH_OR_DIRTY');
 assert.equal(compareRecordedSource({...video,sourceTrackedClean:false},checkout,true),
   'VIDEO_SOURCE_MISMATCH_OR_DIRTY');
});

test('legacy private WebM without source SHA can never be declared owner-review-ready',()=>{
 for(const candidate of [
   {status:'LOCAL_SYNTHETIC_WEBM_INTEGRITY_VERIFIED'},
   {...video,sourceCommitSha:null},
   {...video,sourceCommitSha:'invalid'},
   {status:'LOCAL_VIDEO_NOT_RECORDED'}]){
   assert.equal(compareRecordedSource(candidate,checkout,true),'VIDEO_SOURCE_UNVERIFIED');
 }
});

test('checkout tracked files must be clean in both worktree and index',()=>{
 const seen=[];
 const clean=inspectTrackedTreeClean('/fixture',(bin,args,options)=>{
   assert.equal(bin,'git'); assert.equal(options.shell,false);
   seen.push(args.join(' '));
   return {status:0};
 });
 assert.equal(clean,true);
 assert.deepEqual(seen,['diff --quiet --','diff --cached --quiet --']);
});

test('modified, staged or unreadable Git tree cannot be treated as matching',()=>{
 for(const outcomes of [[1,0],[0,1],[null,0]]){
   let i=0;
   assert.equal(inspectTrackedTreeClean('/fixture',()=>({status:outcomes[i++]})),false);
 }
});
