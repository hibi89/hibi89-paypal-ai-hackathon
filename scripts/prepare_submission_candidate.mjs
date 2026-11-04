// Offline, owner-controlled submission packet. NEVER uploads or submits.
// Reads only public checkout files and ignored synthetic video under output/videos.
// Does not touch owner-private SQLite, provider credentials, payment APIs or browsers.
import {createHash} from 'node:crypto';
import {homedir} from 'node:os';
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
// The recorder's wall-clock time is NOT the encoded media duration.
// Prefer ffprobe. On fresh Windows installs, reuse the already-installed
// Playwright ffmpeg helper instead of downloading another tool or guessing.
function findRecorderFfmpeg(){
  const roots=[process.env.LOCALAPPDATA&&join(process.env.LOCALAPPDATA,'ms-playwright'),
    join(homedir(),'.cache','ms-playwright')].filter(Boolean);
  for(const root of roots){
    let folders=[];
    try{folders=readdirSync(root).filter(name=>/^ffmpeg-\d+$/.test(name))}catch{}
    for(const folder of folders){
      for(const name of ['ffmpeg-win64.exe','ffmpeg-linux','ffmpeg-mac']){
        const path=join(root,folder,name);
        try{if(lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink())return path}catch{}
      }
    }
  }
  return null;
}
export function probePrivateWebmDuration(file,runner=spawnSync,
  {findBundled=findRecorderFfmpeg}={}){
  const opts={encoding:'utf8',shell:false,windowsHide:true,timeout:10000,
    maxBuffer:4096,env:{PATH:process.env.PATH||'',
      SystemRoot:process.env.SystemRoot||''}};
  const classify=seconds=>Number.isFinite(seconds)&&seconds>0?
    {status:seconds<180?'MEDIA_DURATION_UNDER_180_VERIFIED':'MEDIA_DURATION_TOO_LONG',
      durationSeconds:seconds}:
    {status:'MEDIA_DURATION_NOT_VERIFIED',durationSeconds:null};
  const result=runner('ffprobe',[
    '-v','error','-show_entries','format=duration',
    '-of','default=noprint_wrappers=1:nokey=1',file
  ],opts);
  const raw=typeof result?.stdout==='string'?result.stdout.trim():'';
  if(!result?.error&&result?.status===0&&/^[0-9]+(?:\.[0-9]+)?$/.test(raw))
    return classify(Number(raw));
  // Fail closed if ffprobe rejected the media. Fallback is ONLY for an absent binary.
  if(result?.error?.code!=='ENOENT')
    return {status:'MEDIA_DURATION_NOT_VERIFIED',durationSeconds:null};
  for(const executable of [findBundled(),'ffmpeg'].filter(Boolean)){
    const fallback=runner(executable,['-hide_banner','-i',file],opts);
    const info=typeof fallback?.stderr==='string'?fallback.stderr:'';
    // FFmpeg intentionally exits nonzero without an output target. Require
    // actual input video stream metadata and a parseable HH:MM:SS duration.
    const match=/Duration:\s*(\d{2}):([0-5]\d):([0-5]\d(?:\.\d+)?)/.exec(info);
    if(!fallback?.error&&match&&/Stream #\d+:\d+.*Video:/.test(info)){
      const seconds=Number(match[1])*3600+Number(match[2])*60+Number(match[3]);
      return classify(seconds);
    }
  }
  return {status:'MEDIA_DURATION_NOT_VERIFIED',durationSeconds:null};
}
export function verifyPrivateSyntheticVideo(dir,{probeDuration=probePrivateWebmDuration}={}){
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
  // Final candidate now requires ACTUAL recorded actions from BOTH product
  // parts. A hash-valid Part1-only V2 recording is no longer review-ready.
  requireValue(manifest.storyboard_version==='TWO_PART_FIVE_SKILLS_V3',
    'FINAL_TWO_PART_STORYBOARD_REQUIRED');
  requireValue(JSON.stringify(manifest.demonstrated_categories)===
    JSON.stringify(['ai_work','general_services']),
    'FINAL_TWO_CATEGORY_VIDEO_REQUIRED');
  requireValue(JSON.stringify(manifest.demonstrated_skills)===
    JSON.stringify(['delegate','a2a','gift','churn','invoice']),
    'FINAL_FIVE_SKILLS_VIDEO_REQUIRED');
  requireValue(manifest.owner_catalog_demonstrated===true,'OWNER_INPUT_CATALOG_FOOTAGE_MISSING');
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
  const duration=probeDuration(dest);
  const durationValid=duration?.status==='MEDIA_DURATION_UNDER_180_VERIFIED'&&
    typeof duration.durationSeconds==='number'&&Number.isFinite(duration.durationSeconds)&&
    duration.durationSeconds>0&&duration.durationSeconds<180;
  return {status:'LOCAL_SYNTHETIC_WEBM_INTEGRITY_VERIFIED',filename,sha256:hash,
    bytes,recordingWallClockSeconds:manifest.wall_clock_elapsed_seconds,
    storyboardVersion:manifest.storyboard_version,
    demonstratedSkills:[...manifest.demonstrated_skills],
    mediaDurationProbed:durationValid,
    mediaDurationSeconds:Number.isFinite(duration?.durationSeconds)?duration.durationSeconds:null,
    mediaDurationStatus:durationValid?'MEDIA_DURATION_UNDER_180_VERIFIED':
      duration?.status==='MEDIA_DURATION_TOO_LONG'?'MEDIA_DURATION_TOO_LONG':'MEDIA_DURATION_NOT_VERIFIED',
    publiclyUploaded:false};
}
export function prepareSubmissionCandidate({root=ROOT}={}){
  root=resolve(root);
  const ledger=JSON.parse(read(root,'data/paypal_daily_progress.json'));
  const files=Object.fromEntries(entryPaths.map(path=>[path,read(root,path)]));
  const assessment=assessSubmissionEvidence({ledger,files});
  const video=verifyPrivateSyntheticVideo(join(root,'output','videos'));
  const localSource=assessment.localAssets.every(a=>!a.status.includes('MISSING')&&!a.status.includes('INVALID'));
  const ownerReviewReady=localSource&&
    video.status==='LOCAL_SYNTHETIC_WEBM_INTEGRITY_VERIFIED'&&video.mediaDurationProbed&&
    // Assigned below after reading the new final copy.
    true;
  const copy=files['docs/DEVPOST_ENTRY_AND_VIDEO_COPY_EN_20261029.md'];
  // A separate short, owner-editable final entry draft. Never label this
  // unpublished copy as Devpost-submitted or provider-verified.
  const finalCopy=read(root,'docs/DEVPOST_FINAL_REVIEW_PACKET_EN_20261105.md');
  const requiredCopy=[
    'DRAFT — NOT PUBLISHED','OFFLINE_MOCK','AI Work','Global Services',
    'A2A negotiation','Delegate & Consent','Gift-finder',
    'Subscription Churn Saver','Invoice / Dispute Copilot',
    'not independently reproduced in CI',
    'OWNER TO ADD AFTER APPROVED PUBLIC YOUTUBE UPLOAD',
    'NOT SUBMITTED','RELEASE HOLD.'
  ];
  const finalCopyReady=finalCopy.length>=5000&&finalCopy.length<=18000&&
    requiredCopy.every(term=>finalCopy.includes(term));
  requireValue(copy.includes('DRAFT — NOT PUBLISHED'),'DEVPOST_COPY_DRAFT_GUARD_MISSING');
  // Keep owner review unready if the fresh English copy was removed or corrupted.
  const copyAndVideoReviewReady=ownerReviewReady&&finalCopyReady;
  const dest=join(root,'output','submission');
  mkdirSync(dest,{recursive:true});
  const report={
    status:copyAndVideoReviewReady?'LOCAL_PACKET_PREPARED_NOT_SUBMITTED':
      localSource&&video.status==='LOCAL_SYNTHETIC_WEBM_INTEGRITY_VERIFIED'&&
       !video.mediaDurationProbed?
        'LOCAL_PACKET_NEEDS_INDEPENDENT_MEDIA_DURATION_PROOF':
        localSource&&!finalCopyReady?'LOCAL_PACKET_NEEDS_FINAL_ENGLISH_COPY':
        'LOCAL_PACKET_NEEDS_VIDEO_OR_SOURCE',
    sourceStatus:localSource?'LOCAL_SOURCE_DRAFTS_PRESENT':'LOCAL_SOURCE_MISSING',
    privateVideo:video,
    ownerReviewReady:copyAndVideoReviewReady,
    finalEnglishCopy:finalCopyReady?
      'OWNER_REVIEW_COPY_VALIDATED_NOT_PUBLISHED':'OWNER_REVIEW_COPY_MISSING_OR_INVALID',
    authorizedToPublish:false,
    publicVideoUrl:'NOT_PROVIDED',
    devpostReceipt:'NOT_SUBMITTED',
    mainBranchRelease:'NOT_APPROVED',
    externalSubmissionEligible:false,
    externalGates:assessment.externalGates,
    note:'This packet is local, synthetic and unpublished. ffprobe checks WebM duration only when available; hash or media length does not verify providers, publication approval or Devpost submission.'
  };
  const md='# PROOFLINE — PRIVATE SUBMISSION CANDIDATE (NOT SUBMITTED)\n\n'+
    '**No public YouTube link or Devpost receipt exists in this report. Do not publish without owner review and approval.**\n\n'+
    '- Source: https://github.com/hibi89/hibi89-paypal-ai-hackathon/tree/lead/paypal\n'+
    '- Local video: '+(video.filename||'NOT RECORDED ON THIS MACHINE')+'\n'+
    '- Private WebM integrity: '+video.status+'\n'+
    '- Public video URL: NOT PROVIDED\n- Devpost receipt: NOT SUBMITTED\n'+
    '- Main branch release: OWNER APPROVAL REQUIRED\n'+
    '- Real Gemini / PayPal Sandbox: owner-reported historical test, not the synthetic video\n\n'+
    '## Final concise English copy (UNPUBLISHED / OWNER REVIEW)\n\n'+
    (finalCopyReady?finalCopy:'FINAL_ENGLISH_COPY_MISSING_OR_INVALID')+
    '\n\n---\n\n## Original detailed draft (archive / NOT SUBMITTED)\n\n'+copy;
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
