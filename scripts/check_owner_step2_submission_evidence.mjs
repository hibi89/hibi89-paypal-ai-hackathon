// One owner-local, non-mutating check of historic PayPal and Part2 evidence.
// No provider network, no order CREATE/CAPTURE, no Gemini, no DB writes.
// Output is a strictly allowlisted status-only JSON intended for review.
import {homedir} from 'node:os';
import {join} from 'node:path';
import {inspectOwnerMvpReceipt} from '../src/owner_mvp_receipt.mjs';
import {inspectOwnerTwoPartEvidence} from '../src/owner_private_two_part_evidence.mjs';
import {projectStep2Evidence} from '../src/owner_step2_evidence_projection.mjs';

if(process.argv.length!==2){
 process.stdout.write(JSON.stringify({schemaVersion:1,
  state:'NO_ARGUMENTS_SUPPORTED',providerRequestsPerformedNow:0,
  paymentPostsPerformedNow:0,localDatabaseWritesPerformed:false,
  releaseHold:true})+'\n');
 process.exitCode=2;
}else{
 const home=homedir();
 const ownerDirectory=join(home,'.paypal-ai-mvp-private');
 const part2Base=join(home,'.paypal-ai-pilot-private');
 try{
  const first=inspectOwnerMvpReceipt({directory:ownerDirectory});
  const second=inspectOwnerTwoPartEvidence({ownerDirectory,
   part2Filename:join(part2Base,'part2-owner-lab.sqlite'),
   budgetFilename:join(part2Base,'part2-owner-quota.sqlite'),
   scope:{actor:'operator_owner',merchant:'fictional_merchant',job:'part2_demo_once'}
  });
  const safe=projectStep2Evidence(first,second);
  process.stdout.write(JSON.stringify(safe)+'\n');
  if(safe.state==='LOCAL_EVIDENCE_REVIEW_REQUIRED')process.exitCode=2;
 }catch{
  process.stdout.write(JSON.stringify({schemaVersion:1,
   state:'LOCAL_EVIDENCE_REVIEW_REQUIRED',
   part1Status:'LOCAL_EVIDENCE_REVIEW_REQUIRED',
   part2Status:'PART2_EVIDENCE_REVIEW_REQUIRED',
   sameTransactionProven:false,freshPayPalOrGeminiAttestation:false,
   providerRequestsPerformedNow:0,paymentPostsPerformedNow:0,
   localDatabaseWritesPerformed:false,safeToRepeatPayment:false,
   submitted:false,releaseHold:true,
   nextAction:'OWNER_VERIFY_EXISTING_PRIVATE_FILES_NO_RETRY'})+'\n');
  process.exitCode=2;
 }
}
