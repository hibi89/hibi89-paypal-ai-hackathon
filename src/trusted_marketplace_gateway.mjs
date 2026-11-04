// Host-only marketplace API adapter: existing role-based SQLite quote/contract
// read and delivery workflows, without legacy synthetic identity fallback.
// NOT an identity provider, a public server, or payment/merchant authorization.
// A future trusted HTTPS host MUST inject verified sessions, cookie/CSRF policy,
// account recovery and external seller/merchant entitlement independently.
import {createMarketplaceIdentityPolicy} from './marketplace_identity_policy.mjs';
import {createMarketplaceProtectedReadApi} from './marketplace_protected_read_api.mjs';
import {createMarketplaceContractWorkflowApi} from './marketplace_contract_workflow_api.mjs';
import {reply} from './quote_api.mjs';

const ID=/^[A-Za-z0-9_-]{1,64}$/;
const deny=code=>{const e=new TypeError(code);e.code=code;throw e;};
const response=(status,error,extra={})=>reply({error,paymentAuthorized:false},status,{
 'cache-control':'private, no-store',...extra
});
const defaultHeaders={
 'cache-control':'private, no-store',
 'x-content-type-options':'nosniff',
 'referrer-policy':'no-referrer',
 'x-frame-options':'DENY'
};
export function createTrustedMarketplaceGateway({
 ledger,resolveVerifiedHostSession,expectedOrigin
}={}){
 if(typeof resolveVerifiedHostSession!=='function'||
    typeof ledger?.getLocalMember!=='function'||
    typeof ledger?.getQuoteAuthorityResource!=='function'||
    typeof ledger?.getContractAuthorityResource!=='function'||
    typeof ledger?.transitionMarketplaceMilestone!=='function')
  deny('HOST_GATEWAY_TRUSTED_IDENTITY_AND_LEDGER_REQUIRED');
 let origin;
 try{origin=new URL(expectedOrigin)}
 catch{deny('HOST_GATEWAY_HTTPS_ORIGIN_REQUIRED')}
 if(origin.protocol!=='https:'||origin.origin!==expectedOrigin||
    !origin.hostname.includes('.')||origin.hostname==='localhost'||
    origin.hostname.endsWith('.localhost')||
    origin.hostname.endsWith('.local')||origin.hostname.endsWith('.internal')||
    origin.username||origin.password||origin.search||origin.hash||
    origin.port||/^(?:\d+\.){3}\d+$/.test(origin.hostname))
  deny('HOST_GATEWAY_HTTPS_ORIGIN_REQUIRED');

 // The policy never accepts user-supplied x-actor, x-role, quote owner or
 // object-based {verified:true} identities. Only a trusted host resolver can
 // associate an opaque server-issued session with this exact Request.
 const scoped=new WeakMap();
 const resolveSession=async internal=>{
  const ctx=scoped.get(internal);
  if(!ctx)return null;
  // A trusted host session can be revoked, expire, or switch principals while
  // a backend action is in flight. Reverify the ORIGINAL request each time
  // a policy or workflow gate asks for identity; no cached bearer authority.
  let latest;
  try{latest=await resolveVerifiedHostSession(ctx.original)}
  catch{return null}
  if(latest?.verified!==true||latest.actorId!==ctx.actorId||
     latest.merchantId!==ctx.merchantId||
     (ctx.role!==null&&latest.role!==ctx.role)||
     (ctx.method==='POST'&&
      (latest.csrfToken!==ctx.csrfToken||
       ctx.original.headers.get('x-csrf-token')!==latest.csrfToken)))
   return null;
  return {verified:true,actorId:ctx.actorId,merchantId:ctx.merchantId,
   ...(ctx.role!==null?{role:ctx.role}:{}),
   ...(ctx.method==='POST'?{csrfToken:ctx.csrfToken}:{})};
 };
 const policy=createMarketplaceIdentityPolicy({
  resolveTrustedSession:resolveSession,
  resolveMembership:actorId=>ledger.getLocalMember(actorId)
 });
 const readApi=createMarketplaceProtectedReadApi({policy,ledger});
 const workflowApi=createMarketplaceContractWorkflowApi({
  ledger,policy,resolveSession
 });
 const routes=[
  [/^\/api\/marketplace\/quotes\/([A-Za-z0-9_-]{1,64})$/, 'GET','quote'],
  [/^\/api\/marketplace\/contracts\/([A-Za-z0-9_-]{1,64})(\/events)?$/, 'GET','contract'],
  [/^\/api\/marketplace\/contracts\/([A-Za-z0-9_-]{1,64})\/milestones\/([A-Za-z0-9_-]{1,64})\/(submit|accept|reject)$/, 'POST','workflow']
 ];
 async function handle(request){
  if(!(request instanceof Request))return response(400,'REQUEST_REQUIRED');
  let url;
  try{url=new URL(request.url)}catch{return response(400,'REQUEST_URL_INVALID')}
  if(url.origin!==origin.origin||url.username||url.password||
     url.search||url.hash)
   return response(404,'NOT_FOUND');
  const match=routes.map(([re,method,kind])=>({
   parts:re.exec(url.pathname),method,kind
  })).find(x=>x.parts);
  if(!match)return response(404,'NOT_FOUND');
  if(request.method!==match.method)
   return response(405,'METHOD_NOT_ALLOWED',{allow:match.method});
  if(match.method==='POST'){
   if(request.headers.get('origin')!==origin.origin)
    return response(403,'ORIGIN_MISMATCH');
   if(request.headers.get('content-type')!=='application/json')
    return response(415,'JSON_CONTENT_TYPE_REQUIRED');
  }
  let session;
  try{session=await resolveVerifiedHostSession(request)}
  catch{return response(401,'HOST_AUTHENTICATION_REQUIRED')}
  if(session?.verified!==true||!ID.test(session.actorId??'')||
     !ID.test(session.merchantId??'')||
     (match.method==='POST'&&
      (typeof session.csrfToken!=='string'||session.csrfToken.length<16||
       request.headers.get('x-csrf-token')!==session.csrfToken)))
   return response(match.method==='POST'&&session?.verified===true?
      403:401,match.method==='POST'&&session?.verified===true?
      'CSRF_REQUIRED':'HOST_AUTHENTICATION_REQUIRED');
  // Create a separate sanitized server-internal request. The principal
  // travels only via the WeakMap, not a header, URL, JSON or cookie projection.
  const path=match.kind==='quote'?
   '/api/demo/protected/quotes/'+match.parts[1]:
   match.kind==='contract'?
    '/api/demo/protected/contracts/'+match.parts[1]+(match.parts[2]??''):
    '/api/demo/workflow/contracts/'+match.parts[1]+'/milestones/'+
     match.parts[2]+'/'+match.parts[3];
  const init={method:request.method,headers:request.headers,
   ...(match.method==='POST'?{body:request.body,duplex:'half'}:{})};
  let internal;
  try{internal=new Request(origin.origin+path,init)}
  catch{return response(400,'INVALID_REQUEST')}
  scoped.set(internal,Object.freeze({original:request,
   actorId:session.actorId,merchantId:session.merchantId,
   role:typeof session.role==='string'?session.role:null,
   method:match.method,
   csrfToken:match.method==='POST'?session.csrfToken:null
  }));
  const api=match.kind==='workflow'?workflowApi:readApi;
  let result;
  try{result=await api(internal)}
  catch{return response(503,'HOST_BACKEND_UNAVAILABLE')}
  // No PayPal or AI endpoints, cookies, token/session values or redirects.
  const headers=new Headers(result.headers);
  for(const [k,v] of Object.entries(defaultHeaders))headers.set(k,v);
  headers.delete('set-cookie');
  headers.delete('location');
  return new Response(result.body,{status:result.status,headers});
 }
 return Object.freeze({
  handle,mode:'TRUSTED_HOST_IDENTITY_REQUIRED_NOT_ATTACHED',
  publicHttpEnabled:false,loginProviderImplemented:false,
  registrationEnabled:false,merchantOwnershipVerified:false,
  sellerIdentityVerified:false,paymentAuthorized:false,
  paypalCreateEnabled:false,paypalCaptureEnabled:false,externalProviderCalls:0
 });
}
