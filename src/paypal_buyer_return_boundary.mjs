// P0 buyer landing boundary: read-only loopback-only demo contract.
// These URLs are NOT production callback URLs, a PayPal result verifier,
// an account session, or payment approval evidence. No network or DB access.
const ROUTES=Object.freeze({
 '/checkout/paypal/return':'BUYER_RETURN_NOT_PAYMENT_PROOF',
 '/checkout/paypal/cancel':'BUYER_CANCEL_NOT_PAYMENT_PROOF'
});
const headers={
 'content-type':'application/json; charset=utf-8',
 'cache-control':'private, no-store',
 'x-content-type-options':'nosniff',
 'referrer-policy':'no-referrer',
 'content-security-policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
};
const reply=(status,body,more={})=>new Response(JSON.stringify(body),{
 status,headers:{...headers,...more}
});
export function createPaypalBuyerReturnBoundary({offlineOnly=true}={}){
 if(offlineOnly!==true)throw new TypeError('PUBLIC_BUYER_CALLBACK_NOT_READY');
 return Object.freeze({
  mode:'OFFLINE_MOCK_ONLY',providerAccess:false,paymentMutationEnabled:false,
  async handle(request){
   if(!(request instanceof Request))
    return reply(400,{error:'REQUEST_REQUIRED'});
   const url=new URL(request.url);
   const kind=ROUTES[url.pathname];
   if(!kind)return reply(404,{error:'NOT_FOUND'});
   if(request.method!=='GET')
    return reply(405,{error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
   // Intentionally ignore ALL browser return data (token, PayerID, status,
   // amount, merchant, quoteId, query duplicates, fragments, headers, cookies).
   // PayPal may return here on approval, cancellation or a stale/forged URL.
   // A separate authenticated backend GET/claim is mandatory for any change.
   return reply(200,{
    status:kind,
    mode:'OFFLINE_MOCK_ONLY',
    paymentState:'NOT_CONFIRMED',
    paymentVerified:false,
    orderApproved:false,
    providerGetPerformed:false,
    providerPostPerformed:false,
    ledgerMutationPerformed:false,
    retryPost:false,
    nextAction:'SEPARATE_AUTHENTICATED_PROVIDER_GET_RECONCILIATION_REQUIRED'
   });
  }
 });
}
