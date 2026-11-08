import test from 'node:test';
import assert from 'node:assert/strict';
import {projectStep2Evidence} from '../src/owner_step2_evidence_projection.mjs';
const first={status:'LOCAL_PROVIDER_RESULT_RECORDED_NOT_FRESH_GET',
 quoteAiBriefBinding:'LEGACY_NOT_CROSS_BOUND',providerGetPerformedNow:false,
 providerPostPerformedNow:false,geminiCallPerformedNow:false,
 sqliteWritesPerformed:false,remoteId:'SECRET_ORDER_123',
 classifiedSkills:['web','payments','qa']};
const second={status:'SEPARATE_DEMOS_AMOUNT_MISMATCH',
 part1:{status:'LOCAL_PROVIDER_RESULT_RECORDED_NOT_FRESH_GET',
 historicalLocalCaptureRecorded:true,secret:'MERCHANT_SECRET'},
 part2:{status:'PRIVATE_A2A_SQLITE_RESULT_NOT_GEMINI_ATTESTED',
 transcriptSha256:'a'.repeat(64),amountMinor:29000},networkRequests:0,
 fileWritesPerformed:false,sameTransactionProven:false,
 paypalCapturePerformed:false,geminiPostPerformed:false};

test('two local records remain separate, not independent provider attestation',()=>{
 const r=projectStep2Evidence(first,second);
 assert.equal(r.state,'TWO_LOCAL_RECORDS_NOT_SAME_TRANSACTION');
 assert.equal(r.localPart1Recorded,true);
 assert.equal(r.localPart2Recorded,true);
 assert.equal(r.sameTransactionProven,false);
 assert.equal(r.freshPayPalOrGeminiAttestation,false);
 assert.equal(r.paymentPostsPerformedNow,0);
 assert.equal(r.releaseHold,true);
});
test('historical Part1 only with missing Part2 is not combined proof',()=>{
 const r=projectStep2Evidence(first,{...second,status:'PART2_NOT_VERIFIED',
  part2:{status:'PART2_EVIDENCE_NOT_RECORDED'}});
 assert.equal(r.state,'PART1_LOCAL_RECORD_ONLY_PART2_UNVERIFIED');
 assert.equal(r.localPart2Recorded,false);
});
test('missing Part1 cannot be promoted by synthetic Part2',()=>{
 const r=projectStep2Evidence({...first,status:'NO_LOCAL_ATTEMPT'},second);
 assert.equal(r.state,'LOCAL_EVIDENCE_REVIEW_REQUIRED');
 assert.equal(r.localPart1Recorded,false);
});
test('unexpected or malicious statuses are allowlisted away',()=>{
 const r=projectStep2Evidence({...first,status:'SECRET_TOKEN_XXXXX',
 quoteAiBriefBinding:'sensitive'},
 {...second,status:'PRIVATE_ACCESS_KEY',part2:{status:'PRIVATE_BANK'}});
 assert.equal(r.part1Status,'LOCAL_EVIDENCE_REVIEW_REQUIRED');
 assert.equal(r.part2Status,'PART2_EVIDENCE_REVIEW_REQUIRED');
 assert.equal(r.crossPartStatus,'BOTH_PARTS_NEED_REVIEW');
 assert.equal(r.part1QuoteAiBriefBinding,'NOT_CHECKED');
});
test('full output contains no raw IDs, hashes, user secrets or private paths',()=>{
 const r=projectStep2Evidence({...first,token:'GEMINI_API_KEY_NOT_A_REAL_KEY'},second);
 const string=JSON.stringify(r);
 for(const sensitive of ['SECRET_ORDER_123','MERCHANT_SECRET','GEMINI_API_KEY_NOT_A_REAL_KEY',
   'a'.repeat(64),'29000','operator_owner','.paypal-ai-mvp-private'])
  assert.equal(string.includes(sensitive),false,sensitive);
});
test('reader flags inconsistent cannot be claimed as verified local result',()=>{
 const r=projectStep2Evidence(first,{...second,networkRequests:1});
 assert.equal(r.state,'LOCAL_EVIDENCE_REVIEW_REQUIRED');
 assert.equal(r.localPart1Recorded,false);
});
test('snapshot falsely claiming same transaction cannot be used',()=>{
 const r=projectStep2Evidence(first,{...second,sameTransactionProven:true});
 assert.equal(r.state,'LOCAL_EVIDENCE_REVIEW_REQUIRED');
 assert.equal(r.sameTransactionProven,false);
});
test('frozen summary has no mutation capability',()=>{
 const r=projectStep2Evidence(first,second);
 assert.ok(Object.isFrozen(r));
 assert.throws(()=>{r.releaseHold=false},TypeError);
});
test('contradictory cross-part status cannot upgrade both records',()=>{
 const r=projectStep2Evidence(first,{...second,status:'PART1_NOT_VERIFIED'});
 assert.equal(r.localPart2Recorded,false);
 assert.equal(r.state,'PART1_LOCAL_RECORD_ONLY_PART2_UNVERIFIED');
});
