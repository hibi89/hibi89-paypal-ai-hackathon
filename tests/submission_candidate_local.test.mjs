import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {prepareSubmissionCandidate,verifyPrivateSyntheticVideo,probePrivateWebmDuration} from '../scripts/prepare_submission_candidate.mjs';

const fresh=()=>mkdtempSync(join(tmpdir(),'paypal-local-submission-'));
function makeFixture(dir){
  mkdirSync(dir,{recursive:true});
  const filename='paypal-synthetic-review-20261029-161300.webm';
  const video=Buffer.concat([Buffer.from([0x1a,0x45,0xdf,0xa3]),Buffer.from('SYNTHETIC UNIT TEST ONLY')]);
  const hash=createHash('sha256').update(video).digest('hex');
  const metadata={evidence_class:'OFFLINE_SYNTHETIC_BROWSER_CAPTURE_ONLY',
    storyboard_version:'TWO_PART_FIVE_SKILLS_V3',
    demonstrated_categories:['ai_work','general_services'],
    demonstrated_skills:['delegate','a2a','gift','churn','invoice'],
    owner_catalog_demonstrated:true,
    video_filename:filename,video_sha256:hash,video_bytes:video.byteLength,
    wall_clock_elapsed_seconds:14.5,provider_calls:0,payment_posts:0,
    media_duration_independently_probed:false,publicly_uploaded:false,
    devpost_submitted:false,owner_approval_for_publication:false};
  writeFileSync(join(dir,filename),video);
  const manifest=join(dir,filename.replace('.webm','.manifest.json'));
  writeFileSync(manifest,JSON.stringify(metadata));
  return {filename,manifest,metadata,video};
}
test('private synthetic submission video verifies hash and not-public status',()=>{
 const root=fresh();
 try{
  const folder=join(root,'output','videos');
  const {filename}=makeFixture(folder);
  const result=verifyPrivateSyntheticVideo(folder);
  assert.equal(result.filename,filename);
  assert.equal(result.status,'LOCAL_SYNTHETIC_WEBM_INTEGRITY_VERIFIED');
  assert.equal(result.mediaDurationProbed,false);
  assert.equal(result.publiclyUploaded,false);
  assert.equal(result.storyboardVersion,'TWO_PART_FIVE_SKILLS_V3');
  assert.deepEqual(result.demonstratedSkills,['delegate','a2a','gift','churn','invoice']);
 }finally{rmSync(root,{recursive:true,force:true})}
});
test('video candidate rejects tampering and fabricated publication claims',()=>{
 const root=fresh();
 try{
  const {filename,metadata,manifest}=makeFixture(root);
  const bad={...metadata,publicly_uploaded:true};
  writeFileSync(manifest,JSON.stringify(bad));
  assert.throws(()=>verifyPrivateSyntheticVideo(root),/UNAUTHORIZED_PUBLICATION_CLAIM/);
  writeFileSync(manifest,JSON.stringify({...metadata,storyboard_version:'OPPORTUNITY_FIRST_V2'}));
  assert.throws(()=>verifyPrivateSyntheticVideo(root),/FINAL_TWO_PART_STORYBOARD_REQUIRED/);
  writeFileSync(manifest,JSON.stringify({...metadata,owner_catalog_demonstrated:false}));
  assert.throws(()=>verifyPrivateSyntheticVideo(root),/OWNER_INPUT_CATALOG_FOOTAGE_MISSING/);
  writeFileSync(manifest,JSON.stringify({...metadata,demonstrated_skills:['delegate','a2a']}));
  assert.throws(()=>verifyPrivateSyntheticVideo(root),/FINAL_FIVE_SKILLS_VIDEO_REQUIRED/);
  writeFileSync(manifest,JSON.stringify(metadata));
  writeFileSync(join(root,filename),Buffer.from('CORRUPTED'));
  assert.throws(()=>verifyPrivateSyntheticVideo(root),/VIDEO_BYTES_MISMATCH|VIDEO_WEBM_HEADER_MISSING|VIDEO_SHA256_MISMATCH/);
 }finally{rmSync(root,{recursive:true,force:true})}
});
test('owner packet never claims official submission or provider verification',()=>{
 const packet=prepareSubmissionCandidate();
 assert.equal(packet.authorizedToPublish,false);
 assert.equal(packet.externalSubmissionEligible,false);
 assert.equal(packet.publicVideoUrl,'NOT_PROVIDED');
 assert.equal(packet.devpostReceipt,'NOT_SUBMITTED');
 assert.equal(packet.mainBranchRelease,'NOT_APPROVED');
 const md=readFileSync(new URL('../output/submission/submission_candidate.md',import.meta.url),'utf8');
 assert.match(md,/PRIVATE SUBMISSION CANDIDATE \(NOT SUBMITTED\)/);
 assert.match(md,/owner-reported historical test, not the synthetic video/);
 assert.match(md,/OWNER TO ADD AFTER APPROVED PUBLIC YOUTUBE UPLOAD/);
});

test('ffprobe checks actual encoded duration, not recording elapsed time',()=>{
 const calls=[];
 const stub=(bin,args,opts)=>{calls.push({bin,args,opts});return {status:0,stdout:'133.680000\n'};};
 assert.deepEqual(probePrivateWebmDuration('/tmp/private.webm',stub),
  {status:'MEDIA_DURATION_UNDER_180_VERIFIED',durationSeconds:133.68});
 assert.equal(calls[0].bin,'ffprobe');
 assert.equal(calls[0].args.at(-1),'/tmp/private.webm');
 assert.equal(calls[0].opts.shell,false);
 assert.equal(calls[0].opts.timeout,10000);
});
test('media duration >= 180 and invalid/missing ffprobe cannot qualify for final review',()=>{
 for(const [response,status] of [
  [{status:0,stdout:'180.000\n'},'MEDIA_DURATION_TOO_LONG'],
  [{status:0,stdout:'oops'},'MEDIA_DURATION_NOT_VERIFIED'],
  [{status:1,stderr:'Invalid data'},'MEDIA_DURATION_NOT_VERIFIED'],
  [{error:{code:'ENOENT'},status:null},'MEDIA_DURATION_NOT_VERIFIED'],
  [{status:0,stdout:'NaN'},'MEDIA_DURATION_NOT_VERIFIED'],
  [{status:0,stdout:'0'},'MEDIA_DURATION_NOT_VERIFIED']]){
  assert.equal(probePrivateWebmDuration('/tmp/private.webm',()=>response).status,status);
 }
});
test('owner review depends on independently measured duration while staying unpublished',()=>{
 const root=fresh();
 try{
  makeFixture(root);
  const short=verifyPrivateSyntheticVideo(root,{probeDuration:()=>
    ({status:'MEDIA_DURATION_UNDER_180_VERIFIED',durationSeconds:133.68})});
  assert.equal(short.mediaDurationProbed,true);
  assert.equal(short.mediaDurationSeconds,133.68);
  assert.equal(short.publiclyUploaded,false);
  const tooLong=verifyPrivateSyntheticVideo(root,{probeDuration:()=>
    ({status:'MEDIA_DURATION_TOO_LONG',durationSeconds:180})});
  assert.equal(tooLong.mediaDurationProbed,false);
  assert.equal(tooLong.mediaDurationStatus,'MEDIA_DURATION_TOO_LONG');
  const counterfeit=verifyPrivateSyntheticVideo(root,{probeDuration:()=>
    ({status:'MEDIA_DURATION_UNDER_180_VERIFIED',durationSeconds:999})});
  assert.equal(counterfeit.mediaDurationProbed,false);
 }finally{rmSync(root,{recursive:true,force:true})}
});

test('missing ffprobe uses already-present recorder FFmpeg metadata without downloading tools',()=>{
 const commands=[];
 const run=(name,args,opts)=>{
  commands.push({name,args,opts});
  if(name==='ffprobe')return {error:{code:'ENOENT'},status:null};
  if(name==='/existing/playwright/ffmpeg')return {status:1,stderr:
   "Input #0, matroska,webm\n  Duration: 00:02:13.680, start: 0.000\n  Stream #0:0: Video: vp8"};
  return {error:{code:'ENOENT'}};
 };
 const found=probePrivateWebmDuration('/private/video.webm',run,
  {findBundled:()=>'/existing/playwright/ffmpeg'});
 assert.deepEqual(found,{status:'MEDIA_DURATION_UNDER_180_VERIFIED',durationSeconds:133.68});
 assert.equal(commands[1].name,'/existing/playwright/ffmpeg');
 assert.equal(commands[1].opts.shell,false);
 const bad=probePrivateWebmDuration('/private/video.webm',(name)=>name==='ffprobe'?
  {error:{code:'ENOENT'}}:{status:1,stderr:'Invalid data'},
  {findBundled:()=>'/existing/playwright/ffmpeg'});
 assert.equal(bad.status,'MEDIA_DURATION_NOT_VERIFIED');
});
