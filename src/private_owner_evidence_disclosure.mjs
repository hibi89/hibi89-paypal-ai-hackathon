// Owner-initiated LOCAL evidence disclosure from immutable/read-only SQLite.
// A locally consistent record is NOT a fresh PayPal GET, independently signed
// receipt, real Gemini replay, or permission to publish. Never export raw
// merchant/order/capture IDs, request keys, brief text, paths or credentials.
import {MARKETPLACE_SKILL_NAMES} from './marketplace_match.mjs';
const requireSafe=(v,code)=>{if(!v)throw Error(code)};
const recognized=new Set(MARKETPLACE_SKILL_NAMES);
export function summarizePrivateOwnerEvidence(receipt){
 requireSafe(receipt&&typeof receipt==='object'&&!Array.isArray(receipt) &&
   receipt.schemaVersion===1 &&
   receipt.mode==='READ_ONLY_PRIVATE_SQLITE_EVIDENCE_NO_NETWORK'&&
   ['NO_LOCAL_ATTEMPT','LOCAL_EVIDENCE_REVIEW_REQUIRED',
    'LOCAL_PROVIDER_RESULT_RECORDED_NOT_FRESH_GET'].includes(receipt.status)&&
   receipt.ownerReportedLiveRunNotIndependentlyAttested===true&&
   receipt.providerGetPerformedNow===false&&
   receipt.providerPostPerformedNow===false&&
   receipt.geminiCallPerformedNow===false&&
   receipt.sqliteWritesPerformed===false&&
   receipt.secretsRead===false&&
   receipt.privateIdentifiersPrinted===false&&
   receipt.freshRemotePaymentProof===false&&
   receipt.productionOrLivePaymentProof===false&&
   receipt.safeToRepeatPayment===false,
   'PRIVATE_RECEIPT_DISCLAIMER_INVALID');
 const complete=receipt.status==='LOCAL_PROVIDER_RESULT_RECORDED_NOT_FRESH_GET';
 let skills=[];
 if(complete){
  skills=receipt.classifiedSkills;
  requireSafe(receipt.amountMinor===150&&receipt.currency==='USD'&&
    receipt.localAuditIntegrity==='PASS'&&
    Number.isSafeInteger(receipt.localAuditEvents)&&receipt.localAuditEvents>=4&&
    receipt.localAuditEvents<=1000000&&
    Array.isArray(skills)&&skills.length>=1&&
    skills.length<=MARKETPLACE_SKILL_NAMES.length&&
    skills.every(s=>typeof s==='string'&&recognized.has(s))&&
    new Set(skills).size===skills.length,
    'PRIVATE_RECEIPT_PAYLOAD_INVALID');
 }else{
  requireSafe(receipt.amountMinor===null&&receipt.currency===null&&
    Array.isArray(receipt.classifiedSkills)&&receipt.classifiedSkills.length===0,
    'UNVERIFIED_RECEIPT_MUST_NOT_DISCLOSE_AMOUNT');
 }
 // Strict output allowlist: NO spread of receipt, localStates, localFiles,
 // actor/merchant, order IDs, paths, hashes, raw prompts or identifiers.
 return Object.freeze({
  schemaVersion:1,
  evidenceClass:'C_OWNER_DEVICE_LOCAL_SQLITE_ONLY',
  status:complete?'LOCAL_RECORD_CONSISTENT_NOT_REMOTE_ATTESTED':
    'LOCAL_EVIDENCE_UNCONFIRMED',
  historicalObservationDate:'2026-10-28',
  approvedSyntheticAmount:complete?'USD 1.50':null,
  validatedTechnicalSkills:complete?Object.freeze([...skills]):Object.freeze([]),
  localAuditIntegrity:complete?'PASS':'NOT_ESTABLISHED',
  localAuditEventCount:complete?receipt.localAuditEvents:0,
  localDataConsistencyEstablished:complete,
  actualPayPalOrderGetNow:false,actualPayPalOrderCreateNow:false,
  actualPayPalCaptureNow:false,actualGeminiCallNow:false,
  independentlyVerifiedByPayPal:false,
  independentJudgeReproduction:false,
  proofOfRealMoney:false,credentialsIncluded:false,
  rawPrivateIdentifiersIncluded:false,
  authorizedToPublish:false,
  devpostSubmitted:false,
  publicationStatus:'PRIVATE_OWNER_REVIEW_REQUIRED',
  disclosure:'This is a sanitized local SQLite consistency result. It is not an authenticated fresh PayPal GET, independently signed provider attestation, or proof of a real publicly runnable payment.'
 });
}
