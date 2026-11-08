// Safe public projection of existing private receipt readers. No raw DB data,
// hashes, transaction IDs, file paths, credentials, timestamps or amounts.
// This module is pure: it does not open files or contact any service.
const oneOf=(value,accepted,fallback)=>accepted.includes(value)?value:fallback;
const PART1=['LOCAL_PROVIDER_RESULT_RECORDED_NOT_FRESH_GET',
 'LOCAL_EVIDENCE_REVIEW_REQUIRED','NO_LOCAL_ATTEMPT'];
const PART2=['PRIVATE_A2A_SQLITE_RESULT_NOT_GEMINI_ATTESTED',
 'PART2_EVIDENCE_NOT_RECORDED','PART2_ATTEMPT_WITHOUT_RESULT_NO_RETRY',
 'PART2_EVIDENCE_REVIEW_REQUIRED','PART2_QUOTA_EVIDENCE_MISSING'];
const CROSS=['SEPARATE_DEMOS_AMOUNT_MISMATCH',
 'AMOUNTS_MATCH_BUT_NOT_SAME_TRANSACTION','PART2_NOT_VERIFIED',
 'PART1_NOT_VERIFIED','BOTH_PARTS_NEED_REVIEW'];
const BRIEF=['BOUND_LOCAL_HASH_MATCH','BOUND_LOCAL_HASH_MISMATCH',
 'LEGACY_NOT_CROSS_BOUND','INVALID_QUOTE_BRIEF_DIGEST','NOT_CHECKED'];

export function projectStep2Evidence(first, second){
 const part1=oneOf(first?.status,PART1,'LOCAL_EVIDENCE_REVIEW_REQUIRED');
 const part2=oneOf(second?.part2?.status,PART2,'PART2_EVIDENCE_REVIEW_REQUIRED');
 const cross=oneOf(second?.status,CROSS,'BOTH_PARTS_NEED_REVIEW');
 const binding=oneOf(first?.quoteAiBriefBinding,BRIEF,'NOT_CHECKED');
 // Conservatively require agreement of two independent local readers.
 const localPart1=part1==='LOCAL_PROVIDER_RESULT_RECORDED_NOT_FRESH_GET'&&
   second?.part1?.status===part1&&second?.part1?.historicalLocalCaptureRecorded===true;
 const localPart2=part2==='PRIVATE_A2A_SQLITE_RESULT_NOT_GEMINI_ATTESTED'&&
   ['SEPARATE_DEMOS_AMOUNT_MISMATCH','AMOUNTS_MATCH_BUT_NOT_SAME_TRANSACTION'].includes(cross);
 const consistency=first?.providerGetPerformedNow===false&&
  first?.providerPostPerformedNow===false&&first?.geminiCallPerformedNow===false&&
  first?.sqliteWritesPerformed===false&&second?.networkRequests===0&&
  second?.fileWritesPerformed===false&&second?.sameTransactionProven===false&&
  second?.paypalCapturePerformed===false&&second?.geminiPostPerformed===false;
 const state=consistency&&localPart1?
  (localPart2?'TWO_LOCAL_RECORDS_NOT_SAME_TRANSACTION':
   'PART1_LOCAL_RECORD_ONLY_PART2_UNVERIFIED'):
  'LOCAL_EVIDENCE_REVIEW_REQUIRED';
 return Object.freeze({
  schemaVersion:1,operation:'OWNER_STEP2_PRIVATE_EVIDENCE_READ_ONLY',
  state,
  part1Status:part1,
  part1QuoteAiBriefBinding:binding,
  part2Status:part2,
  crossPartStatus:cross,
  localPart1Recorded:localPart1&&consistency,
  localPart2Recorded:localPart2&&consistency,
  sameTransactionProven:false,
  freshPayPalOrGeminiAttestation:false,
  providerRequestsPerformedNow:0,
  paymentPostsPerformedNow:0,
  localDatabaseWritesPerformed:false,
  safeToRepeatPayment:false,
  submitted:false,
  releaseHold:true,
  nextAction:!consistency?'STOP_REVIEW_EVIDENCE_READER':
   !localPart1?'OWNER_VERIFY_EXISTING_PRIVATE_FILES_NO_RETRY':
   !localPart2?'PART2_EVIDENCE_REVIEW_NO_RETRY':
   'USE_AS_HISTORICAL_LOCAL_EVIDENCE_ONLY'
 });
}
