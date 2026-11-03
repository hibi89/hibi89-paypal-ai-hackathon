// EXPLICIT PRIVATE OPT-IN ONLY. A trusted, read-only Sandbox Orders GET may
// reconcile an approved order into D1. No CREATE, CAPTURE, payout, or LIVE API.
// Never accept a provider receipt or merchant/owner identity from the browser.
import {createWorkerPrivateSessionResolver,hashPrivateSessionCookie} from './worker_private_session_resolver.mjs';
import {isPinnedPayPalSandboxGetTransport} from './worker_pinned_paypal_sandbox_get.mjs';

const ORIGIN_ROUTE='/__private/paypal/reconcile-approved';
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const MERCHANT=/^[A-Za-z0-9]{13}$/;
const ORDER=/^[A-Za-z0-9_-]{1,64}$/;
const HEADERS={'content-type':'application/json; charset=utf-8',
 'cache-control':'no-store, max-age=0','pragma':'no-cache','vary':'Cookie',
 'content-security-policy':"default-src 'none'; frame-ancestors 'none'",
 'x-content-type-options':'nosniff','x-frame-options':'DENY',
 'referrer-policy':'no-referrer'};
const respond=(status,body)=>new Response(JSON.stringify({...body,
 paymentAuthorized:false,captureAuthorized:false,paymentPosts:0,
 reconciliationOnly:true,remoteCloudflareVerified:false
}),{status,headers:HEADERS});
const getQuery=`SELECT q.id,q.owner_id,q.merchant_id,q.version,
 q.approval_amount_minor,a.request_id,a.state,a.remote_id,a.amount_minor
 FROM quotes q
 JOIN payment_attempts a ON a.quote_id=q.id AND a.quote_version=q.version
  AND a.merchant_id=q.merchant_id AND a.operation='create'
 JOIN worker_private_sessions s ON s.token_sha256=?
  AND s.actor_id=q.owner_id AND s.merchant_id=q.merchant_id
 JOIN worker_private_oidc_bindings b ON b.issuer=s.issuer
  AND b.subject_hmac=s.binding_subject_hmac
 WHERE q.id=? AND q.version=? AND q.owner_id=? AND q.merchant_id=?
 AND a.request_id=? AND a.state IN ('IN_FLIGHT','UNKNOWN')
 AND a.remote_id IS NOT NULL AND q.status='APPROVED' AND q.currency='USD'
 AND q.approval_actor=q.owner_id AND q.approval_version=q.version
 AND q.approval_amount_minor=a.amount_minor AND a.currency='USD'
 AND s.role='OWNER' AND s.revoked_at_ms IS NULL
 AND s.expires_at_ms>? AND s.issuer_verified_at_ms>0 AND s.issuer_verified_at_ms<=?
 AND b.active=1 AND b.role='OWNER' AND b.actor_id=q.owner_id
 AND b.merchant_id=q.merchant_id AND b.revision=s.binding_revision`;
// Compare-and-set verifies the *current* session, quote, amount and remote ID
// in one D1 statement after the network round trip. Audit trigger (0005) must
// be present; no write is allowed when its table is absent.
const update=`UPDATE payment_attempts SET state='APPROVED',observed_at=CURRENT_TIMESTAMP
 WHERE request_id=? AND quote_id=? AND quote_version=? AND merchant_id=?
 AND operation='create' AND state IN ('IN_FLIGHT','UNKNOWN')
 AND remote_id=? AND amount_minor=? AND currency='USD'
 -- The newest append-only audit row must match the exact, current claim.
 -- A stale or forged audit tail cannot authorize a provider-backed state write.
 AND EXISTS(SELECT 1 FROM payment_attempt_audit e
    WHERE e.sequence=(SELECT MAX(t.sequence) FROM payment_attempt_audit t
      WHERE t.request_id=payment_attempts.request_id)
     AND e.request_id=payment_attempts.request_id
     AND e.quote_id=payment_attempts.quote_id
     AND e.quote_version=payment_attempts.quote_version
     AND e.merchant_id=payment_attempts.merchant_id
     AND e.operation=payment_attempts.operation
     AND e.after_state=payment_attempts.state
     AND e.remote_id IS payment_attempts.remote_id)
 AND EXISTS(SELECT 1 FROM quotes q
   JOIN worker_private_sessions s ON s.token_sha256=?
    AND s.actor_id=q.owner_id AND s.merchant_id=q.merchant_id
   JOIN worker_private_oidc_bindings b ON b.issuer=s.issuer
    AND b.subject_hmac=s.binding_subject_hmac
   WHERE q.id=payment_attempts.quote_id AND q.version=payment_attempts.quote_version
   AND q.merchant_id=payment_attempts.merchant_id AND q.owner_id=?
   AND q.status='APPROVED' AND q.currency='USD'
   AND q.approval_actor=q.owner_id AND q.approval_version=q.version
   AND q.approval_amount_minor=payment_attempts.amount_minor
   AND s.role='OWNER' AND s.revoked_at_ms IS NULL
   AND s.expires_at_ms>? AND s.issuer_verified_at_ms>0
   AND s.issuer_verified_at_ms<=?
   AND b.active=1 AND b.role='OWNER' AND b.actor_id=q.owner_id
   AND b.merchant_id=q.merchant_id AND b.revision=s.binding_revision)`;

async function parse(request,bodyReadTimeoutMs){
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')??''))
  throw Error('BAD_TYPE');
 const length=request.headers.get('content-length');
 if(length!==null&&(!/^\d{1,5}$/.test(length)||Number(length)>512))throw Error('TOO_LARGE');
 if(!request.body)throw Error('NO_BODY');
 // Bound the entire upload, not each individual read. A stalled client must
 // never consume a Worker request indefinitely before OWNER/D1 verification.
 const reader=request.body.getReader(),chunks=[];let size=0,timer,onAbort;
 const deadline=new Promise((_,reject)=>{
  timer=setTimeout(()=>reject(Error('BODY_READ_TIMEOUT')),bodyReadTimeoutMs);
 });
 const aborted=new Promise((_,reject)=>{
  onAbort=()=>reject(Error('BODY_ABORTED'));
  request.signal.addEventListener('abort',onAbort,{once:true});
  if(request.signal.aborted)onAbort();
 });
 try{for(;;){
  const {value,done}=await Promise.race([reader.read(),deadline,aborted]);
  if(done)break;
  if(!(value instanceof Uint8Array)||(size+=value.length)>512)throw Error('TOO_LARGE');
  chunks.push(value);
 }}finally{
  clearTimeout(timer);
  request.signal.removeEventListener('abort',onAbort);
  // A malicious stream can ignore cancel. Never await its cancellation.
  try{const cancelled=reader.cancel();cancelled?.catch?.(()=>{});}catch{}
  try{reader.releaseLock()}catch{}
 }
 const bytes=new Uint8Array(size);let pos=0;
 for(const c of chunks){bytes.set(c,pos);pos+=c.length}
 const d=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(!d||Array.isArray(d)||typeof d!=='object'||
  Object.keys(d).sort().join(',')!=='quoteId,quoteVersion,requestId'||
  !ID.test(d.requestId)||!ID.test(d.quoteId)||
  !Number.isSafeInteger(d.quoteVersion)||d.quoteVersion<1)throw Error('BODY_INVALID');
 return d;
}
function matchApprovedGet(order,row,expectedMerchantId){
 const unit=Array.isArray(order?.purchase_units)&&order.purchase_units.length===1?
  order.purchase_units[0]:null;
 // COMPLETED is not APPROVED: this reconciliation MUST NOT assert PAID.
 return ORDER.test(row.remote_id??'')&&order?.id===row.remote_id&&
  order.intent==='CAPTURE'&&order.status==='APPROVED'&&unit&&
  unit.reference_id===row.id&&unit.payee?.merchant_id===expectedMerchantId&&
  unit.amount?.currency_code==='USD'&&
  unit.amount?.value===(row.approval_amount_minor/100).toFixed(2);
}
export function createWorkerSandboxApprovalReconcile({
 db,allowedOrigin,transport,expectedMerchantId,enabled=false,now=Date.now,
 bodyReadTimeoutMs=2000
}={}){
 let origin;
 try{const u=new URL(allowedOrigin);
  if(u.protocol==='https:'&&u.origin===allowedOrigin&&!u.username&&!u.password)origin=allowedOrigin;
 }catch{}
 if(enabled!==true||!origin||!MERCHANT.test(expectedMerchantId??'')||
  typeof db?.withSession!=='function'||typeof now!=='function'||
  transport?.mode!=='PAYPAL_SANDBOX_READ_ONLY'||
  transport?.networkEnabled!==true||transport?.paymentPostsEnabled!==false||
  typeof transport.getOrder!=='function'||
  !Number.isSafeInteger(bodyReadTimeoutMs)||bodyReadTimeoutMs<100||
  bodyReadTimeoutMs>5000||!isPinnedPayPalSandboxGetTransport(transport))
  throw Error('SANDBOX_APPROVAL_RECONCILE_EXPLICIT_DEPENDENCIES_REQUIRED');
 const resolve=createWorkerPrivateSessionResolver({db,now});
 return Object.freeze({async fetch(request){
  if(!(request instanceof Request))return respond(400,{error:'INVALID_REQUEST'});
  let u;try{u=new URL(request.url)}catch{return respond(400,{error:'INVALID_URL'})}
  if(u.origin!==origin||u.pathname!==ORIGIN_ROUTE||u.search||u.hash)
   return respond(404,{error:'NOT_FOUND'});
  if(request.method!=='POST')return respond(405,{error:'METHOD_NOT_ALLOWED'});
  if(request.headers.get('origin')!==origin||
   !['same-origin','none'].includes(request.headers.get('sec-fetch-site'))||
   request.headers.get('x-proofline-intent')!=='sandbox-get-approved-reconcile-only')
   return respond(403,{error:'SAME_ORIGIN_EXPLICIT_INTENT_REQUIRED'});
  if((request.headers.get('cookie')??'').split(';').some(x=>
    x.trim().startsWith('__Host-proofline_contract_role=')))
   return respond(401,{error:'AMBIGUOUS_SESSION'});
  let args;try{args=await parse(request,bodyReadTimeoutMs)}
  catch{return respond(400,{error:'INVALID_BODY'})}
  let owner,digest,checkedAt,row;
  try{
   owner=await resolve(request);
   digest=await hashPrivateSessionCookie(request);
   checkedAt=now();
   if(!Number.isSafeInteger(checkedAt)||checkedAt<1)throw Error('CLOCK_INVALID');
   row=await db.withSession('first-primary').prepare(getQuery).bind(digest,
     args.quoteId,args.quoteVersion,owner.actorId,owner.merchantId,
     args.requestId,checkedAt,checkedAt).first();
  }catch{return respond(401,{error:'OWNER_OR_D1_UNAVAILABLE'})}
  if(!row||row.merchant_id!==expectedMerchantId||
   !ORDER.test(row.remote_id??''))return respond(409,{error:'ORDER_RECONCILE_NOT_ELIGIBLE'});
  let provider;
  try{provider=await transport.getOrder(row.remote_id)}
  catch{return respond(503,{error:'SANDBOX_GET_UNAVAILABLE_NO_RETRY'})}
  if(!matchApprovedGet(provider,row,expectedMerchantId))
   return respond(409,{error:'ORDER_NOT_VERIFIED_APPROVED',providerGetInvoked:true});
  let afterAt;
  try{
   const next=await resolve(request);
   if(next.actorId!==owner.actorId||next.merchantId!==owner.merchantId)
    throw Error('OWNER_CHANGED');
   afterAt=now();
   if(!Number.isSafeInteger(afterAt)||afterAt<checkedAt)throw Error('CLOCK_ROLLBACK');
  }catch{return respond(401,{error:'OWNER_CHANGED_NO_LEDGER_WRITE'})}
  try{
   const result=await db.withSession('first-primary').prepare(update).bind(
    args.requestId,args.quoteId,args.quoteVersion,owner.merchantId,
    row.remote_id,row.amount_minor,digest,owner.actorId,afterAt,afterAt).run();
   if(result?.meta?.changes!==1)
    return respond(409,{error:'D1_RECONCILE_CONFLICT_NO_RETRY'});
  }catch{return respond(503,{error:'D1_RECONCILE_UNKNOWN_NO_RETRY'})}
  return respond(200,{status:'APPROVED_GET_RECONCILED_NO_CAPTURE',
   ledgerState:'APPROVED',providerGetInvoked:true,ledgerWrites:1,
   providerReceiptIsPaymentAuthorization:false});
 }});
}
