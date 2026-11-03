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
import {createWorkerD1ContractFlow} from './worker_d1_contract_flow.mjs';
import {createWorkerPrivateSessionResolver} from './worker_private_session_resolver.mjs';
import {createWorkerContractRoleSessionResolver} from './worker_contract_role_session_resolver.mjs';
import {createWorkerPrivateContractDashboard} from './worker_private_contract_dashboard.mjs';
import {createWorkerSandboxOrderProof} from './worker_sandbox_order_proof.mjs';
import {createWorkerSandboxApprovalReconcile} from './worker_sandbox_order_approval.mjs';
import {createWorkerPrivatePaymentClaimRoute} from './worker_private_payment_claim_route.mjs';

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
 db,allowedOrigin,authority,pkceCoordinator,enabled=false,contractsEnabled=false,
 contractRoleSessionsEnabled=false,sandboxOrderProofEnabled=false,
 sandboxOrderApprovalEnabled=false,paymentClaimEnabled=false,sandboxOrderGetTransport,sandboxExpectedMerchantId,now
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
 // Owner can exercise BUYER role only with a real, current hashed OIDC+D1
 // session and separately pre-provisioned contract BUYER membership. Neither
 // SELLER nor REVIEWER identity can be forged from this owner-only host.
 const ownerPrincipal=createWorkerPrivateSessionResolver({db,now});
 const rolePrincipal=contractsEnabled===true&&contractRoleSessionsEnabled===true?
  createWorkerContractRoleSessionResolver({db,now}):null;
 const contracts=contractsEnabled===true?createWorkerD1ContractFlow({
  db,allowedOrigin:origin,now,roleSessionsEnabled:rolePrincipal!==null,
  resolveVerifiedPrincipal:async request=>{
   if(!rolePrincipal)return ownerPrincipal(request);
   const cookies=(request.headers.get('cookie')??'').split(';').map(s=>s.trim());
   const hasOwner=cookies.some(s=>s.startsWith('__Host-proofline_session='));
   const hasRole=cookies.some(s=>s.startsWith('__Host-proofline_contract_role='));
   // Two credentials are ambiguous. An invalid owner cookie cannot silently
   // fall back to a role session or become another identity.
   if(hasOwner&&hasRole)throw Error('AMBIGUOUS_SESSION');
   if(hasOwner){
    const p=await ownerPrincipal(request);
    return {...p,identityRole:'OWNER'};
   }
   return rolePrincipal(request);
  }
 }):null;
 const contractView=contracts?createWorkerPrivateContractDashboard({
  contracts,allowedOrigin:origin
 }):null;
 const sandboxOrderProof=sandboxOrderProofEnabled===true?
  createWorkerSandboxOrderProof({db,allowedOrigin:origin,
   transport:sandboxOrderGetTransport,
   expectedMerchantId:sandboxExpectedMerchantId,enabled:true,now}):null;
 // Explicit opt-in only. Existing hosting entrypoints do not enable this D1 claim route.
 const paymentClaim=paymentClaimEnabled===true?
  createWorkerPrivatePaymentClaimRoute({db,allowedOrigin:origin,enabled:true,now}):null;
 // A separate, explicitly enabled GET-evidence reconciliation; existing
 // read-only order-proof and payment-claim flags never imply mutation rights.
 const sandboxApproval=sandboxOrderApprovalEnabled===true?
  createWorkerSandboxApprovalReconcile({db,allowedOrigin:origin,
   transport:sandboxOrderGetTransport,expectedMerchantId:sandboxExpectedMerchantId,
   enabled:true,now}):null;
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
  if(contractView&&['/__private/contracts/view','/__private/contracts/view.css',
   '/__private/contracts/view.js'].includes(url.pathname))
   return contractView.fetch(request);
  if(contracts&&(url.pathname==='/__private/contracts'||
     /^\/__private\/contracts\/[A-Za-z0-9_-]{1,128}\/milestones\/[A-Za-z0-9_-]{1,64}\/(submit|accept|reject)$/.test(url.pathname)))
   return contracts.fetch(request);
  if(sandboxOrderProof&&url.pathname==='/__private/paypal/order-proof')
   return sandboxOrderProof.fetch(request);
  if(sandboxApproval&&url.pathname==='/__private/paypal/reconcile-approved')
   return sandboxApproval.fetch(request);
  if(paymentClaim&&['/__private/paypal/create-claim',
      '/__private/paypal/claim-recovery',
      '/__private/paypal/claim-audit'].includes(url.pathname))
   return paymentClaim.fetch(request);
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
       !(contractRoleSessionsEnabled===true?
        /^__Host-proofline_(?:session|contract_role)=; Secure; HttpOnly; Path=\/; SameSite=Strict; Max-Age=0$/:
        /^__Host-proofline_session=; Secure; HttpOnly; Path=\/; SameSite=Strict; Max-Age=0$/
       ).test(result.clearCookie??''))
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
