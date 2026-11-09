// Private operator-only two-part evidence comparison. READ ONLY; no provider network.
// Historical PayPal owner-pilot receipt and optional Gemini A2A are DIFFERENT
// workflows until a common authorized quote/transaction identifier is proved.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {lstatSync} from 'node:fs';
import {isAbsolute,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectOwnerMvpReceipt} from './owner_mvp_receipt.mjs';

const ID=/^[A-Za-z0-9_-]{1,64}$/;
const SHA=/^[a-f0-9]{64}$/;
const error=code=>{const e=new Error(code);e.code=code;throw e;};
const EMPTY=Object.freeze({status:'PART2_EVIDENCE_NOT_RECORDED',amountMinor:null,
 quotaClaims:0,transcriptSha256:null,source:'PRIVATE_SQLITE_UNATTESTED'});
const safeDb=(filename,read)=>{
 if(typeof filename!=='string'||!isAbsolute(filename))error('PRIVATE_EVIDENCE_PATH_REQUIRED');
 let stat;
 try{stat=lstatSync(filename)}
 catch(e){if(e?.code==='ENOENT')return {absent:true};error('PRIVATE_EVIDENCE_FILE_UNAVAILABLE')}
 if(!stat.isFile()||stat.size>64*1024*1024)error('PRIVATE_EVIDENCE_FILE_UNSAFE');
 for(const ext of ['-wal','-shm']){
  try{lstatSync(filename+ext);error('PRIVATE_EVIDENCE_ACTIVE_SQLITE_WAL')}
  catch(e){if(e?.code!=='ENOENT')throw e}
 }
 let db;
 try{
  db=new DatabaseSync(pathToFileURL(filename).href+'?immutable=1',{readOnly:true});
  db.exec('PRAGMA query_only=ON');
  return {absent:false,data:read(db)};
 }finally{try{db?.close()}catch{}}
};
const summary=(status,more={})=>Object.freeze({
 status,amountMinor:null,quotaClaims:0,transcriptSha256:null,
 source:'PRIVATE_SQLITE_UNATTESTED',...more
});
export function inspectPrivatePart2A2A({
 filename,budgetFilename,scope,sandboxPilotQuoteId=null
}={}){
 if(!scope||!['actor','merchant','job'].every(k=>ID.test(scope[k]??''))||
    typeof filename!=='string'||typeof budgetFilename!=='string'||
    !isAbsolute(filename)||!isAbsolute(budgetFilename)||
    resolve(filename)===resolve(budgetFilename)||
    (sandboxPilotQuoteId!==null&&!ID.test(sandboxPilotQuoteId)))
  error('PRIVATE_A2A_EVIDENCE_SCOPE_REQUIRED');
 const sandboxPilot=sandboxPilotQuoteId!==null;
 try{
  // Make no side effects even for missing paths, foreign SQLite or active WAL.
  const part=safeDb(filename,db=>{
   const count=db.prepare("SELECT COUNT(*) n FROM innovation_events WHERE actor=? AND merchant=? AND kind='a2a'")
    .get(scope.actor,scope.merchant).n;
   if(count===0)return {kind:'NONE'};
   if(count!==1)return {kind:'AMBIGUOUS'};
   const row=db.prepare("SELECT result,request_key FROM innovation_events WHERE actor=? AND merchant=? AND kind='a2a'")
    .get(scope.actor,scope.merchant);
   const attempt=db.prepare('SELECT state,consent_id FROM innovation_a2a_attempts WHERE actor=? AND merchant=? AND request_key=?')
    .get(scope.actor,scope.merchant,row.request_key);
   const event=JSON.parse(row.result);
   const grant=db.prepare('SELECT cap,used,revoked,expires FROM innovation_delegations WHERE id=? AND actor=? AND merchant=?')
    .get(event?.consentId,scope.actor,scope.merchant);
   return {kind:'RESULT',event,attempt,grant};
  });
  if(part.absent||part.data?.kind==='NONE'){
   // A crash after the model's durable claim but before Part2 completion is
   // NOT a clean no-attempt result. Never invite a repeat provider POST.
   const quotaWithoutEvent=safeDb(budgetFilename,db=>db.prepare(
    'SELECT state FROM a2a_api_claims WHERE actor=? AND merchant=? AND job=?'
   ).all(scope.actor,scope.merchant,scope.job));
   if(!quotaWithoutEvent.absent&&quotaWithoutEvent.data.length>0)
    return summary('PART2_ATTEMPT_WITHOUT_RESULT_NO_RETRY',{
     quotaClaims:quotaWithoutEvent.data.length});
   return EMPTY;
  }
  if(part.data?.kind!=='RESULT')return summary('PART2_EVIDENCE_REVIEW_REQUIRED');
  const quota=safeDb(budgetFilename,db=>db.prepare(
   'SELECT turn,role,state,used_tokens,output_hash FROM a2a_api_claims WHERE actor=? AND merchant=? AND job=? ORDER BY turn'
  ).all(scope.actor,scope.merchant,scope.job));
  if(quota.absent||!Array.isArray(quota.data))
   return summary('PART2_QUOTA_EVIDENCE_MISSING');
  const {event,attempt,grant}=part.data,claims=quota.data;
  const messages=event?.messages;
  const hash=Array.isArray(messages)?createHash('sha256')
   .update(JSON.stringify(messages)).digest('hex'):null;
  // The original $270 evidence contract stays exactly as before.
  // The optional $1.50 pilot must carry the original, pre-model quote
  // identity into its durable A2A record. Local checksums are NOT provider proof.
  const amountAndBindingValid=sandboxPilot
   ?event?.agreedMinor===150&&event?.sellerFloorMinor===150&&
     event?.quoteBinding?.quoteId===sandboxPilotQuoteId&&
     Number.isSafeInteger(event?.quoteBinding?.quoteVersion)&&
     event.quoteBinding.quoteVersion>=1&&
     event?.quoteBinding?.amountMinor===150&&
     SHA.test(event?.quoteBinding?.quoteFingerprint??'')
   :Number.isSafeInteger(event?.agreedMinor)&&event.agreedMinor>=27000&&
     event.agreedMinor<=1000000;
  const valid=event?.mode==='PRIVATE_INJECTED_AGENT_NOT_ATTESTED'&&
   event?.agentMode==='PRIVATE_INJECTED_ROLES'&&
   event?.providerCalls==='NOT_ATTESTED'&&event?.realGemini===false&&
   event?.paymentAuthorized===false&&event?.paypalCapturePerformed===false&&
   event?.paymentState==='NOT_PAID'&&event?.checkout==='DISABLED'&&
   event?.status==='SYNTHETIC_AGREEMENT'&&event?.accepted===true&&
   event?.protocolStatus==='AGREED_OFFLINE_CONTRACT'&&
   amountAndBindingValid&&event.reservedMinor===event.agreedMinor&&
   attempt?.state==='DONE'&&attempt?.consent_id===event?.consentId&&
   grant&&grant.used===event.agreedMinor&&grant.cap>=event.agreedMinor&&
   grant.revoked===0&&SHA.test(event?.transcriptSha256??'')&&
   hash===event.transcriptSha256&&
   Array.isArray(messages)&&messages.length>=2&&messages.length<=4&&
   // A locally rehashed transcript without a true final ACCEPT must never
   // become owner-approved, even when the event's summary says "accepted".
   (!sandboxPilot||(
    messages[0]?.action==='OFFER'&&
    messages.at(-1)?.action==='ACCEPT'&&
    messages.at(-1)?.amountMinor===150&&
    messages.at(-2)?.amountMinor===150&&
    messages.every((m,i)=>m.action!=='REJECT'&&
     (i===0?m.action==='OFFER':['COUNTER','ACCEPT'].includes(m.action))&&
     (m.role==='seller'?m.amountMinor>=150:m.amountMinor<=150))
   ))&&
   messages.length===claims.length&&
   messages.every((m,i)=>m?.role===(i%2===0?'seller':'buyer')&&
    ['OFFER','COUNTER','ACCEPT','REJECT'].includes(m.action)&&
    (m.action==='REJECT'?
      typeof m.reason==='string'&&m.reason.length>=3&&m.reason.length<=100:
      Number.isSafeInteger(m.amountMinor)&&m.amountMinor>=100&&m.amountMinor<=1000000))&&
   claims.every((c,i)=>c.turn===i+1&&
    c.role===(i%2===0?'seller':'buyer')&&c.state==='DONE'&&
    Number.isSafeInteger(c.used_tokens)&&c.used_tokens>0&&SHA.test(c.output_hash??''));
  if(!valid)return summary('PART2_EVIDENCE_REVIEW_REQUIRED',{
   quotaClaims:claims.length});
  return summary('PRIVATE_A2A_SQLITE_RESULT_NOT_GEMINI_ATTESTED',{
   amountMinor:event.agreedMinor,quotaClaims:claims.length,
   transcriptSha256:event.transcriptSha256,
   delegationStillValidNow:grant.expires>Date.now(),
   ...(sandboxPilot?{
    boundQuoteId:event.quoteBinding.quoteId,
    boundQuoteVersion:event.quoteBinding.quoteVersion,
    boundQuoteFingerprint:event.quoteBinding.quoteFingerprint,
    quoteHumanApprovedByThisReadOnlyCheck:false
   }:{})
  });
 }catch{
  return summary('PART2_EVIDENCE_REVIEW_REQUIRED');
 }
}
export function inspectOwnerTwoPartEvidence({
 ownerDirectory,part2Filename,budgetFilename,scope,
 sandboxPilotQuoteId=null
}={}){
 if(typeof ownerDirectory!=='string'||ownerDirectory.length===0)
  error('PRIVATE_OWNER_RECEIPT_DIRECTORY_REQUIRED');
 // This receipt is inspected by the existing read-only first-party verifier.
 const first=inspectOwnerMvpReceipt({directory:ownerDirectory});
 const second=inspectPrivatePart2A2A({
  filename:part2Filename,budgetFilename,scope,sandboxPilotQuoteId
 });
 const part1Recorded=first.status==='LOCAL_PROVIDER_RESULT_RECORDED_NOT_FRESH_GET';
 const part2Recorded=second.status==='PRIVATE_A2A_SQLITE_RESULT_NOT_GEMINI_ATTESTED';
 const sameAmount=part1Recorded&&part2Recorded&&
  first.amountMinor===second.amountMinor&&first.currency==='USD';
 const status=part1Recorded&&part2Recorded
  ?sameAmount?'AMOUNTS_MATCH_BUT_NOT_SAME_TRANSACTION':
    'SEPARATE_DEMOS_AMOUNT_MISMATCH'
  :part1Recorded?'PART2_NOT_VERIFIED':
   part2Recorded?'PART1_NOT_VERIFIED':'BOTH_PARTS_NEED_REVIEW';
 // Even equal prices cannot establish that agent consent authorized a PayPal payee.
 return Object.freeze({
  status,part1:Object.freeze({
   status:first.status,amountMinor:part1Recorded?first.amountMinor:null,
   localAuditIntegrity:first.localAuditIntegrity,
   historicalLocalCaptureRecorded:part1Recorded,
   freshPayPalGetPerformed:false
  }),
  part2:second,amountsMatch:sameAmount,
  sameTransactionProven:false,sharedMerchantAuthorityProven:false,
  livePayPalVerifiedNow:false,liveGeminiVerifiedNow:false,
  paymentAuthorized:false,paypalCreatePerformed:false,
  paypalCapturePerformed:false,geminiPostPerformed:false,
  fileWritesPerformed:false,networkRequests:0,
  providerAttestation:'NOT_PERFORMED_BY_PRIVATE_READONLY_COMPARISON'
 });
}
