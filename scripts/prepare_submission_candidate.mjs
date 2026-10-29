// Offline, owner-controlled submission packet. NEVER uploads or submits.
// Reads only public checkout files and ignored synthetic video under output/videos.
// Does not touch owner-private SQLite, provider credentials, payment APIs or browsers.
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,lstatSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assessSubmissionEvidence} from '../src/submission_evidence_gate.mjs';

const ROOT=resolve(fileURLToPath(new URL('../',import.meta.url)));
const entryPaths=['LICENSE','README.md','docs/JUDGE_REPRODUCTION_EN.md',
  'docs/VIDEO_STORYBOARD_EN.md',
  'docs/DEVPOST_ENTRY_AND_VIDEO_COPY_EN_20261029.md',
  'scripts/record_judge_demo.py'];
const read=(root,path)=>{try{return readFileSync(join(root,path),'utf8').replace(/\r\n?/g,'\n')}catch{return ''}};
const requireValue=(condition,why)=>{if(!condition)throw Error(why)};
export function verifyPrivateSyntheticVideo(dir){
  if(!existsSync(dir))return {status:'LOCAL_VIDEO_NOT_RECORDED'};
  const candidates=readdirSync(dir)
    .filter(n=>/^paypal-synthetic-review-\d{8}-\d{6}\.manifest\.json$/.test(n))
    .map(name=>({name,time:lstatSync(join(dir,name)).mtimeMs}))
    .sort((a,b)=>b.time-a.time);
  if(!candidates.length)return {status:'LOCAL_VIDEO_NOT_RECORDED'};
  const path=join(dir,candidates[0].name);
  requireValue(!lstatSync(path).isSymbolicLink(),'MANIFEST_SYMLINK_FORBIDDEN');
  const manifest=JSON.parse(readFileSync(path,'utf8'));
  const filename=candidates[0].name.replace(/\.manifest\.json$/,'.webm');
  requireValue(manifest.video_filename===filename,'VIDEO_FILENAME_MISMATCH');
  requireValue(basename(filename)===filename,'UNSAFE_VIDEO_FILENAME');
  requireValue(manifest.evidence_class==='OFFLINE_SYNTHETIC_BROWSER_CAPTURE_ONLY','PROVIDER_PROOF_FALSE_CLAIM');
  requireValue(manifest.provider_calls===0&&manifest.payment_posts===0,'PROVIDER_ACTION_CLAIM_FORBIDDEN');
  requireValue(manifest.publicly_uploaded===false&&manifest.devpost_submitted===false&&
    manifest.owner_approval_for_publication===false,'UNAUTHORIZED_PUBLICATION_CLAIM');
  requireValue(manifest.media_duration_independently_probed===false,'VIDEO_DURATION_PROBE_UNVERIFIED');
  requireValue(typeof manifest.wall_clock_elapsed_seconds==='number'&&
    manifest.wall_clock_elapsed_seconds>0&&manifest.wall_clock_elapsed_seconds<178,'RECORDING_WALL_CLOCK_LIMIT_UNVERIFIED');
  requireValue(/^[a-f0-9]{64}$/.test(manifest.video_sha256),'VIDEO_HASH_MISSING');
  const dest=join(dir,filename);
  requireValue(existsSync(dest)&&!lstatSync(dest).isSymbolicLink()&&lstatSync(dest).isFile(),'VIDEO_FILE_MISSING');
  const bytes=lstatSync(dest).size;
  requireValue(bytes>0&&bytes<=250*1024*1024&&bytes===manifest.video_bytes,'VIDEO_BYTES_MISMATCH');
  const data=readFileSync(dest);
  requireValue(data.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])),'VIDEO_WEBM_HEADER_MISSING');
  const hash=createHash('sha256').update(data).digest('hex');
  requireValue(hash===manifest.video_sha256,'VIDEO_SHA256_MISMATCH');
  return {status:'LOCAL_SYNTHETIC_WEBM_INTEGRITY_VERIFIED',filename,sha256:hash,
    bytes,recordingWallClockSeconds:manifest.wall_clock_elapsed_seconds,
    mediaDurationProbed:false,publiclyUploaded:false};
}
export function prepareSubmissionCandidate({root=ROOT}={}){
  root=resolve(root);
  const ledger=JSON.parse(read(root,'data/paypal_daily_progress.json'));
  const files=Object.fromEntries(entryPaths.map(path=>[path,read(root,path)]));
  const assessment=assessSubmissionEvidence({ledger,files});
  const video=verifyPrivateSyntheticVideo(join(root,'output','videos'));
  const localSource=assessment.localAssets.every(a=>!a.status.includes('MISSING')&&!a.status.includes('INVALID'));
  const ownerReviewReady=localSource&&video.status==='LOCAL_SYNTHETIC_WEBM_INTEGRITY_VERIFIED';
  const copy=files['docs/DEVPOST_ENTRY_AND_VIDEO_COPY_EN_20261029.md'];
  requireValue(copy.includes('DRAFT — NOT PUBLISHED'),'DEVPOST_COPY_DRAFT_GUARD_MISSING');
  const dest=join(root,'output','submission');
  mkdirSync(dest,{recursive:true});
  const report={
    status:ownerReviewReady?'LOCAL_PACKET_PREPARED_NOT_SUBMITTED':'LOCAL_PACKET_NEEDS_VIDEO_OR_SOURCE',
    sourceStatus:localSource?'LOCAL_SOURCE_DRAFTS_PRESENT':'LOCAL_SOURCE_MISSING',
    privateVideo:video,
    ownerReviewReady,
    authorizedToPublish:false,
    publicVideoUrl:'NOT_PROVIDED',
    devpostReceipt:'NOT_SUBMITTED',
    mainBranchRelease:'NOT_APPROVED',
    externalSubmissionEligible:false,
    externalGates:assessment.externalGates,
    note:'This file is local, synthetic, unpublished. No video duration probe, real-provider replay, publicity consent or Devpost submission.'
  };
  const md='# PROOFLINE — PRIVATE SUBMISSION CANDIDATE (NOT SUBMITTED)\n\n'+
    '**No public YouTube link or Devpost receipt exists in this report. Do not publish without owner review and approval.**\n\n'+
    '- Source: https://github.com/hibi89/hibi89-paypal-ai-hackathon/tree/lead/paypal\n'+
    '- Local video: '+(video.filename||'NOT RECORDED ON THIS MACHINE')+'\n'+
    '- Private WebM integrity: '+video.status+'\n'+
    '- Public video URL: NOT PROVIDED\n- Devpost receipt: NOT SUBMITTED\n'+
    '- Main branch release: OWNER APPROVAL REQUIRED\n'+
    '- Real Gemini / PayPal Sandbox: owner-reported historical test, not the synthetic video\n\n'+
    '---\n\n'+copy;
  writeFileSync(join(dest,'submission_candidate.md'),md,'utf8');
  writeFileSync(join(dest,'submission_candidate_status.json'),JSON.stringify(report,null,2)+'\n','utf8');
  return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const report=prepareSubmissionCandidate();
    console.log(JSON.stringify(report,null,2));
    console.log('PRIVATE_SUBMISSION_PACKET output/submission/ (gitignored; no uploads)');
    // An incomplete private packet is expected, not a failed script.
  }catch(error){
    console.error('SUBMISSION_CANDIDATE_FAILED '+error.message);
    process.exitCode=1;
  }
}
