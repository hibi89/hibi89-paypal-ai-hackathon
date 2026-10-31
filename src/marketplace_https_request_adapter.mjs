// Trusted HTTPS request adapter for existing isolated OIDC + marketplace backend.
// No HTTP listener, automatic IdP fetch, public deployment, account enrollment,
// merchant entitlement or payment endpoints. The real host must verify inbound
// TLS/origin/proxy trust, provide external IdP credentials and apply rate limits.
import {createTrustedMarketplaceGateway} from './trusted_marketplace_gateway.mjs';

const bad=code=>{const e=new TypeError(code);e.code=code;throw e};
const baseHeaders={
 'cache-control':'private, no-store, max-age=0',
 'pragma':'no-cache',
 'x-content-type-options':'nosniff',
 'referrer-policy':'no-referrer',
 'x-frame-options':'DENY',
 'content-security-policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
 'vary':'Cookie'
};
function result(status,data,{cookies=[],location,allow}={}){
 const headers=new Headers({...baseHeaders,'content-type':'application/json; charset=utf-8'});
 for(const value of cookies)headers.append('set-cookie',value);
 if(location)headers.set('location',location);
 if(allow)headers.set('allow',allow);
 return new Response(status===303?null:JSON.stringify({...data,paymentAuthorized:false}),{
  status,headers
 });
}
function statusFor(error){
 if(!error||typeof error.code!=='string')return 503;
 const c=error.code;
 if(c==='OIDC_START_ORIGIN_REQUIRED'||c==='HOST_LOGOUT_CSRF_REQUIRED'||
    c==='HOST_CSRF_ROTATION_AUTH_REQUIRED')return 403;
 if(c.startsWith('HOST_LOGOUT_'))return 401;
 if(c==='OIDC_CALLBACK_METHOD_REQUIRED'||c==='OIDC_CALLBACK_ROUTE_REQUIRED'||
    c==='OIDC_CALLBACK_PARAMETERS_REJECTED'||c==='OIDC_CALLBACK_BINDING_REQUIRED')
   return 400;
 if(c.startsWith('OIDC_')||c.startsWith('HOST_'))return 401;
 return 503;
}
function safeError(err){
 const status=statusFor(err);
 return result(status,{error:status===400?'INVALID_AUTH_REQUEST':
  status===403?'ORIGIN_OR_CSRF_REQUIRED':
  status===503?'AUTH_BACKEND_UNAVAILABLE':'AUTHENTICATION_FAILED'});
}
function originCheck(expectedOrigin){
 let u;
 try{u=new URL(expectedOrigin)}catch{bad('HTTPS_HOST_ORIGIN_REQUIRED')}
 if(u.origin!==expectedOrigin||u.protocol!=='https:'||
    !u.hostname.includes('.')||u.port||u.username||u.password||
    u.search||u.hash||u.pathname!=='/'||
    u.hostname==='localhost'||u.hostname.endsWith('.localhost')||
    u.hostname.endsWith('.internal')||u.hostname.endsWith('.local')||
    /^(?:\d+\.){3}\d+$/.test(u.hostname))
  bad('HTTPS_HOST_ORIGIN_REQUIRED');
 return u.origin;
}
export function createMarketplaceHttpsRequestAdapter({
 expectedOrigin,ledger,loginFlow,sessionStore
}={}){
 const origin=originCheck(expectedOrigin);
 if(typeof loginFlow?.start!=='function'||
    typeof loginFlow?.complete!=='function'||
    typeof sessionStore?.resolveRequest!=='function'||
    typeof sessionStore?.resolveForGateway!=='function'||
    typeof sessionStore?.rotateCsrf!=='function'||
    typeof sessionStore?.revokeRequest!=='function')
  bad('HTTPS_HOST_VERIFIED_FLOW_AND_SESSION_REQUIRED');
 const gateway=createTrustedMarketplaceGateway({
  expectedOrigin:origin,ledger,
  resolveVerifiedHostSession:req=>sessionStore.resolveForGateway(req)
 });
 const routes=new Map([
  ['/api/auth/oidc/start','POST'],
  ['/api/auth/oidc/callback','GET'],
  ['/api/auth/oidc/session','GET'],
  ['/api/auth/oidc/csrf','POST'],
  ['/api/auth/oidc/logout','POST']
 ]);
 async function handle(request){
  if(!(request instanceof Request))return result(400,{error:'REQUEST_REQUIRED'});
  let url;
  try{url=new URL(request.url)}catch{return result(400,{error:'REQUEST_INVALID'})}
  if(url.origin!==origin||url.username||url.password||url.hash)
   return result(404,{error:'NOT_FOUND'});
  if(url.pathname.startsWith('/api/marketplace/')){
   // Outer host also ensures all marketplace responses use the same
   // non-cacheable security headers, without exposing raw session cookies.
   const answer=await gateway.handle(request);
   const headers=new Headers(answer.headers);
   for(const [key,value] of Object.entries(baseHeaders))headers.set(key,value);
   headers.delete('set-cookie');
   headers.delete('location');
   return new Response(answer.body,{status:answer.status,headers});
  }
  const method=routes.get(url.pathname);
  if(!method)return result(404,{error:'NOT_FOUND'});
  if(request.method!==method)return result(405,{error:'METHOD_NOT_ALLOWED'},{allow:method});
  if(url.pathname!=='/api/auth/oidc/callback'&&url.search)
   return result(404,{error:'NOT_FOUND'});
  try{
   switch(url.pathname){
    case '/api/auth/oidc/start':{
     if(request.body!==null)return result(400,{error:'BODY_NOT_ALLOWED'});
     const started=loginFlow.start(request);
     if(typeof started?.authorizationUrl!=='string'||
        !started.authorizationUrl.startsWith('https://')||
        typeof started?.setCookie!=='string'||
        !started.setCookie.startsWith('__Host-proofline_oidc='))
      bad('HOST_LOGIN_RESPONSE_REJECTED');
     return result(303,{},{
      location:started.authorizationUrl,cookies:[started.setCookie]
     });
    }
    case '/api/auth/oidc/callback':{
     const completed=await loginFlow.complete(request);
     return result(200,{
      authenticated:true,csrfToken:completed.csrfToken,
      expiresAtMs:completed.expiresAtMs,
      merchantOwnershipVerified:false
     },{cookies:[completed.setCookie,completed.clearLoginCookie]});
    }
    case '/api/auth/oidc/session':{
     const session=await sessionStore.resolveRequest(request);
     if(!session?.verified)return result(401,{error:'AUTHENTICATION_FAILED'});
     return result(200,{
      authenticated:true,
      identity:{actorId:session.actorId,merchantId:session.merchantId,
       role:session.role,membershipRevision:session.membershipRevision},
      merchantOwnershipVerified:false,
      csrfRefreshPath:'/api/auth/oidc/csrf'
     });
    }
    case '/api/auth/oidc/csrf':{
     if(request.body!==null)return result(400,{error:'BODY_NOT_ALLOWED'});
     if(request.headers.get('origin')!==origin)
      return result(403,{error:'ORIGIN_OR_CSRF_REQUIRED'});
     const rotated=await sessionStore.rotateCsrf(request);
     return result(200,{csrfToken:rotated.csrfToken,rotated:true});
    }
    case '/api/auth/oidc/logout':{
     if(request.body!==null)return result(400,{error:'BODY_NOT_ALLOWED'});
     if(request.headers.get('origin')!==origin)
      return result(403,{error:'ORIGIN_OR_CSRF_REQUIRED'});
     const revoked=await sessionStore.revokeRequest(request);
     return result(200,{authenticated:false,revoked:true},
      {cookies:[revoked.clearCookie]});
    }
   }
  }catch(err){return safeError(err)}
  return result(404,{error:'NOT_FOUND'});
 }
 return Object.freeze({
  handle,mode:'HTTPS_REQUEST_ADAPTER_REQUIRES_TRUSTED_EXTERNAL_HOST',
  publicListenerEnabled:false,providerHttpConfiguredByHostOnly:true,
  publicRegistrationEnabled:false,merchantOwnershipVerified:false,
  paypalOrdersEnabled:false,paymentAuthorized:false
 });
}
