// NOT an exported deployable Worker default handler, intentionally.
// Factory implements read-only Request -> Response, requires configured HTTPS
// origin, primary D1 and SHA-256 session in private D1. No payment or AI calls.
// No public synthetic identity, signup, claim, capture, webhook, or mutations.
import {createWorkerD1PaymentBoundary} from './worker_d1_payment_boundary.mjs';
import {createWorkerPrivateSessionResolver,PrivateSessionError} from './worker_private_session_resolver.mjs';

const PATH='/__private/attempt/status';
const headers={
 'content-type':'application/json; charset=utf-8',
 'cache-control':'no-store, max-age=0',
 'x-content-type-options':'nosniff',
 'x-frame-options':'DENY',
 'referrer-policy':'no-referrer',
 'content-security-policy':"default-src 'none'; frame-ancestors 'none'",
};
const respond=(status,body,extra={})=>new Response(JSON.stringify(body),
 {status,headers:{...headers,...extra}});
const param=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);

export function createPrivateWorkerReadHandler({db,allowedOrigin,now}={}){
 let origin;
 try{const u=new URL(allowedOrigin);if(u.protocol==='https:'&&u.origin===allowedOrigin&&
    u.username===''&&u.password==='')origin=allowedOrigin;}
 catch{/* no active host */}
 if(!origin||!db||typeof db.withSession!=='function')
  throw new Error('UNCONFIGURED_PRIVATE_WORKER_READ');
 const auth=createWorkerPrivateSessionResolver({db,now});
 const payment=createWorkerD1PaymentBoundary({db,resolveVerifiedPrincipal:auth});
 return Object.freeze({async fetch(request){
   if(!(request instanceof Request))return respond(400,{error:'INVALID_REQUEST'});
   let url;
   try{url=new URL(request.url);}catch{return respond(400,{error:'INVALID_REQUEST'});}
   if(url.origin!==origin)return respond(403,{error:'ORIGIN_NOT_ALLOWED'});
   if(url.pathname!==PATH)return respond(404,{error:'NOT_FOUND'});
   if(request.method!=='GET')return respond(405,{error:'METHOD_NOT_ALLOWED'}, {'allow':'GET'});
   const fetchSite=request.headers.get('sec-fetch-site');
   if(fetchSite&&fetchSite!=='same-origin'&&fetchSite!=='none')
     return respond(403,{error:'CROSS_SITE_BLOCKED'});
   const requestOrigin=request.headers.get('origin');
   if(requestOrigin&&requestOrigin!==origin)
     return respond(403,{error:'ORIGIN_NOT_ALLOWED'});
   const keys=['quoteId','quoteVersion','operation','requestId'];
   if([...url.searchParams.keys()].length!==keys.length||
      keys.some(k=>url.searchParams.getAll(k).length!==1))
     return respond(400,{error:'INVALID_QUERY'});
   const quoteId=url.searchParams.get('quoteId');
   const requestId=url.searchParams.get('requestId');
   const operation=url.searchParams.get('operation');
   const version=url.searchParams.get('quoteVersion');
   if(!param(quoteId)||!param(requestId)||!['create','capture'].includes(operation)||
      !/^[1-9]\d{0,8}$/.test(version))
     return respond(400,{error:'INVALID_QUERY'});
   try{
     const view=await payment.inspect({request,quoteId,requestId,operation,
       quoteVersion:Number(version)});
     // This is LOCAL D1 metadata only, never a verified provider payment.
     return respond(200,{...view,paymentAuthorized:false,providerCalls:0});
   }catch(error){
     if(error?.code==='D1_SESSION_BINDING_UNAVAILABLE'||
        (error instanceof PrivateSessionError && error.code==='SESSION_STORE_UNAVAILABLE'))
       return respond(503,{error:'DEPENDENCY_UNAVAILABLE'});
     if(error?.code==='UNAUTHENTICATED')return respond(401,{error:'UNAUTHENTICATED'});
     if(error?.code==='ATTEMPT_NOT_FOUND')return respond(404,{error:'NOT_FOUND'});
     return respond(503,{error:'DEPENDENCY_UNAVAILABLE'});
   }
 }});
}
