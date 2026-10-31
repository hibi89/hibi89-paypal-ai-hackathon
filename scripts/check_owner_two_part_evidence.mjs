// Read-only owner-side summary of EXISTING private Part1/Part2 SQLite evidence.
// No credentials, no provider GET/POST, no ledger migration, no database writes.
import {homedir} from 'node:os';
import {join} from 'node:path';
import {inspectOwnerTwoPartEvidence}
 from '../src/owner_private_two_part_evidence.mjs';

if(process.argv.length!==2){
 process.stdout.write(JSON.stringify({
  status:'READ_ONLY_NO_ARGUMENTS_SUPPORTED',networkRequests:0,
  fileWritesPerformed:false,paymentAuthorized:false
 })+'\n');
 process.exitCode=2;
}else{
 const base=join(homedir(),'.paypal-ai-pilot-private');
 try{
  const result=inspectOwnerTwoPartEvidence({
   ownerDirectory:join(homedir(),'.paypal-ai-mvp-private'),
   part2Filename:join(base,'part2-owner-lab.sqlite'),
   budgetFilename:join(base,'part2-owner-quota.sqlite'),
   scope:{actor:'operator_owner',merchant:'fictional_merchant',
    job:'part2_demo_once'}
  });
  process.stdout.write(JSON.stringify(result)+'\n');
  // A useful comparison can still show historical data without asserting a
  // linked payment. Use nonzero exit only when either DB cannot be reviewed.
  if(['BOTH_PARTS_NEED_REVIEW','PART1_NOT_VERIFIED','PART2_NOT_VERIFIED']
   .includes(result.status))process.exitCode=2;
 }catch{
  process.stdout.write(JSON.stringify({
   status:'PRIVATE_TWO_PART_EVIDENCE_REVIEW_REQUIRED',
   networkRequests:0,fileWritesPerformed:false,paymentAuthorized:false
  })+'\n');
  process.exitCode=2;
 }
}
