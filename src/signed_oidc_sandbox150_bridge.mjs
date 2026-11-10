// Composition ONLY: existing signed OIDC buyer identity -> private $1.50
// cross-part review/checkout. Never a public route, provider client, host
// listener or standalone PayPal/OIDC auth implementation. The operator still
// supplies real external provider configuration and THREE distinct approvals.
// Do not use in an untrusted browser; handles remain opaque server capabilities.
import {createOwnerSandbox150TrustedCheckoutHost}
 from './owner_sandbox_150_trusted_checkout_host.mjs';
import {isPrivateOidcHostForOrigin}
 from './private_oidc_marketplace_host.mjs';

const reject=code=>{const error=new Error(code);error.code=code;throw error;};
export function createSignedOidcSandbox150Bridge({
 oidcHost,ledger,innovationStore,sessionStore,transport,reviewFilename,
 proposedQuoteBinding,publicOrigin,authorizeReviewLink,
 authorizeSessionIssue,authorizePaymentAction,now=Date.now
}={}){
 if(!isPrivateOidcHostForOrigin(oidcHost,publicOrigin)||
    oidcHost?.mode!=='PRIVATE_COMPOSED_OIDC_MARKETPLACE_HOST_NO_LISTENER'||
    oidcHost.publicListenerEnabled!==false||
    typeof oidcHost.beginCheckoutLogin!=='function'||
    typeof oidcHost.resolveCheckoutPrincipal!=='function'||
    typeof oidcHost.handle!=='function')
  reject('SIGNED_OIDC_CHECKOUT_HOST_REQUIRED');
 // Keep identity resolution authoritative at every A2A review, quote proof,
 // consent and before/after payment operation. A browser JSON identity is
 // never promoted into an authenticated actor.
 const checkout=createOwnerSandbox150TrustedCheckoutHost({
  ledger,innovationStore,sessionStore,transport,reviewFilename,
  proposedQuoteBinding,publicOrigin,
  resolveTrustedPrincipal:handle=>oidcHost.resolveCheckoutPrincipal(handle),
  authorizeReviewLink,authorizeSessionIssue,authorizePaymentAction,now
 });
 let closed=false;
 const alive=()=>{if(closed)reject('SIGNED_OIDC_CHECKOUT_BRIDGE_CLOSED')};
 async function beginBuyer(request){
  alive();
  // This is an internal host method, not an exposed HTTP endpoint. The OIDC
  // host validates an actual signed, preprovisioned BUYER session cookie.
  return oidcHost.beginCheckoutLogin(request);
 }
 const forward=(method)=>(...args)=>{
  alive();
  return checkout[method](...args);
 };
 function close(){
  if(closed)return;
  closed=true;
  checkout.close();
  // The separately owned OIDC host and caller's SQLite connections remain
  // open; tearing them down is the trusted operator's responsibility.
 }
 return Object.freeze({
  beginBuyer,
  linkReview:forward('linkReview'),
  inspectReview:forward('inspectReview'),
  issueCheckout:forward('issueCheckout'),
  openOwnerOrder:forward('openOwnerOrder'),
  refreshOwnerOrder:forward('refreshOwnerOrder'),
  captureOwnerOrder:forward('captureOwnerOrder'),
  reconcileOwnerCapture:forward('reconcileOwnerCapture'),
  revokeCheckout:forward('revokeCheckout'),
  close,
  mode:'PRIVATE_SIGNED_OIDC_SANDBOX150_COMPOSED_NO_LISTENER',
  publicHttpEnabled:false,providerAccessImplicit:false,
  modelCallsImplicit:false,merchantOwnershipVerified:false,
  paymentAuthorized:false
 });
}
