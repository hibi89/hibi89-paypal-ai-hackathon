// Private Cloudflare Worker+D1 read-only list of recent owner-bound attempts.
// No PayPal GET, CREATE or CAPTURE, no public enrollment and no mutation.
// This factory is not a default Worker entrypoint.
import {createWorkerPrivateSessionResolver,PrivateSessionError} from './worker_private_session_resolver.mjs';

const PATH='/__private/attempts';
const headers={
 'content-type':'application/json; charset=utf-8',
 'cache-control':'no-store, max-age=0','pragma':'no-cache',
 'vary':'Cookie','x-content-type-options':'nosniff','x-frame-options':'DENY',
 'referrer-policy':'no-referrer',
 'content-security-policy':"default-src 'none'; frame-ancestors 'none'"
};
const respond=(status,body,extra={})=>new Response(JSON.stringify(body),
 {status,headers:{...headers,...extra}});
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const SQL=[
 'SELECT a.request_id,a.quote_id,a.quote_version,a.operation,a.state,',
 'a.amount_minor,a.currency,a.created_at',
 'FROM payment_attempts a JOIN quotes q ON q.id=a.quote_id',
 'WHERE q.owner_id=? AND q.merchant_id=? AND a.merchant_id=?',
 "AND q.status='APPROVED' AND q.version=a.quote_version",
 'ORDER BY a.created_at DESC,a.request_id DESC LIMIT ?'
].join(' ');
export function createPrivateWorkerRecentAttemptsHandler({db,allowedOrigin,now}={}){
 let origin;
 try{const u=new URL(allowedOrigin);
  if(u.protocol==='https:'&&u.origin===allowedOrigin&&!u.username&&!u.password)
   origin=allowedOrigin;
 }catch{/* unavailable */}
 if(!origin||!db||typeof db.withSession!=='function')
  throw Error('UNCONFIGURED_PRIVATE_WORKER_RECENT_ATTEMPTS');
 const resolve=createWorkerPrivateSessionResolver({db,now});
 return Object.freeze({async fetch(request){
  if(!(request instanceof Request))return respond(400,{error:'INVALID_REQUEST'});
  let url;
  try{url=new URL(request.url)}catch{return respond(400,{error:'INVALID_REQUEST'});}
  if(url.origin!==origin||url.username||url.password)
   return respond(403,{error:'ORIGIN_NOT_ALLOWED'});
  if(url.pathname!==PATH||url.hash)return respond(404,{error:'NOT_FOUND'});
  if(request.method!=='GET')return respond(405,{error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
  const site=request.headers.get('sec-fetch-site');
  if(site&&site!=='same-origin'&&site!=='none')
   return respond(403,{error:'CROSS_SITE_BLOCKED'});
  const requestOrigin=request.headers.get('origin');
  if(requestOrigin&&requestOrigin!==origin)
   return respond(403,{error:'ORIGIN_NOT_ALLOWED'});
  const params=[...url.searchParams.keys()];
  if(params.some(k=>k!=='limit')||params.length>1)
   return respond(400,{error:'INVALID_QUERY'});
  const raw=url.searchParams.get('limit');
  if(raw!==null&&!/^(?:[1-9]|1[0-9]|20)$/.test(raw))
   return respond(400,{error:'INVALID_QUERY'});
  const limit=raw===null?10:Number(raw);
  let principal;
  try{principal=await resolve(request);}
  catch(error){
   return error instanceof PrivateSessionError&&error.code==='SESSION_STORE_UNAVAILABLE'
    ?respond(503,{error:'DEPENDENCY_UNAVAILABLE'})
    :respond(401,{error:'UNAUTHENTICATED'});
  }
  let rows;
  try{
   const primary=db.withSession('first-primary');
   if(!primary||typeof primary.prepare!=='function')throw Error('D1_PRIMARY_REQUIRED');
   const result=await primary.prepare(SQL).bind(principal.actorId,principal.merchantId,
     principal.merchantId,limit).all();
   rows=result?.results;
   if(!Array.isArray(rows)||rows.length>limit)throw Error('INVALID_D1_ROWS');
  }catch{return respond(503,{error:'DEPENDENCY_UNAVAILABLE'});}
  // Revalidate the session and merchant binding after the D1 read.
  // Expired/revoked/reassigned sessions never receive a successful response.
  try{
   const latest=await resolve(request);
   if(latest.actorId!==principal.actorId||latest.merchantId!==principal.merchantId)
    throw Error('IDENTITY_CHANGED');
  }catch{return respond(401,{error:'UNAUTHENTICATED'});}
  const attempts=[];
  for(const row of rows){
   if(!id(row?.request_id)||!id(row?.quote_id)||
      !Number.isSafeInteger(row.quote_version)||row.quote_version<1||
      !['create','capture'].includes(row.operation)||
      !['IN_FLIGHT','UNKNOWN','APPROVED','PAID'].includes(row.state)||
      !Number.isSafeInteger(row.amount_minor)||row.amount_minor<100||
      row.currency!=='USD'||typeof row.created_at!=='string')
    return respond(503,{error:'DEPENDENCY_UNAVAILABLE'});
   attempts.push({
    requestId:row.request_id,quoteId:row.quote_id,quoteVersion:row.quote_version,
    operation:row.operation,localState:row.state,amountMinor:row.amount_minor,
    currency:row.currency,createdAt:row.created_at
   });
  }
  return respond(200,{attempts,count:attempts.length,limit,paginationSupported:false,
   source:'D1_LOCAL_METADATA_ONLY',verifiedPayPalGet:false,
   paymentAuthorized:false,providerCalls:0});
 }});
}
