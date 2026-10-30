import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectTrackedTreeClean,compareRecordedSource,evaluatePrivateVideoReviewGate,probePrivateVideoDuration} from '../scripts/prepare_submission_candidate.mjs';

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

// Release-preparation correctness: the owner-review flag must not overstate
// technical readiness when ffprobe is absent or the encoded WebM is too long.
test('owner-review-ready requires clean source AND independently probed encoded duration',()=>{
 const ready={localSource:true,videoSourceMatch:'MATCHED_CLEAN_SOURCE',
   privateVideoDuration:{status:'ENCODED_MEDIA_UNDER_THREE_MINUTES',seconds:153.96}};
 assert.deepEqual(evaluatePrivateVideoReviewGate(ready),{
   technicalVideoReady:true,ownerReviewReady:true
 });
 const failures=[
   {...ready,privateVideoDuration:{status:'FFPROBE_UNAVAILABLE_OR_FAILED',seconds:null}},
   {...ready,privateVideoDuration:{status:'ENCODED_MEDIA_UNDER_THREE_MINUTES',seconds:null}},
   {...ready,privateVideoDuration:{status:'ENCODED_MEDIA_UNDER_THREE_MINUTES',seconds:180}},
   {...ready,privateVideoDuration:{status:'ENCODED_MEDIA_UNDER_THREE_MINUTES',seconds:0}},
   {...ready,privateVideoDuration:{status:'ENCODED_MEDIA_TOO_LONG',seconds:181}},
   {...ready,videoSourceMatch:'VIDEO_SOURCE_MISMATCH_OR_DIRTY'},
   {...ready,videoSourceMatch:'VIDEO_SOURCE_UNVERIFIED'}
 ];
 for(const value of failures){
   const check=evaluatePrivateVideoReviewGate(value);
   assert.equal(check.technicalVideoReady,false,JSON.stringify(value));
   assert.equal(check.ownerReviewReady,false,JSON.stringify(value));
 }
 const insufficient=evaluatePrivateVideoReviewGate({...ready,localSource:false});
 assert.equal(insufficient.technicalVideoReady,true);
 assert.equal(insufficient.ownerReviewReady,false);
});

test('encoded media proof requires an actual successful ffprobe duration strictly below 180s',()=>{
 const fake={...video,filename:'paypal-synthetic-review-20261030-133333.webm'};
 for(const [stdout,expectedStatus,expectedSeconds] of [
   ['149.600000','ENCODED_MEDIA_UNDER_THREE_MINUTES',149.6],
   ['179.999999','ENCODED_MEDIA_UNDER_THREE_MINUTES',179.999999],
   ['180.000000','ENCODED_MEDIA_TOO_LONG',180],
   ['181.000000','ENCODED_MEDIA_TOO_LONG',181]
 ]){
   let calls=0;
   const actual=probePrivateVideoDuration('/safe/local/videos',fake,{run:(bin,args,opt)=>{
     calls++;
     assert.equal(bin,'ffprobe');
     assert.deepEqual(args.slice(0,4),['-v','error','-show_entries','format=duration']);
     assert.equal(args.at(-2),'-i');
     assert.ok(args.at(-1).endsWith(fake.filename));
     assert.equal(opt.shell,false);
     assert.ok(opt.timeout>0);
     return {status:0,stdout};
   }});
   assert.equal(calls,1);
   assert.equal(actual.status,expectedStatus);
   assert.equal(actual.seconds,expectedSeconds);
 }
});

test('malformed, fabricated or missing ffprobe output never verifies video duration',()=>{
 const fake={...video,filename:'paypal-synthetic-review-20261030-133333.webm'};
 for(const stdout of ['', 'NaN', 'Infinity', '-1.000000', '180.000000 garbage',
    '1e2', '000150', '150.0000000', '150\n180']){
   const result=probePrivateVideoDuration('/safe/local/videos',fake,
      {run:()=>({status:0,stdout})});
   assert.equal(result.status,'FFPROBE_UNAVAILABLE_OR_FAILED',JSON.stringify(stdout));
   assert.equal(result.seconds,null);
 }
 const zero=probePrivateVideoDuration('/safe/local/videos',fake,{
   run:()=>({status:0,stdout:'0'})
 });
 assert.equal(zero.status,'ENCODED_MEDIA_DURATION_INVALID');
 assert.equal(zero.seconds,null);
 for(const run of [
   ()=>({status:1,stdout:'149.600000'}),
   ()=>{throw Error('PROBE_BINARY_NOT_FOUND')}
 ]){
   const result=probePrivateVideoDuration('/safe/local/videos',fake,{run});
   assert.equal(result.status,'FFPROBE_UNAVAILABLE_OR_FAILED');
   assert.equal(result.seconds,null);
 }
});

test('unverified or unsafe video metadata never invokes ffprobe',()=>{
 const bad=[
   {status:'LOCAL_VIDEO_NOT_RECORDED'},
   {...video,filename:'../../escape.webm'},
   {...video,filename:'owner-private.webm'}
 ];
 for(const candidate of bad){
   const result=probePrivateVideoDuration('/safe/local/videos',candidate,{
     run:()=>{throw Error('FFPROBE_MUST_NOT_BE_CALLED')}
   });
   assert.equal(result.status,'NO_VERIFIED_VIDEO_TO_PROBE');
   assert.equal(result.seconds,null);
 }
});
