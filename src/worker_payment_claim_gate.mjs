// Atomic D1 first-claim gate. No PayPal network calls or payment authorization.
// Never infer a successful remote order from an ambiguous or duplicate claim.
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const MERCHANT=/^[A-Za-z0-9]{13}$/;
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const INSERT=`INSERT INTO payment_attempts
(request_id,quote_id,quote_version,merchant_id,operation,state,amount_minor,currency)
SELECT ?,q.id,q.version,q.merchant_id,'create','IN_FLIGHT',q.approval_amount_minor,q.currency
FROM quotes q
WHERE q.id=? AND q.version=? AND q.owner_id=? AND q.merchant_id=?
AND q.status='APPROVED' AND q.approval_actor=q.owner_id
AND q.approval_version=q.version AND q.currency='USD'
AND q.approval_amount_minor BETWEEN 100 AND 1000000
ON CONFLICT DO NOTHING`;
// The session is checked IN THE SAME D1 INSERT statement as the quote claim.
// An authorization revoked between the initial HTTP resolve and this INSERT
// cannot win a payment claim (read-then-write would allow that race).
const AUTHENTICATED_INSERT=`INSERT INTO payment_attempts
(request_id,quote_id,quote_version,merchant_id,operation,state,amount_minor,currency)
SELECT ?,q.id,q.version,q.merchant_id,'create','IN_FLIGHT',q.approval_amount_minor,q.currency
FROM quotes q
JOIN worker_private_sessions s ON s.token_sha256=?
 AND s.actor_id=q.owner_id AND s.merchant_id=q.merchant_id
JOIN worker_private_oidc_bindings b ON b.issuer=s.issuer
 AND b.subject_hmac=s.binding_subject_hmac
WHERE q.id=? AND q.version=? AND q.owner_id=? AND q.merchant_id=?
 AND q.status='APPROVED' AND q.approval_actor=q.owner_id
 AND q.approval_version=q.version AND q.currency='USD'
 AND q.approval_amount_minor BETWEEN 100 AND 1000000
 AND s.role='OWNER' AND s.revoked_at_ms IS NULL
 AND s.expires_at_ms>? AND s.issuer_verified_at_ms>0
 AND s.issuer_verified_at_ms<=?
 AND b.active=1 AND b.role='OWNER' AND b.actor_id=q.owner_id
 AND b.merchant_id=q.merchant_id AND b.revision=s.binding_revision
ON CONFLICT DO NOTHING`;
const LOOKUP=`SELECT request_id,state,remote_id,amount_minor,currency
FROM payment_attempts WHERE quote_id=? AND quote_version=?
AND merchant_id=? AND operation='create'`;
const PERSIST=`UPDATE payment_attempts SET remote_id=?,observed_at=CURRENT_TIMESTAMP
WHERE request_id=? AND quote_id=? AND quote_version=? AND merchant_id=?
AND operation='create' AND state='IN_FLIGHT' AND remote_id IS NULL
AND EXISTS(SELECT 1 FROM quotes q WHERE q.id=payment_attempts.quote_id
 AND q.version=payment_attempts.quote_version AND q.owner_id=?
 AND q.merchant_id=payment_attempts.merchant_id AND q.status='APPROVED'
 AND q.approval_actor=q.owner_id AND q.approval_version=q.version
 AND q.approval_amount_minor=payment_attempts.amount_minor
 AND q.currency=payment_attempts.currency)`;
const READ_BY_REQUEST=`SELECT a.request_id,a.state,a.remote_id FROM payment_attempts a
JOIN quotes q ON q.id=a.quote_id AND q.version=a.quote_version
 AND q.merchant_id=a.merchant_id
WHERE a.request_id=? AND a.quote_id=? AND a.quote_version=? AND a.merchant_id=?
AND q.owner_id=? AND a.operation='create'`;
const MARK_UNKNOWN=`UPDATE payment_attempts SET state='UNKNOWN',observed_at=CURRENT_TIMESTAMP
WHERE request_id=? AND quote_id=? AND quote_version=? AND merchant_id=?
AND operation='create' AND state='IN_FLIGHT'
AND EXISTS(SELECT 1 FROM quotes q WHERE q.id=payment_attempts.quote_id
 AND q.version=payment_attempts.quote_version AND q.owner_id=?
 AND q.merchant_id=payment_attempts.merchant_id)`;
const READ_RECOVERY=`SELECT a.request_id,a.state,a.remote_id FROM payment_attempts a
JOIN quotes q ON q.id=a.quote_id AND q.version=a.quote_version
 AND q.merchant_id=a.merchant_id
WHERE a.request_id=? AND a.quote_id=? AND a.quote_version=?
 AND q.owner_id=? AND a.merchant_id=? AND a.operation='create'`;
// Audit timeline is read-only, bounded and bound to a verified quote owner.
// Never return raw PayPal remote IDs or cross-merchant audit events.
const READ_AUDIT=`SELECT e.sequence,e.event_type,e.before_state,e.after_state,
 e.remote_id,e.observed_at FROM payment_attempt_audit e
JOIN payment_attempts a ON a.request_id=e.request_id
 AND a.quote_id=e.quote_id AND a.quote_version=e.quote_version
 AND a.merchant_id=e.merchant_id AND a.operation=e.operation
JOIN quotes q ON q.id=a.quote_id AND q.version=a.quote_version
 AND q.merchant_id=a.merchant_id
WHERE a.request_id=? AND a.quote_id=? AND a.quote_version=?
 AND a.merchant_id=? AND q.owner_id=? AND a.operation='create'
 AND (? IS NULL OR e.sequence<?)
ORDER BY e.sequence DESC LIMIT 51`;
const AUDIT_TYPES=new Set(['MIGRATION_BASELINE','CLAIM_CREATED',
 'STATE_CHANGED','REMOTE_ID_BOUND']);
const AUDIT_STATES=new Set(['IN_FLIGHT','UNKNOWN','APPROVED','PAID']);
const recoveryState=row=>row?.remote_id?
 'REMOTE_ORDER_GET_RECONCILIATION_REQUIRED':'MANUAL_PROVIDER_LOOKUP_REQUIRED';
const validOwnedClaim=v=>[v?.requestId,v?.quoteId,v?.ownerId].every(x=>
 typeof x==='string'&&ID.test(x))&&MERCHANT.test(v?.merchantId??'')&&
 Number.isSafeInteger(v?.quoteVersion)&&v.quoteVersion>=1;
export function createWorkerPaymentClaimGate({db}={}){
 if(typeof db?.withSession!=='function')fail('D1_PRIMARY_REQUIRED');
 return Object.freeze({async claimWithVerifiedSession({
  requestId,quoteId,quoteVersion,ownerId,merchantId,sessionDigest,checkedAt
 }={}){
  if(!validOwnedClaim({requestId,quoteId,quoteVersion,ownerId,merchantId})||
     typeof sessionDigest!=='string'||!/^[a-f0-9]{64}$/.test(sessionDigest)||
     !Number.isSafeInteger(checkedAt)||checkedAt<=0)
   fail('INVALID_AUTHENTICATED_CLAIM');
  try{
   const result=await db.withSession('first-primary').prepare(AUTHENTICATED_INSERT)
    .bind(requestId,sessionDigest,quoteId,quoteVersion,ownerId,merchantId,
      checkedAt,checkedAt).run();
   if(result?.meta?.changes===1)
    return Object.freeze({claimed:true,requestId,state:'IN_FLIGHT',
     providerCalls:0,paymentAuthorized:false});
   if(result?.meta?.changes===0)
    return Object.freeze({claimed:false,state:'UNKNOWN_RECONCILIATION_REQUIRED',
     providerCalls:0,paymentAuthorized:false});
   fail('AUTHENTICATED_CLAIM_AMBIGUOUS');
  }catch{fail('AUTHENTICATED_CLAIM_UNAVAILABLE_NO_RETRY');}
 },async claim({requestId,quoteId,quoteVersion,ownerId,merchantId}={}){
  if(![requestId,quoteId,ownerId].every(x=>typeof x==='string'&&ID.test(x))||
   !MERCHANT.test(merchantId??'')||!Number.isSafeInteger(quoteVersion)||quoteVersion<1)
   fail('INVALID_CLAIM_INPUT');
  try{
   const primary=db.withSession('first-primary');
   const result=await primary.prepare(INSERT).bind(
    requestId,quoteId,quoteVersion,ownerId,merchantId).run();
   const row=await primary.prepare(LOOKUP).bind(quoteId,quoteVersion,merchantId).first();
   if(result?.meta?.changes===1&&row?.request_id===requestId&&
      row.state==='IN_FLIGHT'&&row.remote_id===null)
    return Object.freeze({claimed:true,requestId,state:'IN_FLIGHT',
      providerCalls:0,paymentAuthorized:false});
   if(row) return Object.freeze({claimed:false,state:'UNKNOWN_RECONCILIATION_REQUIRED',
      providerCalls:0,paymentAuthorized:false});
   fail('CLAIM_NOT_APPROVED');
  }catch(e){
   if(e?.code==='CLAIM_NOT_APPROVED')throw e;
   // D1 errors or ambiguous commit outcomes must not trigger a second create.
   fail('CLAIM_OUTCOME_UNKNOWN_RECONCILE_BEFORE_RETRY');
  }
 },async persistRemoteOrder({requestId,quoteId,quoteVersion,ownerId,merchantId,remoteId}={}){
  if(![requestId,quoteId,ownerId].every(x=>typeof x==='string'&&ID.test(x))||
     !MERCHANT.test(merchantId??'')||
     !Number.isSafeInteger(quoteVersion)||quoteVersion<1||
     typeof remoteId!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(remoteId))
   fail('INVALID_REMOTE_ORDER_BINDING');
  try{
   const primary=db.withSession('first-primary');
   const result=await primary.prepare(PERSIST).bind(
    remoteId,requestId,quoteId,quoteVersion,merchantId,ownerId).run();
   const row=await primary.prepare(READ_BY_REQUEST).bind(
    requestId,quoteId,quoteVersion,merchantId,ownerId).first();
   if(result?.meta?.changes===1&&row?.remote_id===remoteId&&row.state==='IN_FLIGHT')
    return Object.freeze({persisted:true,state:'IN_FLIGHT',paymentAuthorized:false,providerCalls:0});
   // Idempotent re-read is not a license to call PayPal CREATE again.
   if(row?.remote_id===remoteId&&row.state==='IN_FLIGHT')
    return Object.freeze({persisted:false,state:'ALREADY_BOUND_RECONCILE',paymentAuthorized:false,providerCalls:0});
   fail('REMOTE_ORDER_BINDING_CONFLICT');
  }catch{
   fail('REMOTE_ORDER_BINDING_UNKNOWN_RECONCILE_BEFORE_RETRY');
  }
 },async markUnknown(details={}){
  if(!validOwnedClaim(details))fail('INVALID_UNKNOWN_MARK_INPUT');
  const {requestId,quoteId,quoteVersion,ownerId,merchantId}=details;
  try{
   const primary=db.withSession('first-primary');
   const result=await primary.prepare(MARK_UNKNOWN).bind(
    requestId,quoteId,quoteVersion,merchantId,ownerId).run();
   const row=await primary.prepare(READ_RECOVERY).bind(
    requestId,quoteId,quoteVersion,ownerId,merchantId).first();
   if((result?.meta?.changes===1||result?.meta?.changes===0)&&
      row?.state==='UNKNOWN')
    return Object.freeze({marked:result.meta.changes===1,state:'UNKNOWN',
      next:recoveryState(row),providerCalls:0,paymentAuthorized:false});
   fail('UNKNOWN_TRANSITION_REJECTED');
  }catch{
   // An ambiguous D1 result cannot license another PayPal order create.
   fail('UNKNOWN_MARK_UNCONFIRMED_NO_RETRY');
  }
 },async auditTrail(details={}){
  if(!validOwnedClaim(details)||
     (details.beforeSequence!==undefined&&
      (!Number.isSafeInteger(details.beforeSequence)||details.beforeSequence<1)))
   fail('INVALID_AUDIT_INPUT');
  const {requestId,quoteId,quoteVersion,ownerId,merchantId}=details;
  const beforeSequence=details.beforeSequence??null;
  let rows;
  try{
   const response=await db.withSession('first-primary').prepare(READ_AUDIT)
    .bind(requestId,quoteId,quoteVersion,merchantId,ownerId,
      beforeSequence,beforeSequence).all();
   if(!Array.isArray(response?.results))fail('AUDIT_MALFORMED');
   rows=response.results;
  }catch{fail('AUDIT_STORE_UNAVAILABLE');}
  if(rows.length===0)fail('AUDIT_CLAIM_NOT_AVAILABLE');
  if(rows.length>51||rows.some(r=>!Number.isSafeInteger(r.sequence)||r.sequence<1||
     !AUDIT_TYPES.has(r.event_type)||
     !AUDIT_STATES.has(r.after_state)||
     (r.before_state!==null&&!AUDIT_STATES.has(r.before_state))||
     typeof r.observed_at!=='string'||
     (r.remote_id!==null&&typeof r.remote_id!=='string')))
   fail('AUDIT_DATA_INVALID');
  const hasMore=rows.length>50;
  return Object.freeze({events:rows.slice(0,50).reverse().map(r=>Object.freeze({
   eventType:r.event_type,fromState:r.before_state,toState:r.after_state,
   remoteOrderKnown:r.remote_id!==null,observedAt:r.observed_at
  })),hasMore,nextBeforeSequence:hasMore?rows[49].sequence:null,
   providerCalls:0,paymentAuthorized:false});
 },async inspectRecovery(details={}){
  if(!validOwnedClaim(details))fail('INVALID_RECOVERY_INPUT');
  const {requestId,quoteId,quoteVersion,ownerId,merchantId}=details;
  try{
   const row=await db.withSession('first-primary').prepare(READ_RECOVERY).bind(
    requestId,quoteId,quoteVersion,ownerId,merchantId).first();
   if(!row)fail('RECOVERY_CLAIM_NOT_FOUND');
   let next;
   switch(row.state){
    case 'IN_FLIGHT': next='IN_FLIGHT_DO_NOT_RETRY';break;
    case 'UNKNOWN':next=recoveryState(row);break;
    case 'APPROVED':next='READ_ONLY_REMOTE_VERIFICATION_REQUIRED';break;
    case 'PAID':next='PAYMENT_ATTESTATION_NOT_PROVIDED';break;
    default:fail('RECOVERY_STATE_INVALID');
   }
   return Object.freeze({state:row.state,next,remoteIdKnown:row.remote_id!==null,
    providerCalls:0,paymentAuthorized:false});
  }catch{
   fail('RECOVERY_UNAVAILABLE_NO_RETRY');
  }
 }});
}
