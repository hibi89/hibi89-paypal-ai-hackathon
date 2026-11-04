// Trusted-host buyer return inquiry: browser callback is a navigation hint only.
// INTERNAL interface, deliberately NOT mounted in the loopback demo/public HTTP.
// Requires separately authenticated server session and previously issued branded
// checkout-session proof. No create/capture/approve POST is reachable from here.
// Buyer URL tokens, PayerID, headers, cookies and request body are never authority.
const ROUTES=Object.freeze({
  '/checkout/paypal/return':'BUYER_RETURN_UNVERIFIED',
  '/checkout/paypal/cancel':'BUYER_CANCEL_UNVERIFIED',
});
const REPORTED=new Set([
  'ORDER_NOT_STARTED','BUYER_APPROVAL_PENDING','ORDER_APPROVED','PAID','UNKNOWN',
]);
const HEADERS=Object.freeze({
  'content-type':'application/json; charset=utf-8',
  'cache-control':'private, no-store',
  'x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer',
  'content-security-policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
});
const deny=code=>{const e=new Error(code);e.code=code;throw e;};
const response=(status,data,extra={})=>new Response(JSON.stringify(data),{
  status,headers:{...HEADERS,...extra}
});
const cleanId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(x);
function checkedPublicOrigin(origin){
  if(typeof origin!=='string'||origin!==origin.trim()||origin.length>240)
    deny('TRUSTED_PUBLIC_HTTPS_ORIGIN_REQUIRED');
  let u;
  try{u=new URL(origin);}catch{deny('TRUSTED_PUBLIC_HTTPS_ORIGIN_REQUIRED');}
  if(u.protocol!=='https:'||u.origin!==origin||u.port||u.username||
     u.password||u.search||u.hash||!u.hostname.includes('.')||
     u.hostname==='localhost'||u.hostname.endsWith('.localhost')||
     u.hostname.endsWith('.local')||u.hostname.endsWith('.internal')||
     u.hostname.startsWith('[')||/^\d+(?:\.\d+){3}$/.test(u.hostname))
    deny('TRUSTED_PUBLIC_HTTPS_ORIGIN_REQUIRED');
  return origin;
}
export function createOwnerBuyerReturnInquiry({
  coordinator,resolveTrustedCheckout,publicOrigin
}={}){
  const origin=checkedPublicOrigin(publicOrigin);
  if(coordinator?.mode!=='INTERNAL_OWNER_SANDBOX_PILOT_ONLY'||
     coordinator.publicHttpEnabled!==false||
     typeof coordinator.refreshOwnerOrder!=='function'||
     typeof resolveTrustedCheckout!=='function')
    deny('TRUSTED_BUYER_INQUIRY_DEPENDENCIES_REQUIRED');
  async function handle({request,serverSessionHandle}={}){
    if(!(request instanceof Request))
      return response(400,{error:'REQUEST_REQUIRED'});
    let url;
    try{url=new URL(request.url);}catch{return response(400,{error:'INVALID_CALLBACK_URL'});}
    const kind=ROUTES[url.pathname];
    if(!kind)return response(404,{error:'NOT_FOUND'});
    if(request.method!=='GET')
      return response(405,{error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
    // Host is configured by deployment, never from Host/X-Forwarded-* headers.
    if(url.origin!==origin)return response(403,{error:'CALLBACK_ORIGIN_MISMATCH'});
    let ctx;
    try{
      // Only a trusted server supplies serverSessionHandle. No Request,
      // query parameters, cookies or body are passed to the resolver.
      ctx=await resolveTrustedCheckout(serverSessionHandle);
      if(!ctx||ctx.verified!==true||!cleanId(ctx.quoteId)||
         !cleanId(ctx.actorId)||!cleanId(ctx.merchantId)||
         !ctx.sessionProof)
        deny('TRUSTED_CHECKOUT_SESSION_REQUIRED');
    }catch{
      return response(401,{error:'TRUSTED_CHECKOUT_SESSION_REQUIRED'});
    }
    let outcome;
    try{
      // Owner coordinator revalidates privately branded SQLite session proof,
      // quote/version/merchant and HTTPS origin, then performs GET-only reconcile.
      outcome=await coordinator.refreshOwnerOrder({
        quoteId:ctx.quoteId,actorId:ctx.actorId,merchantId:ctx.merchantId,
        publicOrigin:origin,sessionProof:ctx.sessionProof
      });
    }catch{
      return response(401,{error:'TRUSTED_CHECKOUT_SESSION_NOT_VERIFIED'});
    }
    const stage=REPORTED.has(outcome?.status)?outcome.status:'UNKNOWN';
    const paid=stage==='PAID'&&outcome.paymentState==='VERIFIED_BY_GET';
    const approved=stage==='ORDER_APPROVED'||paid;
    return response(200,{
      callback:kind,
      callbackIsPaymentProof:false,
      providerState:stage,
      buyerApprovedByTrustedGet:approved,
      paymentState:paid?'VERIFIED_PAID_BY_BACKEND_GET':'NOT_CONFIRMED',
      paymentVerifiedByTrustedGet:paid,
      browserDataTrusted:false,
      ownerAuthorizationRequiredForCapture:true,
      capturePerformedByCallback:false,
      providerPostPerformed:false,
      retryPost:false,
      nextAction:stage==='ORDER_APPROVED'
        ?'SEPARATE_OWNER_AUTHORIZED_CAPTURE_REQUIRED'
        :'TRUSTED_OWNER_RECONCILIATION_OR_REVIEW_REQUIRED',
    });
  }
  return Object.freeze({
    handle,mode:'INTERNAL_AUTHENTICATED_GET_ONLY_BUYER_RETURN',
    publicHttpEnabled:false,publicAuthImplemented:false,
    ownerCheckoutAuthRequired:true,captureOnCallback:false,
  });
}
