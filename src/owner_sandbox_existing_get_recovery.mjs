// Immutable restart recovery for an EXISTING first-party PayPal Sandbox order.
// No checkout session, no SQLite migration/write, no Orders CREATE/CAPTURE POST.
// The existing one-shot payment session remains irrevocably single-use.
import {DatabaseSync} from 'node:sqlite';
import {lstatSync} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {approvedAmount} from './payment_contract.mjs';
import {verifyLocalAudit} from './ledger_audit.mjs';

const QUOTE_ID='operator_mvp_01';
const ACTOR_ID='local_operator';
const AMOUNT=150;
const REMOTE_ID=/^[A-Za-z0-9_-]{1,64}$/;
const MERCHANT=/^[A-Za-z0-9]{13}$/;
const deny=code=>{const e=new Error(code);e.code=code;throw e;};
const common=Object.freeze({
 mode:'OWNER_EXISTING_SANDBOX_GET_READ_ONLY',
 productionPayment:false,livePayment:false,
 newOrderPostPermitted:false,capturePostPermitted:false,
 localLedgerMutated:false,retryPost:false,autoRetryAllowed:false
});
function readSnapshot({directory,merchantId}){
 if(typeof directory!=='string'||!isAbsolute(directory)||!MERCHANT.test(merchantId??''))
  deny('EXISTING_ORDER_PRIVATE_SCOPE_REQUIRED');
 const filename=join(directory,'checkout.sqlite');
 let file;
 try{file=lstatSync(filename)}catch{deny('EXISTING_ORDER_PRIVATE_DB_UNAVAILABLE')}
 if(!file.isFile()||file.size>64*1024*1024)
  deny('EXISTING_ORDER_PRIVATE_DB_UNSAFE');
 for(const sidecar of ['-wal','-shm']){
  try{lstatSync(filename+sidecar);deny('EXISTING_ORDER_ACTIVE_DB_MUST_CLOSE')}
  catch(e){if(e?.code!=='ENOENT')throw e}
 }
 let db;
 try{
  db=new DatabaseSync(pathToFileURL(filename).href+'?immutable=1',{readOnly:true});
  db.exec('PRAGMA query_only=ON');
  // An unsigned local audit is not independent provider attestation, but a
  // broken hash chain must still block successful receipt reconciliation.
  const audit=verifyLocalAudit(db,{actorId:ACTOR_ID,merchantId});
  if(audit.integrity!=='PASS'||audit.verifiedEvents<4)
   deny('EXISTING_ORDER_AUDIT_REVIEW_REQUIRED');
  const tail=db.prepare('SELECT seq,event_hash FROM local_audit_events ORDER BY seq DESC LIMIT 1').get();
  if(!tail||!Number.isSafeInteger(tail.seq)||
     !/^[a-f0-9]{64}$/.test(tail.event_hash))
   deny('EXISTING_ORDER_AUDIT_REVIEW_REQUIRED');
  const count=db.prepare('SELECT COUNT(*) n FROM quotes').get().n;
  const row=db.prepare('SELECT id,owner_id,merchant_id,version,status,currency,'+
   'approval_actor,approval_version,approval_amount_minor FROM quotes WHERE id=?')
    .get(QUOTE_ID);
  if(count!==1||!row||row.id!==QUOTE_ID||row.owner_id!==ACTOR_ID||
     row.merchant_id!==merchantId||row.version!==1||
     row.status!=='APPROVED'||row.currency!=='USD'||
     row.approval_actor!==ACTOR_ID||row.approval_version!==row.version||
     row.approval_amount_minor!==AMOUNT)
   deny('EXISTING_ORDER_BOUND_APPROVAL_REQUIRED');
  const quote={
   id:row.id,ownerId:row.owner_id,merchantId:row.merchant_id,
   version:row.version,status:row.status,currency:row.currency,
   approval:{actorId:row.approval_actor,decision:'APPROVED',
    quoteVersion:row.approval_version,amountMinor:row.approval_amount_minor}
  };
  if(approvedAmount(quote)!==AMOUNT)deny('EXISTING_ORDER_AMOUNT_MISMATCH');
  const rows=db.prepare('SELECT operation,quote_id,quote_version,merchant_id,'+
   'state,remote_id,amount_minor,currency FROM payment_attempts WHERE quote_id=?')
    .all(QUOTE_ID);
  if(rows.length<1||rows.length>2)deny('EXISTING_ORDER_INVALID_ATTEMPTS');
  const byOp=new Map();
  for(const a of rows){
   if(!['create','capture'].includes(a.operation)||byOp.has(a.operation)||
      a.quote_id!==QUOTE_ID||a.quote_version!==1||
      a.merchant_id!==merchantId||a.amount_minor!==AMOUNT||
      a.currency!=='USD')
    deny('EXISTING_ORDER_INVALID_ATTEMPTS');
   byOp.set(a.operation,a);
  }
  const create=byOp.get('create'),capture=byOp.get('capture');
  if(!create||!['APPROVED','UNKNOWN'].includes(create.state)||
     !REMOTE_ID.test(create.remote_id??'')||
     (capture?.state==='PAID'&&!REMOTE_ID.test(capture?.remote_id??''))||
     (capture&&!['IN_FLIGHT','UNKNOWN','PAID'].includes(capture.state))||
     (capture?.remote_id&&!REMOTE_ID.test(capture.remote_id)))
   deny('EXISTING_ORDER_GET_FIRST_MANUAL_REVIEW');
  return {quote,orderId:create.remote_id,createState:create.state,
   captureState:capture?.state??null,captureId:capture?.remote_id??null,
   auditSeq:tail.seq,auditHash:tail.event_hash};
 }catch(e){
  if(typeof e?.code==='string'&&e.code.startsWith('EXISTING_ORDER_'))throw e;
  deny('EXISTING_ORDER_PRIVATE_DB_REVIEW_REQUIRED');
 }finally{try{db?.close()}catch{}}
}
const fingerprint=s=>JSON.stringify([s.quote.id,s.quote.version,
 s.quote.ownerId,s.quote.merchantId,s.quote.approval.amountMinor,
 s.orderId,s.createState,s.captureState,s.captureId,
 s.auditSeq,s.auditHash]);
export function createOwnerExistingSandboxGetRecovery({
 directory,merchantId,transport,authorizeRead
}={}){
 if(typeof authorizeRead!=='function'||transport?.mode!=='SANDBOX_ONLY'||
    typeof transport.getOrder!=='function'||
    typeof transport.getCaptureProof!=='function')
  deny('EXISTING_ORDER_GET_TRUSTED_DEPENDENCIES_REQUIRED');
 const read=()=>readSnapshot({directory,merchantId});
 return Object.freeze({
  mode:'PRIVATE_OWNER_SANDBOX_GET_ONLY_NO_PAYMENT_POST',
  inspect(){
   const state=read();
   return Object.freeze({...common,status:'EXISTING_ORDER_AVAILABLE_FOR_AUTHORIZED_GET',
    savedCreateState:state.createState,savedCaptureState:state.captureState,
    payPalGetPerformed:false,providerResultAttestedNow:false,
    orderIdExposed:false});
  },
  async refresh(){
   const before=read();
   const authorized=await authorizeRead(Object.freeze({
    action:'AUTHORIZE_EXISTING_SANDBOX_ORDER_GET_ONLY',
    actorId:ACTOR_ID,merchantId,quoteId:QUOTE_ID,
    quoteVersion:before.quote.version,amountMinor:AMOUNT,currency:'USD',
    newOrderPostPermitted:false,capturePostPermitted:false
   }));
   if(authorized!==true)deny('EXISTING_ORDER_GET_OWNER_CONSENT_REQUIRED');
   const current=read();
   if(fingerprint(before)!==fingerprint(current))
    deny('EXISTING_ORDER_LOCAL_EVIDENCE_CHANGED');
   try{
    // Before returning any provider observation, verify the same approved
    // private ledger still exists, including its unsigned local audit tail.
    const finish=(status,extra={})=>{
      let after;
      try{after=read()}catch{return Object.freeze({...common,
       status:'EXISTING_ORDER_LOCAL_CHANGED_DURING_GET',
       freshSandboxOrderGet:false,paymentVerifiedByFreshGet:false});}
      if(fingerprint(after)!==fingerprint(current))return Object.freeze({...common,
       status:'EXISTING_ORDER_LOCAL_CHANGED_DURING_GET',
       freshSandboxOrderGet:false,paymentVerifiedByFreshGet:false});
      return Object.freeze({...common,status,...extra});
    };
    // This existing transport validates the PayPal payee, reference, amount
    // and order ID against the *locally approved* USD 1.50 quote.
    const order=await transport.getOrder(current.quote,current.orderId);
    if(order.id!==current.orderId)deny('EXISTING_ORDER_REMOTE_ID_MISMATCH');
    const pending=['CREATED','PAYER_ACTION_REQUIRED','APPROVED'];
    if(pending.includes(order.status))
     return finish(order.status==='APPROVED'
      ?'SANDBOX_ORDER_APPROVED_NOT_CAPTURED':'SANDBOX_BUYER_ACTION_PENDING',{
      freshSandboxOrderGet:true,recordedCaptureUnchanged:true,
      paymentVerifiedByFreshGet:false});
    if(order.status!=='COMPLETED')
     deny('EXISTING_ORDER_REMOTE_STATUS_UNEXPECTED');
    // A completed order alone is NOT enough. Verify the single matching
    // capture using PayPal GET, with no local ledger writes.
    const proof=await transport.getCaptureProof(current.quote,current.orderId);
    const remote=proof?.capture;
    if(!remote||proof.order?.id!==current.orderId)
     return finish('SANDBOX_CAPTURE_PROOF_MISSING',{
      freshSandboxOrderGet:true,paymentVerifiedByFreshGet:false});
    if(!current.captureState)
     return finish('REMOTE_CAPTURE_WITHOUT_LOCAL_CLAIM',{
      freshSandboxOrderGet:true,paymentVerifiedByFreshGet:false});
    if(current.captureId&&current.captureId!==remote.id)
     return finish('REMOTE_CAPTURE_ID_CONFLICT',{
      freshSandboxOrderGet:true,paymentVerifiedByFreshGet:false});
    if(current.captureState!=='PAID')
     return finish('REMOTE_CAPTURE_FOUND_LOCAL_RECONCILIATION_REQUIRED',{
      freshSandboxOrderGet:true,paymentVerifiedByFreshGet:false});
    return finish('SANDBOX_CAPTURE_GET_MATCHES_LOCAL_PAID',{
     freshSandboxOrderGet:true,paymentVerifiedByFreshGet:true,
     signedExternalReceiptAvailable:false,independentAttestation:false});
   }catch(e){
    // Do not echo response payloads, IDs, bearer tokens or network messages.
    if(typeof e?.code==='string'&&e.code==='EXISTING_ORDER_REMOTE_ID_MISMATCH')
     return Object.freeze({...common,status:'SANDBOX_GET_UNVERIFIED_MANUAL_REVIEW',
      freshSandboxOrderGet:false,paymentVerifiedByFreshGet:false});
    return Object.freeze({...common,status:'SANDBOX_GET_UNVERIFIED_MANUAL_REVIEW',
     freshSandboxOrderGet:false,paymentVerifiedByFreshGet:false});
   }
  }
 });
}
