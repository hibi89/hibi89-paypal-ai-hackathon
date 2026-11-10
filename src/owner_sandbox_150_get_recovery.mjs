// Owner-local SAME-quote USD $1.50 Sandbox reconciliation after a process restart.
// Read a previously captured order ID from an immutable, private SQLite file.
// No new checkout session, no ledger write and NO Orders CREATE/CAPTURE POST.
// The caller must inject an independently restricted GET-only Sandbox transport.
import {DatabaseSync} from 'node:sqlite';
import {lstatSync,realpathSync} from 'node:fs';
import {join,basename,resolve,relative,sep,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {approvedAmount} from './payment_contract.mjs';
import {verifyLocalAudit} from './ledger_audit.mjs';

const ID=/^[A-Za-z0-9_-]{1,64}$/;
const MERCHANT=/^[A-Za-z0-9]{13}$/;
const REMOTE=/^[A-Za-z0-9_-]{1,64}$/;
const FILE='owner-sandbox150-part1.sqlite';
const fail=code=>{const error=new Error(code);error.code=code;throw error;};
const publicState=Object.freeze({
 mode:'OWNER_SANDBOX150_EXISTING_ORDER_GET_ONLY',
 newOrderPostPermitted:false,capturePostPermitted:false,
 localLedgerMutated:false,autoRetryAllowed:false,
 browserReturnTrusted:false,signedProviderReceipt:false
});
function validScope({filename,actorId,merchantId,quoteId,cwd=process.cwd()}={}){
 if(typeof filename!=='string'||!isAbsolute(filename)||basename(filename)!==FILE||
    !ID.test(actorId??'')||!MERCHANT.test(merchantId??'')||
    !ID.test(quoteId??'')||typeof cwd!=='string')
  fail('OWNER150_GET_PRIVATE_SCOPE_REQUIRED');
 let actual,stat;
 try{
  stat=lstatSync(filename);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>64*1024*1024)
   fail('OWNER150_GET_PRIVATE_DB_UNSAFE');
  actual=realpathSync(filename);
  const rel=relative(resolve(cwd),actual);
  if(rel===''||!(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)))
   fail('OWNER150_GET_OUTSIDE_REPOSITORY_REQUIRED');
  // "immutable=1" ignores WAL: reject open checkpoints rather than silently
  // inspecting an old quote or a stale payment order ID.
  for(const suffix of ['-wal','-shm']){
   try{lstatSync(filename+suffix);fail('OWNER150_GET_ACTIVE_DB_MUST_CLOSE');}
   catch(e){if(e?.code!=='ENOENT')throw e;}
  }
 }catch(e){
  if(typeof e?.code==='string'&&e.code.startsWith('OWNER150_'))throw e;
  fail('OWNER150_GET_PRIVATE_DB_UNAVAILABLE');
 }
 return actual;
}
function readSnapshot(scope){
 const filename=validScope(scope);
 let db;
 try{
  db=new DatabaseSync(pathToFileURL(filename).href+'?immutable=1',{readOnly:true});
  db.exec('PRAGMA query_only=ON');
  const q=db.prepare('SELECT id,owner_id,merchant_id,version,status,currency,'+
   'approval_actor,approval_version,approval_amount_minor FROM quotes WHERE id=?')
    .get(scope.quoteId);
  if(!q||q.id!==scope.quoteId||q.owner_id!==scope.actorId||
     q.merchant_id!==scope.merchantId||q.version!==1||
     q.status!=='APPROVED'||q.currency!=='USD'||
     q.approval_actor!==scope.actorId||q.approval_version!==q.version||
     q.approval_amount_minor!==150)
   fail('OWNER150_GET_EXACT_APPROVAL_REQUIRED');
  const member=db.prepare('SELECT actor_id,merchant_id,role,active,revision '+
   'FROM marketplace_actor_memberships WHERE actor_id=?')
   .get(scope.actorId);
  if(member?.merchant_id!==scope.merchantId||
     member?.role!=='buyer'||member.active!==1||
     !Number.isSafeInteger(member.revision)||member.revision<1)
   fail('OWNER150_GET_BUYER_MEMBERSHIP_REQUIRED');
  const quote={id:q.id,ownerId:q.owner_id,merchantId:q.merchant_id,
   version:q.version,status:q.status,currency:q.currency,
   approval:{actorId:q.approval_actor,decision:'APPROVED',
    quoteVersion:q.approval_version,amountMinor:q.approval_amount_minor}};
  if(approvedAmount(quote)!==150)
   fail('OWNER150_GET_EXACT_APPROVAL_REQUIRED');
  const audit=verifyLocalAudit(db,{actorId:scope.actorId,
   merchantId:scope.merchantId});
  if(audit.integrity!=='PASS'||audit.verifiedEvents<3)
   fail('OWNER150_GET_AUDIT_REVIEW_REQUIRED');
  const tail=db.prepare('SELECT seq,event_hash FROM local_audit_events '+
   'ORDER BY seq DESC LIMIT 1').get();
  if(!Number.isSafeInteger(tail?.seq)||tail.seq<3||
     !/^[a-f0-9]{64}$/.test(tail.event_hash))
   fail('OWNER150_GET_AUDIT_REVIEW_REQUIRED');
  const attempts=db.prepare('SELECT operation,quote_id,quote_version,'+
   'merchant_id,state,remote_id,amount_minor,currency '+
   'FROM payment_attempts WHERE quote_id=?').all(scope.quoteId);
  if(attempts.length<1||attempts.length>2)
   fail('OWNER150_GET_EXISTING_ORDER_REQUIRED');
  const byOperation=new Map();
  for(const a of attempts){
   if(!['create','capture'].includes(a.operation)||byOperation.has(a.operation)||
      a.quote_id!==quote.id||a.quote_version!==quote.version||
      a.merchant_id!==scope.merchantId||a.amount_minor!==150||
      a.currency!=='USD')
    fail('OWNER150_GET_ATTEMPT_SCOPE_MISMATCH');
   byOperation.set(a.operation,a);
  }
  const create=byOperation.get('create');
  const capture=byOperation.get('capture');
  if(!create||!['APPROVED','UNKNOWN'].includes(create.state)||
     !REMOTE.test(create.remote_id??'')||
     (capture&&!['IN_FLIGHT','UNKNOWN','PAID'].includes(capture.state))||
     (capture?.remote_id&&!REMOTE.test(capture.remote_id))||
     (capture?.state==='PAID'&&!REMOTE.test(capture.remote_id??'')))
   fail('OWNER150_GET_ORDER_ID_UNKNOWN_NO_RETRY');
  return Object.freeze({quote,orderId:create.remote_id,
   createState:create.state,captureState:capture?.state??null,
   captureId:capture?.remote_id??null,
   auditSeq:tail.seq,auditHash:tail.event_hash,
   memberRevision:member.revision});
 }catch(e){
  if(typeof e?.code==='string'&&e.code.startsWith('OWNER150_'))throw e;
  fail('OWNER150_GET_LEDGER_UNVERIFIED');
 }finally{try{db?.close()}catch{}}
}
const fingerprint=s=>JSON.stringify([s.quote.id,s.quote.version,
 s.quote.ownerId,s.quote.merchantId,s.quote.currency,
 s.quote.approval.amountMinor,s.orderId,s.createState,
 s.captureState,s.captureId,s.auditSeq,s.auditHash,s.memberRevision]);
export function inspectOwnerSandbox150ExistingOrder(scope){
 const snapshot=readSnapshot(scope);
 return Object.freeze({...publicState,
  status:'OWNER150_EXISTING_ORDER_ELIGIBLE_FOR_GET',
  existingOrderIdSaved:true,
  localCreateState:snapshot.createState,
  localCaptureState:snapshot.captureState,
  networkRequests:0,freshSandboxOrderGet:false,paymentVerifiedByFreshGet:false});
}
export function createOwnerSandbox150GetRecovery({
 quoteScope,transport,authorizeRead
}={}){
 if(!quoteScope||typeof authorizeRead!=='function'||
    transport?.mode!=='SANDBOX_ONLY'||
    transport?.sandboxBase!=='https://api-m.sandbox.paypal.com'||
    typeof transport.getOrder!=='function'||
    typeof transport.getCaptureProof!=='function')
  fail('OWNER150_GET_TRUSTED_TRANSPORT_REQUIRED');
 const read=()=>readSnapshot(quoteScope);
 const unchanged=before=>{
  try{return fingerprint(read())===fingerprint(before)}
  catch{return false}
 };
 return Object.freeze({
  mode:'OWNER150_SAME_QUOTE_RESTART_GET_ONLY',
  inspect:()=>inspectOwnerSandbox150ExistingOrder(quoteScope),
  async refresh(){
   const before=read();
   const allowed=await authorizeRead(Object.freeze({
    action:'READ_EXISTING_OWNER150_SANDBOX_ORDER_ONLY',
    quoteId:before.quote.id,quoteVersion:1,
    actorId:before.quote.ownerId,merchantId:before.quote.merchantId,
    amountMinor:150,currency:'USD',paymentPostPermitted:false
   }));
   if(allowed!==true)fail('OWNER150_GET_EXPLICIT_READ_AUTHORIZATION_REQUIRED');
   if(!unchanged(before))fail('OWNER150_GET_LOCAL_EVIDENCE_CHANGED');
   const finish=(status,flags={})=>Object.freeze({...publicState,
    status,...flags,
    freshSandboxOrderGet:flags.freshSandboxOrderGet===true&&unchanged(before),
    paymentVerifiedByFreshGet:flags.paymentVerifiedByFreshGet===true&&unchanged(before)
   });
   let order;
   try{
    // The injected firewall allows ONLY Sandbox OAuth POST and this saved
    // existing-order GET, never Orders CREATE/CAPTURE POST or Live traffic.
    order=await transport.getOrder(before.quote,before.orderId);
    if(order?.id!==before.orderId)
     fail('OWNER150_GET_REMOTE_ID_CONFLICT');
    if(!unchanged(before))
     return finish('OWNER150_LOCAL_CHANGED_DURING_PROVIDER_GET');
    if(['CREATED','PAYER_ACTION_REQUIRED','APPROVED'].includes(order.status)){
     if(before.captureState==='PAID')
      return finish('OWNER150_REMOTE_PENDING_LOCAL_PAID_CONFLICT',{
       freshSandboxOrderGet:true
      });
     return finish(order.status==='APPROVED'?
      'OWNER150_BUYER_APPROVED_SEPARATE_CAPTURE_REQUIRED':
      'OWNER150_BUYER_ACTION_PENDING',{freshSandboxOrderGet:true});
    }
    if(order.status!=='COMPLETED')
     fail('OWNER150_GET_REMOTE_STATE_UNEXPECTED');
    const proof=await transport.getCaptureProof(before.quote,before.orderId);
    if(!unchanged(before))
     return finish('OWNER150_LOCAL_CHANGED_DURING_PROVIDER_GET');
    const capture=proof?.capture;
    if(!capture||proof.order?.id!==before.orderId)
     return finish('OWNER150_CAPTURE_GET_NOT_VERIFIED',{
      freshSandboxOrderGet:true
     });
    if(before.captureId&&before.captureId!==capture.id)
     return finish('OWNER150_CAPTURE_ID_CONFLICT',{
      freshSandboxOrderGet:true
     });
    if(!before.captureState)
     return finish('OWNER150_REMOTE_CAPTURE_WITHOUT_LOCAL_CLAIM',{
      freshSandboxOrderGet:true
     });
    if(before.captureState!=='PAID')
     return finish('OWNER150_REMOTE_CAPTURE_LOCAL_REVIEW_REQUIRED',{
      freshSandboxOrderGet:true
     });
    return finish('OWNER150_GET_MATCHES_LOCAL_PAID',{
     freshSandboxOrderGet:true,paymentVerifiedByFreshGet:true
    });
   }catch{
    return finish('OWNER150_PROVIDER_GET_UNVERIFIED_MANUAL_REVIEW');
   }
  }
 });
}
