// Offline, owner-controlled submission packet. NEVER uploads or submits.
// Reads only public checkout files and ignored synthetic video under output/videos.
// Does not touch owner-private SQLite, provider credentials, payment APIs or browsers.
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
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
// Read-only Git provenance: no network, no branch switch, no release claim.
// In CI a PR checkout may be detached, so commit SHA is the stable identifier.
export function inspectLocalCheckout(root=ROOT,run=spawnSync){
  const options={cwd:root,encoding:'utf8',windowsHide:true,shell:false,
    timeout:3000,maxBuffer:4096};
  const result=run('git',['rev-parse','--verify','HEAD'],options);
  const sha=typeof result?.stdout==='string'?result.stdout.trim():'';
  if(result?.status!==0||!/^[a-f0-9]{40}$/.test(sha))
    return {status:'LOCAL_GIT_COMMIT_UNVERIFIED',commitSha:null,branch:null};
  const branchResult=run('git',['symbolic-ref','--quiet','--short','HEAD'],options);
  const rawBranch=typeof branchResult?.stdout==='string'?branchResult.stdout.trim():'';
  const name=branchResult?.status===0&&/^[A-Za-z0-9._/-]{1,200}$/.test(rawBranch)
    ?rawBranch:null;
  return {status:'LOCAL_GIT_COMMIT_RECORDED_NOT_RELEASED',commitSha:sha,
    branch:name};
}
// No network and no tracked-file mutation. A dirty or unknown checkout may
// produce footage, but it must never be automatically labeled release-ready.
export function inspectTrackedTreeClean(root=ROOT,run=spawnSync){
  const options={cwd:root,encoding:'utf8',windowsHide:true,shell:false,
    timeout:3000,maxBuffer:4096};
  return [['diff','--quiet','--'],['diff','--cached','--quiet','--']]
    .every(args=>run('git',args,options)?.status===0);
}
export function compareRecordedSource(video,localCheckout,trackedTreeClean){
  if(video?.status!=='LOCAL_SYNTHETIC_WEBM_INTEGRITY_VERIFIED'||
     !/^[a-f0-9]{40}$/.test(video?.sourceCommitSha||''))
    return 'VIDEO_SOURCE_UNVERIFIED';
  if(localCheckout?.commitSha===video.sourceCommitSha&&
     video.sourceTrackedClean===true&&trackedTreeClean===true)
    return 'MATCHED_CLEAN_SOURCE';
  return 'VIDEO_SOURCE_MISMATCH_OR_DIRTY';
}
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
  const sourceSha=manifest.source_commit_sha;
  requireValue(sourceSha==null||/^[a-f0-9]{40}$/.test(sourceSha),'VIDEO_SOURCE_SHA_INVALID');
  const hash=createHash('sha256').update(data).digest('hex');
  requireValue(hash===manifest.video_sha256,'VIDEO_SHA256_MISMATCH');
  return {status:'LOCAL_SYNTHETIC_WEBM_INTEGRITY_VERIFIED',filename,sha256:hash,
    bytes,recordingWallClockSeconds:manifest.wall_clock_elapsed_seconds,
    mediaDurationProbed:false,publiclyUploaded:false,
    sourceCommitSha:sourceSha||null,sourceTrackedClean:manifest.source_tracked_tree_clean===true};
}
export function prepareSubmissionCandidate({root=ROOT}={}){
  root=resolve(root);
  const ledger=JSON.parse(read(root,'data/paypal_daily_progress.json'));
  const files=Object.fromEntries(entryPaths.map(path=>[path,read(root,path)]));
  const assessment=assessSubmissionEvidence({ledger,files});
  const video=verifyPrivateSyntheticVideo(join(root,'output','videos'));
  const localCheckout=inspectLocalCheckout(root);
  const localTrackedTreeClean=inspectTrackedTreeClean(root);
  const videoSourceMatch=compareRecordedSource(video,localCheckout,localTrackedTreeClean);
  const localSource=assessment.localAssets.every(a=>!a.status.includes('MISSING')&&!a.status.includes('INVALID'));
  const ownerReviewReady=localSource&&videoSourceMatch==='MATCHED_CLEAN_SOURCE';
  const copy=files['docs/DEVPOST_ENTRY_AND_VIDEO_COPY_EN_20261029.md'];
  requireValue(copy.includes('DRAFT — NOT PUBLISHED'),'DEVPOST_COPY_DRAFT_GUARD_MISSING');
  const dest=join(root,'output','submission');
  mkdirSync(dest,{recursive:true});
  const report={
    status:ownerReviewReady?'LOCAL_PACKET_PREPARED_NOT_SUBMITTED':'LOCAL_PACKET_NEEDS_VIDEO_OR_SOURCE',
    sourceStatus:localSource?'LOCAL_SOURCE_DRAFTS_PRESENT':'LOCAL_SOURCE_MISSING',
    privateVideo:video,
    localCheckout,
    localTrackedTreeClean,
    videoSourceMatch,
    publicSourceRelease:'NOT_APPROVED',
    ownerReviewReady,
    authorizedToPublish:false,
    publicVideoUrl:'NOT_PROVIDED',
    devpostReceipt:'NOT_SUBMITTED',
    mainBranchRelease:'NOT_APPROVED',
    externalSubmissionEligible:false,
    externalGates:assessment.externalGates,
    note:'Private candidate; only a SHA-matched clean source recording can be marked owner-review-ready. No media duration probe, real-provider replay, publicity consent or Devpost submission.'
  };
  const md='# PROOFLINE — PRIVATE SUBMISSION CANDIDATE (NOT SUBMITTED)\n\n'+
    '**No public YouTube link or Devpost receipt exists in this report. Do not publish without owner review and approval.**\n\n'+
    '- Local Git commit (NOT a public release): '+(localCheckout.commitSha||'UNVERIFIED')+'\n'+
    '- Local checked-out branch: '+(localCheckout.branch||'DETACHED_OR_UNVERIFIED')+'\n'+
    '- Recorded video source match: '+videoSourceMatch+'\n'+
    '- Local tracked Git files clean: '+(localTrackedTreeClean?'YES':'NO_OR_UNVERIFIED')+'\n'+
    '- Public code release: NOT APPROVED; verify source branch and root LICENSE before Devpost\n'+
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
