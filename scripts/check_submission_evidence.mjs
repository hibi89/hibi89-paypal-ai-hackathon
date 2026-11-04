import {readFileSync} from 'node:fs';
import {assessSubmissionEvidence} from '../src/submission_evidence_gate.mjs';
const root=new URL('../',import.meta.url);
const file=path=>{
 try{return readFileSync(new URL(path,root),'utf8')}catch{return ''}
};
const ledger=JSON.parse(file('data/paypal_daily_progress.json'));
const files=Object.fromEntries(['LICENSE','README.md','docs/JUDGE_REPRODUCTION_EN.md',
 'docs/VIDEO_STORYBOARD_EN.md',
 'docs/DEVPOST_ENTRY_AND_VIDEO_COPY_EN_20261029.md',
 'scripts/record_judge_demo.py'].map(p=>[p,file(p)]));
const result=assessSubmissionEvidence({ledger,files});
process.stdout.write(JSON.stringify(result,null,2)+'\n');
process.exitCode=result.submissionEligible?0:2;
