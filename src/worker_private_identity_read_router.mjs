// Opt-in PRIVATE Worker integration of existing pinned OIDC PKCE+D1
// session authority with the previously proven read-only attempt endpoint.
// NO default export: it cannot be deployed from the existing read-only Worker.
// The host must inject separately approved IdP transport and verified trust.
// No PayPal, Gemini, self-provisioning, quote POST, capture or payment mutation.
import {createPrivateWorkerReadHandler} from './worker_private_read_entrypoint.mjs';
import {createPrivateWorkerRecentAttemptsHandler} from './worker_private_recent_attempts.mjs';
import {createPrivateWorkerAttemptsDashboard} from './worker_private_attempts_dashboard.mjs';
import {createWorkerPrivateQuoteWorkflow} from './worker_private_quote_workflow.mjs';
import {createWorkerPrivateQuoteDashboard} from './worker_private_quote_dashboard.mjs';

const headers={
 'content-type':'application/json; charset=utf-8',
 'cache-control':'no-store, max-age=0','pragma':'no-cache',
 'vary':'Cookie',
 'content-security-policy':"default-src 'none'; frame-ancestors 'none'",
 'x-content-type-options':'nosniff','x-frame-options':'DENY',
 'referrer-policy':'no-referrer'
};
const res=(status,error,extra={})=>new Response(JSON.stringify({
 error,paymentAuthorized:false
}),{status,headers:{...headers,...extra}});
const fail=()=>{throw Error('WORKER_PRIVATE_IDENTITY_NOT_CONFIGURED')};

export function createPrivateWorkerIdentityReadRouter({
 db,allowedOrigin,authority,pkceCoordinator,enabled=false,now
}={}){
 // A non-exported integration factory, not a production opt-in or permission.
 if(enabled!==true||!db||typeof db.withSession!=='function'||
    typeof authority?.revoke!=='function'||
    typeof pkceCoordinator?.start!=='function'||
    typeof pkceCoordinator?.callback!=='function')fail();
 let origin;
 try{const url=new URL(allowedOrigin);
  if(url.protocol==='https:'&&url.origin===allowedOrigin&&
     url.username===''&&url.password==='')origin=allowedOrigin;
 }catch{/* invalid environment */}
 if(!origin)fail();
 const read=createPrivateWorkerReadHandler({db,allowedOrigin:origin,now});
 const recent=createPrivateWorkerRecentAttemptsHandler({db,allowedOrigin:origin,now});
 const dashboard=createPrivateWorkerAttemptsDashboard({db,allowedOrigin:origin,now});
 const quotes=createWorkerPrivateQuoteWorkflow({db,allowedOrigin:origin,now});
 const quoteView=createWorkerPrivateQuoteDashboard({db,allowedOrigin:origin,now});
 return Object.freeze({async fetch(request){
  if(!(request instanceof Request))return res(400,'INVALID_REQUEST');
  let url;
  try{url=new URL(request.url)}catch{return res(400,'INVALID_REQUEST')}
  if(url.origin!==origin)return res(403,'ORIGIN_NOT_ALLOWED');
  // Only explicit private status/list/view and OIDC lifecycle routes; no generic public handler or
  // synthetic users. A successful IdP callback has no payment authority.
  if(url.pathname==='/__private/attempt/status')
   return read.fetch(request);
  if(url.pathname==='/__private/attempts')
   return recent.fetch(request);
  if(['/__private/attempts/view','/__private/attempts/view.css',
      '/__private/attempts/view.js'].includes(url.pathname))
   return dashboard.fetch(request);
  if(url.pathname==='/__private/quotes'||
     /^\/__private\/quotes\/[A-Za-z0-9_-]{1,128}\/approve$/.test(url.pathname))
   return quotes.fetch(request);
  if(['/__private/quotes/view','/__private/quotes/view.css',
      '/__private/quotes/view.js'].includes(url.pathname))
   return quoteView.fetch(request);
  if(url.pathname==='/api/auth/oidc/start')
   return request.method==='POST'
    ?pkceCoordinator.start(request)
    :res(405,'METHOD_NOT_ALLOWED',{allow:'POST'});
  if(url.pathname==='/api/auth/oidc/callback')
   return request.method==='GET'
    ?pkceCoordinator.callback(request)
    :res(405,'METHOD_NOT_ALLOWED',{allow:'GET'});
  if(url.pathname==='/api/auth/oidc/logout'){
   if(request.method!=='POST')return res(405,'METHOD_NOT_ALLOWED',{allow:'POST'});
   if(url.search||request.headers.get('origin')!==origin||
      !['same-origin','none'].includes(request.headers.get('sec-fetch-site')))
    return res(403,'CROSS_SITE_BLOCKED');
   try{
    const result=await authority.revoke({request});
    if(result?.revoked!==true||
       !/^__Host-proofline_session=; Secure; HttpOnly; Path=\/; SameSite=Strict; Max-Age=0$/.test(result.clearCookie??''))
      return res(503,'DEPENDENCY_UNAVAILABLE');
    const response=new Response(JSON.stringify({
      status:'SESSION_REVOKED',paymentAuthorized:false
    }),{status:200,headers});
    response.headers.append('set-cookie',result.clearCookie);
    return response;
   }catch(error){
    if(error?.code==='SESSION_REVOKE_NOT_AUTHORIZED')
     return res(401,'UNAUTHENTICATED');
    return res(503,'DEPENDENCY_UNAVAILABLE');
   }
  }
  return res(404,'NOT_FOUND');
 }});
}
