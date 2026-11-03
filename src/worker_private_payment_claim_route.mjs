// Private, disabled-by-default D1 claim + recovery inspection. NO PayPal calls.
// Owner identity comes exclusively from a validated OIDC-bound D1 session.
import {createWorkerPrivateSessionResolver,hashPrivateSessionCookie} from './worker_private_session_resolver.mjs';
import {createWorkerPaymentClaimGate} from './worker_payment_claim_gate.mjs';
const ROUTES=Object.freeze({
 '/__private/paypal/create-claim':'first-claim-no-provider',
 '/__private/paypal/claim-recovery':'inspect-recovery-only'
});
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const HEADERS={'content-type':'application/json; charset=utf-8',
 'cache-control':'no-store, max-age=0','pragma':'no-cache','vary':'Cookie',
 'content-security-policy':"default-src 'none'; frame-ancestors 'none'",
 'x-content-type-options':'nosniff','x-frame-options':'DENY',
 'referrer-policy':'no-referrer'};
const respond=(code,body)=>new Response(JSON.stringify({
 ...body,paymentAuthorized:false,providerCalls:0,captureAuthorized:false
}),{status:code,headers:HEADERS});
async function readBody(request){
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')??''))
  throw Error('INVALID_CONTENT_TYPE');
 const length=request.headers.get('content-length');
 if(length!==null&&(!/^\d{1,5}$/.test(length)||Number(length)>512))
  throw Error('BODY_LIMIT');
 if(!request.body)throw Error('EMPTY_BODY');
 const reader=request.body.getReader(),pieces=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;
  if(!(value instanceof Uint8Array)||(size+=value.byteLength)>512)throw Error('BODY_LIMIT');
  pieces.push(value);
 }}finally{try{await reader.cancel()}catch{}try{reader.releaseLock()}catch{}}
 const bytes=new Uint8Array(size);let offset=0;
 for(const part of pieces){bytes.set(part,offset);offset+=part.byteLength}
 const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||
   Object.keys(parsed).sort().join(',')!=='quoteId,quoteVersion,requestId'||
   !ID.test(parsed.requestId)||!ID.test(parsed.quoteId)||
   !Number.isSafeInteger(parsed.quoteVersion)||parsed.quoteVersion<1)
  throw Error('INVALID_BODY');
 return parsed;
}
export function createWorkerPrivatePaymentClaimRoute({
 db,allowedOrigin,enabled=false,now=Date.now
}={}){
 let origin;
 try{const url=new URL(allowedOrigin);
  if(url.protocol==='https:'&&url.origin===allowedOrigin&&
     !url.username&&!url.password)origin=allowedOrigin;}catch{}
 if(enabled!==true||!origin||typeof db?.withSession!=='function'||typeof now!=='function')
  throw Error('PRIVATE_PAYMENT_CLAIM_EXPLICIT_CONFIGURATION_REQUIRED');
 const resolve=createWorkerPrivateSessionResolver({db,now});
 const gate=createWorkerPaymentClaimGate({db});
 return Object.freeze({async fetch(request){
  if(!(request instanceof Request))return respond(400,{error:'INVALID_REQUEST'});
  let url;try{url=new URL(request.url)}catch{return respond(400,{error:'INVALID_URL'})}
  const intent=ROUTES[url.pathname];
  if(url.origin!==origin||!intent||url.search||url.hash)
   return respond(404,{error:'NOT_FOUND'});
  if(request.method!=='POST')return respond(405,{error:'METHOD_NOT_ALLOWED'});
  if(request.headers.get('origin')!==origin||
     !['same-origin','none'].includes(request.headers.get('sec-fetch-site'))||
     request.headers.get('x-proofline-intent')!==intent)
   return respond(403,{error:'OWNER_EXPLICIT_INTENT_REQUIRED'});
  let data;try{data=await readBody(request)}catch{return respond(400,{error:'INVALID_BODY'})}
  let owner;
  let sessionDigest,checkedAt;
  try{owner=await resolve(request);
   if(owner.verified!==true||!ID.test(owner.actorId)||
      !/^[A-Za-z0-9]{13}$/.test(owner.merchantId))throw Error('INVALID_OWNER');
   if(intent==='first-claim-no-provider'){
    sessionDigest=await hashPrivateSessionCookie(request);
    checkedAt=now();
    if(!Number.isSafeInteger(checkedAt)||checkedAt<=0)throw Error('INVALID_CLOCK');
   }
  }catch{return respond(401,{error:'OWNER_SESSION_REQUIRED'})}
  const fields={...data,ownerId:owner.actorId,merchantId:owner.merchantId};
  let result;
  try{result=intent==='first-claim-no-provider'?
   await gate.claimWithVerifiedSession({...fields,sessionDigest,checkedAt}):
   await gate.inspectRecovery(fields);
  }catch(error){
   const unavailable=/UNKNOWN|UNAVAILABLE|NO_RETRY/.test(error?.code??'');
   return respond(unavailable?503:409,{error:unavailable?
    'D1_UNAVAILABLE_NO_RETRY':'CLAIM_NOT_AVAILABLE'});
  }
  // Revocation during an async DB operation must never return success.
  try{const after=await resolve(request);
   if(after.verified!==true||after.actorId!==owner.actorId||
      after.merchantId!==owner.merchantId)throw Error('OWNER_CHANGED');
  }catch{
   // A successful first-claim may precede session revocation. This route
   // never invokes PayPal, so move its orphan IN_FLIGHT record to UNKNOWN.
   // If the cleanup is ambiguous, leave the claim blocked; NEVER retry CREATE.
   if(intent==='first-claim-no-provider'&&result?.claimed===true){
    try{await gate.markUnknown(fields)}catch{/* fail-closed: claim remains held */}
   }
   return respond(401,{error:'OWNER_SESSION_CHANGED_NO_RETRY'});
  }
  if(intent==='first-claim-no-provider')
   return respond(result.claimed?201:409,{status:result.state,
    claimed:result.claimed,remoteOrderCreated:false});
  return respond(200,{status:result.state,next:result.next,
   remoteIdKnown:result.remoteIdKnown,remoteOrderCreated:false});
 }});
}
