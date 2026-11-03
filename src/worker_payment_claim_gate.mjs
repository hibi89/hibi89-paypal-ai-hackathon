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
const LOOKUP=`SELECT request_id,state,remote_id,amount_minor,currency
FROM payment_attempts WHERE quote_id=? AND quote_version=?
AND merchant_id=? AND operation='create'`;
const PERSIST=`UPDATE payment_attempts SET remote_id=?,observed_at=CURRENT_TIMESTAMP
WHERE request_id=? AND quote_id=? AND quote_version=? AND merchant_id=?
AND operation='create' AND state='IN_FLIGHT' AND remote_id IS NULL`;
const READ_BY_REQUEST=`SELECT request_id,state,remote_id FROM payment_attempts
WHERE request_id=? AND quote_id=? AND quote_version=? AND merchant_id=?
AND operation='create'`;
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
const recoveryState=row=>row?.remote_id?
 'REMOTE_ORDER_GET_RECONCILIATION_REQUIRED':'MANUAL_PROVIDER_LOOKUP_REQUIRED';
const validOwnedClaim=v=>[v?.requestId,v?.quoteId,v?.ownerId].every(x=>
 typeof x==='string'&&ID.test(x))&&MERCHANT.test(v?.merchantId??'')&&
 Number.isSafeInteger(v?.quoteVersion)&&v.quoteVersion>=1;
export function createWorkerPaymentClaimGate({db}={}){
 if(typeof db?.withSession!=='function')fail('D1_PRIMARY_REQUIRED');
 return Object.freeze({async claim({requestId,quoteId,quoteVersion,ownerId,merchantId}={}){
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
 },async persistRemoteOrder({requestId,quoteId,quoteVersion,merchantId,remoteId}={}){
  if(![requestId,quoteId].every(x=>typeof x==='string'&&ID.test(x))||
     !MERCHANT.test(merchantId??'')||
     !Number.isSafeInteger(quoteVersion)||quoteVersion<1||
     typeof remoteId!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(remoteId))
   fail('INVALID_REMOTE_ORDER_BINDING');
  try{
   const primary=db.withSession('first-primary');
   const result=await primary.prepare(PERSIST).bind(
    remoteId,requestId,quoteId,quoteVersion,merchantId).run();
   const row=await primary.prepare(READ_BY_REQUEST).bind(
    requestId,quoteId,quoteVersion,merchantId).first();
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
