import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {prepareSubmissionCandidate,verifyPrivateSyntheticVideo} from '../scripts/prepare_submission_candidate.mjs';

const fresh=()=>mkdtempSync(join(tmpdir(),'paypal-local-submission-'));
function makeFixture(dir){
  mkdirSync(dir,{recursive:true});
  const filename='paypal-synthetic-review-20261029-161300.webm';
  const video=Buffer.concat([Buffer.from([0x1a,0x45,0xdf,0xa3]),Buffer.from('SYNTHETIC UNIT TEST ONLY')]);
  const hash=createHash('sha256').update(video).digest('hex');
  const metadata={evidence_class:'OFFLINE_SYNTHETIC_BROWSER_CAPTURE_ONLY',
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
 }finally{rmSync(root,{recursive:true,force:true})}
});
test('video candidate rejects tampering and fabricated publication claims',()=>{
 const root=fresh();
 try{
  const {filename,metadata,manifest}=makeFixture(root);
  const bad={...metadata,publicly_uploaded:true};
  writeFileSync(manifest,JSON.stringify(bad));
  assert.throws(()=>verifyPrivateSyntheticVideo(root),/UNAUTHORIZED_PUBLICATION_CLAIM/);
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
