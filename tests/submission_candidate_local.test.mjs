import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {prepareSubmissionCandidate,verifyPrivateSyntheticVideo,verifyPrivateV4oFilm,verifyPrivateV4oZipKit,probePrivateWebmDuration} from '../scripts/prepare_submission_candidate.mjs';

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
 assert.equal(packet.mainBranchRelease,'PUBLIC_MAIN_SOURCE_LICENSE_RECORDED_NOT_LIVE_RECHECKED');
 assert.equal(packet.mainBranchReleaseVerifiedLive,false);
 assert.equal(packet.currentWorknovaMainReleased,false);
 assert.equal(packet.defaultMainPromotionRequiredForDevpost,false);
 assert.equal(packet.sourceBranchesLiveRechecked,false);
 assert.match(packet.currentWorknovaReviewerSourceUrl,/\/tree\/lead\/paypal$/);
 assert.equal(packet.finalEnglishCopy,'OWNER_REVIEW_COPY_VALIDATED_NOT_PUBLISHED');
 const md=readFileSync(new URL('../output/submission/submission_candidate.md',import.meta.url),'utf8');
 assert.match(md,/PRIVATE SUBMISSION CANDIDATE \(NOT SUBMITTED\)/);
 assert.match(md,/tree\/main/);
 assert.match(md,/tree\/lead\/paypal/);
 assert.match(md,/Earlier default-main source \(Proofline branding\)/);
 assert.match(md,/Default-main promotion: OPTIONAL, NOT REQUIRED FOR DEVPOST/);
 assert.doesNotMatch(md,/Main branch release: OWNER APPROVAL REQUIRED/);
 assert.match(md,/NOT a live lookup/);
 assert.match(md,/owner-reported historical test, not the synthetic video/);
 assert.match(md,/OWNER TO ADD AFTER APPROVED PUBLIC YOUTUBE UPLOAD/);
 assert.match(md,/Final concise English copy \(UNPUBLISHED \/ OWNER REVIEW\)/);
 assert.match(md,/Original detailed draft \(archive \/ NOT SUBMITTED\)/);
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

test('hash-pinned WORKNOVA v4o preview stays private and checks sidecar and duration',()=>{
 const root=fresh();
 try{
  const filename='WORKNOVA_v4o_170s_PRIVATE.mp4';
  const fake=Buffer.concat([Buffer.from([0,0,0,16]),Buffer.from('ftypmp42'),
   Buffer.from('UNIT TEST ARTIFICIAL BYTES, NOT A VIDEO')]);
  const sha256=createHash('sha256').update(fake).digest('hex');
  const proof={status:'V4O_PRIVATE_VISUAL_REVIEW_NOT_APPROVED',
   film_sha256:sha256,bytes:fake.length,duration_seconds:170,frames:4250,
   audio_md5:'MD5=2959cc9c1f5ee996edaefb3b06a147ea',
   full_av_decode:'PASS',provider_calls:0,release_hold:true,
   new_voice:false,new_srt:false,preserved_frames:3825};
  const expected={filename,sha256,bytes:fake.length,seconds:170,frames:4250,
   audioMd5:proof.audio_md5};
  const film=join(root,filename),sidecar=join(root,'WORKNOVA_v4o_170s_PRIVATE.json');
  writeFileSync(film,fake);writeFileSync(sidecar,JSON.stringify(proof));
  const check=()=>verifyPrivateV4oFilm(root,{expected,probeDuration:()=>
   ({status:'MEDIA_DURATION_UNDER_180_VERIFIED',durationSeconds:170})});
  const checked=check();
  assert.equal(checked.status,'LOCAL_PRIVATE_V4O_INTEGRITY_VERIFIED');
  assert.equal(checked.mediaDurationProbed,true);
  assert.equal(checked.ownerVisualApproval,false);
  assert.equal(checked.publiclyUploaded,false);
  assert.equal(checked.providerCalls,0);
  assert.equal(verifyPrivateV4oFilm(root,{expected,probeDuration:()=>
   ({status:'MEDIA_DURATION_UNDER_180_VERIFIED',durationSeconds:169.8})}).mediaDurationProbed,false);
  writeFileSync(sidecar,JSON.stringify({...proof,release_hold:false}));
  assert.throws(check,/V4O_PROOF_CONTRACT_MISMATCH/);
  writeFileSync(sidecar,JSON.stringify(proof));
  writeFileSync(film,Buffer.concat([fake,Buffer.from('X')]));
  assert.throws(check,/V4O_MEDIA_BYTES_MISMATCH/);
  rmSync(sidecar);
  assert.throws(check,/V4O_MEDIA_OR_PROOF_MISSING/);
 }finally{rmSync(root,{recursive:true,force:true})}
});
test('missing WORKNOVA v4o film keeps prior synthetic candidate behavior',()=>{
 const root=fresh();
 try{assert.equal(verifyPrivateV4oFilm(root),null)}
 finally{rmSync(root,{recursive:true,force:true})}
});

test('read-only v4o kit bridge accepts only pinned private status, never publication',()=>{
 const path='C:\\offline\\PRIVATE.zip';
 const valid={status:'LOCAL_PRIVATE_V4O_ZIP_VERIFIED_NOT_APPROVED',
  filename:'WORKNOVA_v4o_170s_PRIVATE.mp4',
  sha256:'219b9e21eba9aa77b473f6cfdcc28e7f7afd36d978e7cf37d970f63094856985',
  bytes:25494944,mediaDurationProbed:true,mediaDurationSeconds:170,
  frames:4250,memberCount:7,resolution:'1920x1080',
  ownerVisualApproval:false,publiclyUploaded:false,providerCalls:0,
  newVoice:false,newSubtitles:false,releaseHold:true};
 const calls=[];
 const mock=(cmd,args,options)=>{calls.push({cmd,args,options});
  return {status:0,stdout:JSON.stringify(valid)}};
 const v=verifyPrivateV4oZipKit(path,{runner:mock});
 assert.equal(v.source,'LOCAL_READ_ONLY_PRIVATE_ZIP');
 assert.equal(v.ownerVisualApproval,false);
 assert.equal(v.publiclyUploaded,false);
 assert.equal(v.mediaDurationProbed,true);
 assert.equal(calls.length,1);
 assert.equal(calls[0].args.at(-1),path);
 assert.equal(calls[0].options.shell,false);
 for(const invalid of [
  {...valid,ownerVisualApproval:true},{...valid,publiclyUploaded:true},
  {...valid,mediaDurationSeconds:180},{...valid,sha256:'a'.repeat(64)}
 ]){
  assert.throws(()=>verifyPrivateV4oZipKit(path,{
   runner:()=>({status:0,stdout:JSON.stringify(invalid)})}),/V4O_PRIVATE_ZIP_CONTRACT_INVALID/);
 }
 assert.throws(()=>verifyPrivateV4oZipKit(path,{
  runner:()=>({status:2,stdout:'',stderr:'rejected'})}),
  /V4O_PRIVATE_ZIP_VERIFICATION_FAILED/);
});
test('private ZIP explicit path is passed into offline packet without extracting',()=>{
 const path='PRIVATE_WORKNOVA.zip';
 const packet=prepareSubmissionCandidate({
  v4oKitPath:path,inspectV4oKit:(given)=>{
   assert.equal(given,path);
   return {status:'LOCAL_PRIVATE_V4O_INTEGRITY_VERIFIED',
    filename:'WORKNOVA_v4o_170s_PRIVATE.mp4',mediaDurationProbed:true,
    ownerVisualApproval:false,publiclyUploaded:false};
  }});
 assert.equal(packet.privateVideo.filename,'WORKNOVA_v4o_170s_PRIVATE.mp4');
 assert.equal(packet.privateVideo.ownerVisualApproval,false);
 assert.equal(packet.ownerVisualApproval,false);
 assert.equal(packet.externalSubmissionEligible,false);
 assert.equal(packet.authorizedToPublish,false);
 assert.equal(packet.devpostReceipt,'NOT_SUBMITTED');
});
