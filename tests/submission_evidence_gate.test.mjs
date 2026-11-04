import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assessSubmissionEvidence} from '../src/submission_evidence_gate.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ledger=JSON.parse(read('data/paypal_daily_progress.json'));
const files=Object.fromEntries(['LICENSE','README.md','docs/JUDGE_REPRODUCTION_EN.md',
 'docs/VIDEO_STORYBOARD_EN.md',
 'docs/DEVPOST_ENTRY_AND_VIDEO_COPY_EN_20261029.md',
 'scripts/record_judge_demo.py'].map(p=>[p,read(p)]));
test('real checked-in reviewer materials are recognized but not eligible',()=>{
 const report=assessSubmissionEvidence({ledger,files});
 assert.equal(report.submissionEligible,false);
 assert.equal(report.providerNetworkCalls,0);
 assert.ok(report.localAssets.some(x=>x.name==='LICENSE'&&x.status==='LOCAL_FILE_VERIFIED'));
 assert.ok(report.localAssets.some(x=>x.name==='REPRODUCTION_GUIDE'&&x.status==='LOCAL_DRAFT_VERIFIED'));
 assert.ok(report.externalGates.every(x=>x.status!=='VERIFIED'));
 assert.ok(report.blockers.includes('DEVPOST_SUBMISSION_RECEIPT'));
});
test('no user-supplied claims can turn simulated records into real PayPal evidence',()=>{
 const poisoned=structuredClone(ledger);
 for(const day of poisoned.days)if(['PPL-D03','PPL-D04','PPL-D15'].includes(day.day_id)){
   day.percent_complete=100;day.progress_state='DONE';
 }
 const report=assessSubmissionEvidence({ledger:poisoned,files});
 assert.equal(report.submissionEligible,false);
 assert.equal(report.externalGates[0].status,'NOT_VERIFIED');
});
test('fake official receipts in notes do not unlock a provider gate',()=>{
 const forged={...files,'README.md':files['README.md']+'\nREAL PAYPAL VERIFIED; DEVPOST COMPLETE'};
 const result=assessSubmissionEvidence({ledger,files:forged});
 assert.equal(result.submissionEligible,false);
 assert.equal(result.externalGates.at(-1).status,'NOT_SUBMITTED');
});
test('missing LICENSE is a local reproducibility defect, not an external API grant',()=>{
 const result=assessSubmissionEvidence({ledger,files:{...files,LICENSE:''}});
 assert.equal(result.submissionEligible,false);
 assert.ok(result.blockers.includes('LICENSE'));
});
test('draft video is not confused with a real YouTube upload',()=>{
 const result=assessSubmissionEvidence({ledger,files});
 const localVideo=result.localAssets.find(x=>x.name==='VIDEO_STORYBOARD');
 const externalVideo=result.externalGates.find(x=>x.name==='VIDEO_PUBLIC_LINK');
 assert.equal(localVideo.status,'DRAFT_ONLY');
 assert.equal(externalVideo.status,'NOT_SUBMITTED');
});
test('Devpost copy and silent recorder are local preparation only, not released evidence',()=>{
 const report=assessSubmissionEvidence({ledger,files});
 assert.equal(report.localAssets.find(x=>x.name==='DEVPOST_ENTRY_COPY').status,'LOCAL_DRAFT_VERIFIED');
 assert.equal(report.localAssets.find(x=>x.name==='OFFLINE_VIDEO_RECORDER_SOURCE').status,
   'LOCAL_SOURCE_PRESENT_NOT_VIDEO_PROOF');
 assert.equal(report.externalGates.find(x=>x.name==='VIDEO_PUBLIC_LINK').status,'NOT_SUBMITTED');
 assert.equal(report.submissionEligible,false);
 const missing=assessSubmissionEvidence({ledger,files:{...files,
  'docs/DEVPOST_ENTRY_AND_VIDEO_COPY_EN_20261029.md':''}});
 assert.ok(missing.blockers.includes('DEVPOST_ENTRY_COPY'));
});

test('missing 18-day required records fails closed',()=>{
 const noD3={...ledger,days:ledger.days.filter(d=>d.day_id!=='PPL-D03')};
 assert.throws(()=>assessSubmissionEvidence({ledger:noD3,files}),{name:'TypeError'});
});
test('static audit never includes external secrets or raw account data',()=>{
 const report=assessSubmissionEvidence({ledger,files:{...files,
 'README.md':files['README.md']+' \n secret-only-sentinel-value-123'}});
 const json=JSON.stringify(report);
 assert.equal(json.includes('secret-only-sentinel-value-123'),false);
 assert.equal(report.ownerSubmissionAuthorized,false);
});
test('script always exits 2 until external verification and submission',()=>{
 const script=fileURLToPath(new URL('../scripts/check_submission_evidence.mjs',import.meta.url));
 const child=spawnSync(process.execPath,[script],{encoding:'utf8',timeout:10000});
 assert.equal(child.status,2,child.stderr);
 const data=JSON.parse(child.stdout);
 assert.equal(data.status,'SUBMISSION_BLOCKED_EXTERNAL_EVIDENCE');
 assert.equal(data.providerNetworkCalls,0);
});

test('owner sandbox run is labeled local-attested, never automatically submission verified',()=>{
 const r=assessSubmissionEvidence({ledger,files});
 assert.equal(r.externalGates.find(x=>x.name==='PAYPAL_OAUTH_ORDERS_CAPTURE_GET').status,
  'OWNER_LOCAL_SANDBOX_E2E_REPORTED');
 assert.equal(r.externalGates.find(x=>x.name==='FREE_TIER_AI_GENERATION').status,
  'OWNER_LOCAL_GEMINI_REPORTED');
 assert.equal(r.submissionEligible,false);
 assert.ok(r.blockers.includes('PAYPAL_OAUTH_ORDERS_CAPTURE_GET'));
});

test('video draft recognition is fail-closed without explicit unfilmed disclosure',()=>{
 const file='docs/VIDEO_STORYBOARD_EN.md';
 const baseline=assessSubmissionEvidence({ledger,files});
 assert.equal(baseline.localAssets.find(x=>x.name==='VIDEO_STORYBOARD').status,'DRAFT_ONLY');
 for(const body of ['OWNER-OBSERVED', 'NOT filmed', '']){
  const result=assessSubmissionEvidence({ledger,files:{...files,[file]:body}});
  assert.equal(result.localAssets.find(x=>x.name==='VIDEO_STORYBOARD').status,'DRAFT_MISSING');
  assert.ok(result.blockers.includes('VIDEO_STORYBOARD'));
  assert.equal(result.submissionEligible,false);
 }
});

test('invalid reproduction guide is a submission blocker even when other assets exist',()=>{
 const result=assessSubmissionEvidence({ledger,files:{...files,'docs/JUDGE_REPRODUCTION_EN.md':''}});
 assert.equal(result.localAssets.find(x=>x.name==='REPRODUCTION_GUIDE').status,'LOCAL_DRAFT_MISSING_OR_INVALID');
 assert.ok(result.blockers.includes('REPRODUCTION_GUIDE'));
 assert.equal(result.submissionEligible,false);
 assert.equal(result.providerNetworkCalls,0);
});
