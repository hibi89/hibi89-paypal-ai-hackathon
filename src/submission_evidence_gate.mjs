// Submission preflight: reports which local reviewer assets exist and which
// external contest acceptance proofs are still absent. Never certifies third-party
// activity from offline GitHub CI, local documents, or untrusted status flags.
const ids=['PPL-D03','PPL-D04','PPL-D15','PPL-D16','PPL-D17','PPL-D18'];
const info=(name,status,description)=>Object.freeze({name,status,description});
const text=x=>typeof x==='string'?x:'';
export function assessSubmissionEvidence({ledger,files}={}){
 if(!ledger||!Array.isArray(ledger.days)||!files||typeof files!=='object'||Array.isArray(files))
  throw new TypeError('SUBMISSION_INPUTS_REQUIRED');
 const days=new Map(ledger.days.map(d=>[d.day_id,d]));
 if(ids.some(id=>!days.has(id)))throw new TypeError('DAY_RECORD_MISSING');
 const guide=text(files['docs/JUDGE_REPRODUCTION_EN.md']);
 const video=text(files['docs/VIDEO_STORYBOARD_EN.md']);
 const license=text(files.LICENSE);
 const readme=text(files['README.md']);
 const devpost=text(files['docs/DEVPOST_ENTRY_AND_VIDEO_COPY_EN_20261029.md']);
 const recorder=text(files['scripts/record_judge_demo.py']);
 const local=[
  info('LICENSE',license.startsWith('MIT License\n')&&license.includes('Copyright (c) 2026 hibi89')?
   'LOCAL_FILE_VERIFIED':'LOCAL_FILE_MISSING_OR_INVALID',
   'MIT grant, owner attribution and root LICENSE file'),
  info('REPRODUCTION_GUIDE',guide.includes('npm test')&&guide.includes('npm run demo')&&
   guide.includes('127.0.0.1')&&guide.includes('OFFLINE_MOCK')&&
   guide.includes('NOT')?'LOCAL_DRAFT_VERIFIED':'LOCAL_DRAFT_MISSING_OR_INVALID',
   'English instructions for synthetic loopback reproduction; not real API proof'),
  info('VIDEO_STORYBOARD',video.includes('NOT filmed')&&
   (video.includes('PLACEHOLDER')||video.includes('OWNER-OBSERVED'))?'DRAFT_ONLY':'DRAFT_MISSING',
   'Storyboard only, no recording or video submission receipt'),
  info('PROJECT_README',readme.includes('lead/paypal')&&
   readme.includes('CHAT_BOOTSTRAP')?'LOCAL_FILE_VERIFIED':'LOCAL_FILE_MISSING_OR_INVALID',
   'GitHub reviewer entrypoint'),
  info('DEVPOST_ENTRY_COPY',devpost.includes('DRAFT — NOT PUBLISHED')&&
   devpost.includes('owner-operated private Sandbox')&&devpost.includes('OFFLINE_MOCK')?
   'LOCAL_DRAFT_VERIFIED':'LOCAL_DRAFT_MISSING_OR_INVALID',
   'English Devpost draft with synthetic/provider provenance; not published'),
  info('OFFLINE_VIDEO_RECORDER_SOURCE',recorder.includes('RECORDED_SYNTHETIC_ONLY')&&
   recorder.includes('PROVIDER_CALLS=0')&&recorder.includes('PUBLIC_UPLOAD=NO')?
   'LOCAL_SOURCE_PRESENT_NOT_VIDEO_PROOF':'LOCAL_FILE_MISSING_OR_INVALID',
   'Credential-free local WebM recorder source; no filmed/public video proof'),
 ];
 const external=[
  info('PAYPAL_SANDBOX_BUSINESS_PERSONAL','NOT_VERIFIED','Independent real merchant/buyer account proof required'),
  info('PAYPAL_OAUTH_ORDERS_CAPTURE_GET','OWNER_LOCAL_SANDBOX_E2E_REPORTED','2026-10-28 owner terminal reported actual Sandbox order, buyer approval, capture and provider GET; not independently replayed or judge-accessible'),
  info('FREE_TIER_AI_GENERATION','OWNER_LOCAL_GEMINI_REPORTED','Owner terminal reported Gemini skill classification; quote UI integration and eligible zero-charge tier not independently verified'),
  info('PRODUCTION_OR_REVIEWER_ACCESS','NOT_TESTED','Reviewer access and real integration environment require verification'),
  info('VIDEO_PUBLIC_LINK','NOT_SUBMITTED','Recorded English walkthrough and owner-approved public link required'),
  info('DEVPOST_SUBMISSION_RECEIPT','NOT_SUBMITTED','Final owner-approved submission receipt required'),
 ];
 const blockers=[...local.filter(x=>['LOCAL_FILE_MISSING_OR_INVALID','LOCAL_DRAFT_MISSING','LOCAL_DRAFT_MISSING_OR_INVALID','DRAFT_MISSING'].includes(x.status)).map(x=>x.name),
 ...external.map(x=>x.name)];
 return Object.freeze({
  status:'SUBMISSION_BLOCKED_EXTERNAL_EVIDENCE',
  mode:'STATIC_LOCAL_ARTIFACT_AUDIT_NO_PROVIDER_ACCESS',
  submissionEligible:false,
  ownerSubmissionAuthorized:false,
  providerNetworkCalls:0,
  localAssets:Object.freeze(local),
  externalGates:Object.freeze(external),
  blockers:Object.freeze(blockers),
  progress:Object.freeze(Object.fromEntries(ids.map(id=>
   [id,Object.freeze({percentComplete:days.get(id).percent_complete,state:days.get(id).progress_state})]))),
  note:'Owner-reported local Sandbox E2E is not independent CI or judge-facing proof; local CI and drafts do not prove production, public video or Devpost completion'
 });
}
