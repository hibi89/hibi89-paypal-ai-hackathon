// Offline owner-local, exact-quote review and optional independent approval.
// No Gemini or PayPal transport. Does NOT link cross-part consent or pay.
import {join,resolve,isAbsolute} from 'node:path';
import {inspectOwnerProposedA2AQuote,fingerprintOwnerQuoteContract}
 from './owner_private_a2a_quote_binding.mjs';
import {inspectPrivatePart2A2A} from './owner_private_two_part_evidence.mjs';
import {createSqliteLedger} from './sqlite_ledger.mjs';

const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const FILENAME='owner-sandbox150-part1.sqlite';
const JOB='part2_sandbox_150_once';
function validatePaths({privateDirectory,quoteScope,part2Filename,budgetFilename}){
 if(typeof privateDirectory!=='string'||!isAbsolute(privateDirectory)||
    !quoteScope||typeof quoteScope.filename!=='string'||
    typeof part2Filename!=='string'||typeof budgetFilename!=='string'||
    !isAbsolute(part2Filename)||!isAbsolute(budgetFilename)||
    resolve(quoteScope.filename)!==resolve(join(privateDirectory,FILENAME))||
    resolve(part2Filename)!==resolve(join(privateDirectory,'part2-owner-sandbox150.sqlite'))||
    resolve(budgetFilename)!==resolve(join(privateDirectory,'part2-owner-sandbox150-quota.sqlite')))
  fail('OWNER_SANDBOX150_DEDICATED_PRIVATE_PATH_REQUIRED');
}
// This is an offline consistency check, NOT proof that Google emitted these
// messages or PayPal owns the merchant. Payment requires separate gates.
export function inspectOwnerSandbox150ApprovalReadiness({
 privateDirectory,quoteScope,part2Filename,budgetFilename,cwd=process.cwd()
}={}){
 validatePaths({privateDirectory,quoteScope,part2Filename,budgetFilename});
 const binding=inspectOwnerProposedA2AQuote({...quoteScope,cwd});
 const evidence=inspectPrivatePart2A2A({
  filename:part2Filename,budgetFilename,
  scope:{actor:binding.actorId,merchant:binding.merchantId,job:JOB},
  sandboxPilotQuoteId:binding.quoteId
 });
 if(evidence.status!=='PRIVATE_A2A_SQLITE_RESULT_NOT_GEMINI_ATTESTED'||
    evidence.amountMinor!==150||evidence.boundQuoteId!==binding.quoteId||
    evidence.boundQuoteVersion!==binding.quoteVersion||
    evidence.boundQuoteFingerprint!==binding.quoteFingerprint||
    evidence.delegationStillValidNow!==true||
    !Number.isSafeInteger(evidence.quotaClaims)||evidence.quotaClaims<2||
    evidence.quotaClaims>4)
  fail('OWNER_SANDBOX150_BOUND_AGREEMENT_NOT_READY');
 return Object.freeze({
  status:'OWNER_SANDBOX150_EXACT_AGREEMENT_READY_FOR_LOCAL_APPROVAL',
  quoteId:binding.quoteId,quoteVersion:binding.quoteVersion,
  quoteFingerprint:binding.quoteFingerprint,amountMinor:150,currency:'USD',
  transcriptSha256:evidence.transcriptSha256,quotaClaims:evidence.quotaClaims,
  localOwnerApprovalRequired:true,
  independentGeminiAttestation:false,merchantOwnershipVerified:false,
  paymentAuthorized:false,paypalCreatePerformed:false,paypalCapturePerformed:false,
  networkRequests:0,fileWritesPerformed:false
 });
}
// Caller must provide a separate exact typed operator consent. A2A acceptance
// alone cannot set the approval bit, and approval is NOT payment delegation.
export async function approveOwnerSandbox150Quote({
 explicitOwnerConsent=false,...options
}={}){
 if(explicitOwnerConsent!==true)
  fail('OWNER_SANDBOX150_EXPLICIT_APPROVAL_REQUIRED');
 const reviewed=inspectOwnerSandbox150ApprovalReadiness(options);
 const {quoteScope}=options;
 let ledger;
 try{
  ledger=createSqliteLedger({
   filename:quoteScope.filename,enforceLocalMemberWrites:true
  });
  const member=await ledger.getLocalMember(quoteScope.actorId);
  if(!member||member.role!=='buyer'||member.merchantId!==quoteScope.merchantId||
     member.active!==true||!Number.isSafeInteger(member.revision))
   fail('OWNER_SANDBOX150_BUYER_MEMBERSHIP_REQUIRED');
  const current=await ledger.get(reviewed.quoteId);
  if(!current||current.status!=='PROPOSED'||
     current.ownerId!==quoteScope.actorId||
     current.merchantId!==quoteScope.merchantId||
     current.version!==reviewed.quoteVersion||
     fingerprintOwnerQuoteContract(current)!==reviewed.quoteFingerprint)
   fail('OWNER_SANDBOX150_QUOTE_CHANGED_BEFORE_APPROVAL');
  // Atomic quote version/status CAS and persisted buyer membership revision.
  // No alternate amount, no synthetic approval or payment bypass.
  const approved=await ledger.approve({
   id:reviewed.quoteId,actorId:quoteScope.actorId,
   expectedVersion:reviewed.quoteVersion,amountMinor:150,
   expectedMembershipRevision:member.revision
  });
  if(approved.status!=='APPROVED'||
     approved.approval?.actorId!==quoteScope.actorId||
     approved.approval?.amountMinor!==150||
     approved.approval?.quoteVersion!==reviewed.quoteVersion)
   fail('OWNER_SANDBOX150_APPROVAL_RESULT_INVALID');
  return Object.freeze({
   status:'OWNER_LOCAL_EXACT_150_QUOTE_APPROVED_NOT_PAYMENT',
   quoteId:reviewed.quoteId,quoteVersion:reviewed.quoteVersion,
   quoteFingerprint:reviewed.quoteFingerprint,amountMinor:150,currency:'USD',
   localOwnerApprovalRecorded:true,independentBuyerAuthAttested:false,
   independentGeminiAttestation:false,merchantOwnershipVerified:false,
   crossPartReviewLinked:false,paymentAuthorized:false,
   paypalCreatePerformed:false,paypalCapturePerformed:false,
   networkRequests:0
  });
 }finally{try{ledger?.close()}catch{}}
}
