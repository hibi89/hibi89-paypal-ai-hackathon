// Internal owner-only, no-mutation Sandbox Orders GET verification boundary.
// This API is unmounted unless the private host supplies explicit opt-in and
// a separately approved Sandbox GET-only transport. Never executes capture.
import {createWorkerPrivateSessionResolver,hashPrivateSessionCookie} from './worker_private_session_resolver.mjs';
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const ORDER=/^[A-Za-z0-9_-]{1,64}$/;
const MERCHANT=/^[A-Za-z0-9]{13}$/;
const ROUTE='/__private/paypal/order-proof';
const HEADERS={'content-type':'application/json; charset=utf-8',
 'cache-control':'no-store, max-age=0','pragma':'no-cache','vary':'Cookie',
 'content-security-policy':"default-src 'none'; frame-ancestors 'none'",
 'x-content-type-options':'nosniff','x-frame-options':'DENY',
 'referrer-policy':'no-referrer'};
const reply=(status,data)=>new Response(JSON.stringify({...data,
 paymentAuthorized:false,paymentPosts:0,ledgerWrites:0,
 remoteCloudflareVerified:false,provenance:'INJECTED_SANDBOX_GET_NOT_EXTERNAL_ATTESTATION'}),
 {status,headers:HEADERS});
async function bodyOf(request){
 const type=request.headers.get('content-type')??'';
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(type))
  throw Error('BAD_TYPE');
 const contentLen=request.headers.get('content-length');
 if(contentLen!==null&&(!/^\d{1,5}$/.test(contentLen)||Number(contentLen)>1024))
  throw Error('BODY_TOO_LARGE');
 if(!request.body)throw Error('BODY_REQUIRED');
 let count=0;const parts=[],reader=request.body.getReader();
 try{while(true){
  const {value,done}=await reader.read();if(done)break;
  if(!(value instanceof Uint8Array)||(count+=value.length)>1024)
   throw Error('BODY_TOO_LARGE');
  parts.push(value);
 }}finally{try{await reader.cancel()}catch{}try{reader.releaseLock()}catch{}}
 const bytes=new Uint8Array(count);let at=0;
 for(const part of parts){bytes.set(part,at);at+=part.length}
 const v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(!v||typeof v!=='object'||Array.isArray(v)||
   Object.keys(v).sort().join(',')!=='quoteId,quoteVersion'||
   !ID.test(v.quoteId)||!Number.isSafeInteger(v.quoteVersion)||v.quoteVersion<1)
  throw Error('INVALID_BODY');
 return v;
}
const READ=[
 'SELECT q.id,q.owner_id,q.merchant_id,q.version,q.currency,q.status,',
 'q.approval_actor,q.approval_version,q.approval_amount_minor,',
 'a.remote_id,a.state AS ledger_state,a.amount_minor AS attempt_minor',
 'FROM quotes q',
 'JOIN payment_attempts a ON a.quote_id=q.id AND a.quote_version=q.version',
 "AND a.operation='create' AND a.merchant_id=q.merchant_id",
 'JOIN worker_private_sessions s ON s.actor_id=q.owner_id',
 'AND s.merchant_id=q.merchant_id',
 'JOIN worker_private_oidc_bindings b ON b.issuer=s.issuer',
 'AND b.subject_hmac=s.binding_subject_hmac',
 'WHERE q.id=? AND q.version=? AND q.owner_id=? AND q.merchant_id=?',
 "AND q.currency='USD' AND q.status='APPROVED'",
 'AND q.approval_actor=q.owner_id AND q.approval_version=q.version',
 'AND q.approval_amount_minor BETWEEN 100 AND 1000000',
 'AND a.amount_minor=q.approval_amount_minor',
 'AND s.token_sha256=? AND s.revoked_at_ms IS NULL',
 'AND s.expires_at_ms>? AND s.issuer_verified_at_ms<=?',
 "AND s.role='OWNER' AND b.active=1 AND b.role='OWNER'",
 'AND b.actor_id=s.actor_id AND b.merchant_id=s.merchant_id',
 'AND b.revision=s.binding_revision'
].join(' ');
function verified(order,row){
 const unit=Array.isArray(order?.purchase_units)&&order.purchase_units.length===1?
  order.purchase_units[0]:null;
 if(!ORDER.test(row.remote_id??'')||order?.id!==row.remote_id||
   order.intent!=='CAPTURE'||!['CREATED','PAYER_ACTION_REQUIRED','APPROVED','COMPLETED'].includes(order.status)||
   !unit||unit.reference_id!==row.id||unit.payee?.merchant_id!==row.merchant_id||
   unit.amount?.currency_code!=='USD'||
   unit.amount?.value!==(row.approval_amount_minor/100).toFixed(2))
  throw Error('SANDBOX_ORDER_PROOF_CONFLICT');
 return order.status;
}
export function createWorkerSandboxOrderProof({
 db,allowedOrigin,transport,expectedMerchantId,enabled=false,now=Date.now
}={}){
 let origin;
 try{const u=new URL(allowedOrigin);
  if(u.protocol==='https:'&&u.origin===allowedOrigin&&!u.username&&!u.password)
   origin=allowedOrigin;}catch{}
 if(enabled!==true||!origin||!MERCHANT.test(expectedMerchantId??'')||
   typeof db?.withSession!=='function'||
   transport?.mode!=='PAYPAL_SANDBOX_READ_ONLY'||
   transport?.networkEnabled!==true||transport?.paymentPostsEnabled!==false||
   typeof transport.getOrder!=='function'||typeof now!=='function')
  throw Error('SANDBOX_GET_EXPLICIT_PRIVATE_DEPENDENCIES_REQUIRED');
 const resolve=createWorkerPrivateSessionResolver({db,now});
 return Object.freeze({async fetch(request){
  if(!(request instanceof Request))return reply(400,{error:'INVALID_REQUEST'});
  let url;try{url=new URL(request.url)}catch{return reply(400,{error:'INVALID_REQUEST'})}
  if(url.origin!==origin||url.pathname!==ROUTE||url.search||url.hash)
   return reply(404,{error:'NOT_FOUND'});
  if(request.method!=='POST')return reply(405,{error:'METHOD_NOT_ALLOWED'});
  if(request.headers.get('origin')!==origin||
    !['same-origin','none'].includes(request.headers.get('sec-fetch-site'))||
    request.headers.get('x-proofline-intent')!=='sandbox-order-get-only')
   return reply(403,{error:'EXPLICIT_SAME_ORIGIN_INTENT_REQUIRED'});
  let args;
  try{args=await bodyOf(request)}catch{return reply(400,{error:'INVALID_BODY'})}
  let principal,digest,row,time,dbp;
  try{
   principal=await resolve(request);
   digest=await hashPrivateSessionCookie(request);
   time=now();
   if(!Number.isSafeInteger(time)||time<1)throw Error('CLOCK');
   dbp=db.withSession('first-primary');
   row=await dbp.prepare(READ).bind(args.quoteId,args.quoteVersion,
     principal.actorId,principal.merchantId,digest,time,time).first();
  }catch{return reply(401,{error:'OWNER_OR_D1_UNAVAILABLE'})}
  if(!row||row.merchant_id!==expectedMerchantId||
    !ORDER.test(row.remote_id??'')||
    !['IN_FLIGHT','UNKNOWN','APPROVED'].includes(row.ledger_state))
   return reply(409,{error:'ORDER_PROOF_PRECONDITION_UNAVAILABLE'});
  let orderStatus;
  try{
   const data=await transport.getOrder(row.remote_id);
   orderStatus=verified(data,row);
  }catch{return reply(503,{error:'SANDBOX_ORDER_GET_OR_PROOF_UNAVAILABLE'})}
  // A revoked/reassigned owner cannot see proof even if it was valid before
  // the network round-trip. This endpoint NEVER writes ledger states.
  try{
   const after=await resolve(request);
   if(after.actorId!==principal.actorId||after.merchantId!==principal.merchantId)
    throw Error('PRINCIPAL_CHANGED');
   const fresh=await db.withSession('first-primary').prepare(READ)
    .bind(args.quoteId,args.quoteVersion,principal.actorId,
     principal.merchantId,digest,now(),now()).first();
   if(!fresh||fresh.remote_id!==row.remote_id||
      fresh.ledger_state!==row.ledger_state||
      fresh.attempt_minor!==row.attempt_minor||
      fresh.approval_amount_minor!==row.approval_amount_minor||
      fresh.merchant_id!==row.merchant_id||
      fresh.owner_id!==row.owner_id||
      fresh.version!==row.version||
      fresh.currency!==row.currency)
    throw Error('D1_CHANGED');
  }catch{return reply(401,{error:'OWNER_SESSION_OR_D1_CHANGED'})}
  return reply(200,{
   status:'SANDBOX_GET_EVIDENCE_VALIDATED_NO_LEDGER_COMMIT',
   quoteVersion:row.version,orderStatus,ledgerState:row.ledger_state,
   amountMinor:row.approval_amount_minor,currency:'USD',
   reconciliationRequired:orderStatus==='COMPLETED'||row.ledger_state!=='APPROVED',
   orderReferenceMatches:true,providerGetInvoked:true,
   providerReceiptIsPaymentAuthorization:false
  });
 }});
}
