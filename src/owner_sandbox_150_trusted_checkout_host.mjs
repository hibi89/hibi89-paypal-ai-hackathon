// Host-only orchestration of existing $1.50 A2A -> approved Part1 quote ->
// independently verified login -> consented private review -> checkout proof ->
// PayPal Sandbox coordinator. NO listener, identity provider or implicit POST.
// A real host must supply trusted authentication and THREE distinct authorizers.
import {createMarketplaceIdentityPolicy} from './marketplace_identity_policy.mjs';
import {createCrossPartReviewBridge} from './cross_part_review_bridge.mjs';
import {createOwnerCheckoutHostSession} from './owner_checkout_host_session.mjs';
import {createOwnerPilotCheckoutCoordinator} from './owner_pilot_checkout_coordinator.mjs';

const ID=/^[A-Za-z0-9_-]{1,64}$/;
const MERCHANT=/^[A-Za-z0-9]{13}$/;
const SHA=/^[a-f0-9]{64}$/;
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
export function createOwnerSandbox150TrustedCheckoutHost({
 ledger,innovationStore,sessionStore,transport,reviewFilename,
 proposedQuoteBinding,publicOrigin,resolveTrustedPrincipal,
 authorizeReviewLink,authorizeSessionIssue,authorizePaymentAction,
 now=Date.now
}={}){
 if(typeof ledger?.get!=='function'||typeof ledger?.getLocalMember!=='function'||
    typeof innovationStore?.state!=='function'||
    typeof sessionStore?.issue!=='function'||typeof sessionStore?.verify!=='function'||
    typeof sessionStore?.revoke!=='function'||
    transport?.mode!=='SANDBOX_ONLY'||
    typeof reviewFilename!=='string'||!reviewFilename||reviewFilename===':memory:'||
    typeof resolveTrustedPrincipal!=='function'||
    typeof authorizeReviewLink!=='function'||
    typeof authorizeSessionIssue!=='function'||
    typeof authorizePaymentAction!=='function'||typeof now!=='function'||
    !ID.test(proposedQuoteBinding?.quoteId??'')||
    !ID.test(proposedQuoteBinding?.actorId??'')||
    !MERCHANT.test(proposedQuoteBinding?.merchantId??'')||
    proposedQuoteBinding?.amountMinor!==150||
    proposedQuoteBinding?.currency!=='USD'||
    proposedQuoteBinding?.quoteStatus!=='PROPOSED_NOT_PAYMENT_AUTHORITY'||
    !Number.isSafeInteger(proposedQuoteBinding?.quoteVersion)||
    proposedQuoteBinding.quoteVersion<1||
    !SHA.test(proposedQuoteBinding?.quoteFingerprint??''))
  fail('OWNER_150_TRUSTED_HOST_CONFIG_REQUIRED');
 let origin;
 try{origin=new URL(publicOrigin)}catch{fail('OWNER_150_TRUSTED_HTTPS_ORIGIN_REQUIRED')}
 if(typeof publicOrigin!=='string'||origin.origin!==publicOrigin||
    origin.protocol!=='https:'||origin.username||origin.password||
    origin.hostname==='localhost'||origin.hostname.endsWith('.localhost')||
    origin.hostname.endsWith('.local')||
    !origin.hostname.includes('.')||/^(?:\d+\.){3}\d+$/.test(origin.hostname))
  fail('OWNER_150_TRUSTED_HTTPS_ORIGIN_REQUIRED');
 // Host callback is the ONLY identity source. Request JSON, cookies, query
 // booleans, and synthetic local user strings never cross this boundary.
 // Close is an immediate authorization cancellation, including for callbacks
 // that were already awaiting independent buyer/owner decisions.
 let closed=false;
 const alive=()=>{if(closed)fail('OWNER_150_TRUSTED_HOST_CLOSED')};
 const livePrincipal=async handle=>{
  alive();
  const principal=await resolveTrustedPrincipal(handle);
  alive();
  return principal;
 };
 const identityPolicy=createMarketplaceIdentityPolicy({
  resolveTrustedSession:livePrincipal,
  resolveMembership:async actorId=>ledger.getLocalMember(actorId)
 });
 const bridge=createCrossPartReviewBridge({
  filename:reviewFilename,ledger,innovationStore,identityPolicy,now,
  allowUnattestedPrivateA2A:true,
  trustedSandboxPilotSellerFloorMinor:150,
  trustedProposedQuoteBinding:proposedQuoteBinding,
  authorizeLink:async detail=>{
   alive();
   const allowed=await authorizeReviewLink(detail);
   alive();
   return allowed;
  }
 });
 const checkoutHost=createOwnerCheckoutHostSession({
  ledger,resolveTrustedPrincipal:livePrincipal,
  // The last SQLite issue() operation is synchronous. Checking liveness
  // right there prevents token creation if the host closed during one of the
  // preceding asynchronous principal/quote validation steps.
  sessionStore:Object.freeze({
   issue:args=>{alive();return sessionStore.issue(args)},
   verify:args=>sessionStore.verify(args),
   revoke:args=>sessionStore.revoke(args)
  }),
  authorizeSessionIssue:async detail=>{
   alive();
   const allowed=await authorizeSessionIssue(detail);
   alive();
   return allowed;
  }
 });
 const handles=new WeakMap();
 const qid=proposedQuoteBinding.quoteId;
 async function linkReview({hostLoginHandle,consentId}={}){
  alive();
  if(!hostLoginHandle||typeof hostLoginHandle!=='object'||
     !ID.test(consentId??''))fail('OWNER_150_TRUSTED_REVIEW_SCOPE_REQUIRED');
  const review=await bridge.link({hostHandle:hostLoginHandle,
   quoteId:qid,consentId});
  alive();
  if(review.status!=='PRIVATE_UNATTESTED_A2A_REVIEW_ONLY'||
     review.paymentAuthorized!==false)fail('OWNER_150_REVIEW_NOT_VERIFIED');
  return review;
 }
 async function inspectReview({hostLoginHandle}={}){
  alive();
  const review=await bridge.inspect({hostHandle:hostLoginHandle,quoteId:qid});
  alive();
  return review;
 }
 // A verified buyer may withdraw the durable Part1/Part2 review at any time
 // while the link is active. Withdrawal does NOT cancel a prior capture or
 // issue any PayPal POST. Future checkout operations recheck this tombstone.
 async function revokeReview({hostLoginHandle}={}){
  alive();
  if(!hostLoginHandle||typeof hostLoginHandle!=='object')
   fail('OWNER_150_TRUSTED_REVIEW_SCOPE_REQUIRED');
  const revoked=await bridge.revoke({hostHandle:hostLoginHandle,quoteId:qid});
  alive();
  if(revoked?.status!=='SYNTHETIC_REVIEW_REVOKED'||
     revoked.paymentAuthorized!==false)
   fail('OWNER_150_REVIEW_REVOKE_NOT_CONFIRMED');
  return revoked;
 }
 async function issueCheckout({hostLoginHandle}={}){
  alive();
  // Do not mint a checkout bearer before independently authorized A2A link.
  const review=await inspectReview({hostLoginHandle});
  alive();
  if(review.status!=='PRIVATE_UNATTESTED_A2A_REVIEW_ONLY'||
     review.quoteId!==qid||review.amountMinor!==150||
     review.paymentAuthorized!==false)fail('OWNER_150_REVIEW_NOT_VERIFIED');
  const issued=await checkoutHost.issue({hostLoginHandle,quoteId:qid});
  alive();
  const serverHandle=Object.freeze(Object.create(null));
  // A login can be withdrawn while the owner authorization dialog or
  // Sandbox OAuth GET is awaiting. Durable checkout proof alone is NOT a
  // substitute for a still-authenticated independent buyer principal.
  const requireLivePrincipal=async req=>{
   // Closing the host withdraws authority even for an already pending
   // owner-consent callback. Never send a Sandbox POST after shutdown.
   alive();
   const current=await checkoutHost.resolveTrustedCheckout(issued.handle);
   alive();
   if(current.quoteId!==qid||
      current.actorId!==proposedQuoteBinding.actorId||
      current.merchantId!==proposedQuoteBinding.merchantId||
      (req&&(current.quoteId!==req.quoteId||
       current.actorId!==req.actorId||
       current.merchantId!==req.merchantId)))
    fail('OWNER_150_TRUSTED_CHECKOUT_SCOPE_CHANGED');
  };
  const coordinator=createOwnerPilotCheckoutCoordinator({
   ledger,transport,
   verifyPrivateA2AReview:async req=>{
    await requireLivePrincipal(req);
    const review=await bridge.inspect({
     hostHandle:hostLoginHandle,quoteId:req.quoteId
    });
    // bridge.inspect may await SQLite/identity. A previously valid login
    // must not be allowed to survive its revocation during that await.
    await requireLivePrincipal(req);
    return review;
   },
   authorizeAction:async detail=>{
    await requireLivePrincipal(detail);
    const consent=await authorizePaymentAction(Object.freeze({
     ...detail,hostLoginHandle
    }));
    // Re-validate after the independently injected owner-consent callback,
    // not only once before the human saw its confirmation.
    await requireLivePrincipal(detail);
    return consent===true;
   }
  });
  handles.set(serverHandle,{inner:issued.handle,coordinator});
  return Object.freeze({serverHandle,expiresAtMs:issued.expiresAtMs,
   trustedCheckoutLocalOnly:true,paymentAuthorized:false,
   ordersCreatePerformed:false,paypalCapturePerformed:false,
   providerCalls:0});
 }
 async function perform(op,serverHandle){
  alive();
  if(!serverHandle||typeof serverHandle!=='object')
   fail('OWNER_150_TRUSTED_CHECKOUT_HANDLE_REQUIRED');
  const entry=handles.get(serverHandle);
  if(!entry)fail('OWNER_150_TRUSTED_CHECKOUT_HANDLE_REQUIRED');
  // Validates private WeakMap bearer, host principal, membership and TTL
  // on EVERY operation. The coordinator rechecks the private A2A link.
  const scope=await checkoutHost.resolveTrustedCheckout(entry.inner);
  alive();
  if(scope.quoteId!==qid||
     scope.actorId!==proposedQuoteBinding.actorId||
     scope.merchantId!==proposedQuoteBinding.merchantId)
   fail('OWNER_150_TRUSTED_CHECKOUT_SCOPE_CHANGED');
  const input={quoteId:qid,actorId:scope.actorId,
   merchantId:scope.merchantId,sessionProof:scope.sessionProof,publicOrigin};
  let result;
  if(op==='open')result=await entry.coordinator.openOwnerOrder(input);
  else if(op==='refresh')result=await entry.coordinator.refreshOwnerOrder(input);
  else if(op==='capture')result=await entry.coordinator.captureOwnerOrder(input);
  else if(op==='reconcile')result=await entry.coordinator.reconcileOwnerCapture(input);
  else fail('OWNER_150_OPERATION_UNSUPPORTED');
  // Provider OAuth/GET and durable SQLite inspection can outlive the login.
  // Even a GET-only result must not be disclosed to a revoked identity.
  // Orders/Capture POSTs already have separate before-POST proof checks and
  // persistent one-shot claims. Do not retry a POST if this final check fails.
  const after=await checkoutHost.resolveTrustedCheckout(entry.inner);
  alive();
  if(after.quoteId!==scope.quoteId||after.actorId!==scope.actorId||
     after.merchantId!==scope.merchantId)
   fail('OWNER_150_TRUSTED_CHECKOUT_SCOPE_CHANGED');
  return result;
 }
 async function revokeCheckout(serverHandle){
  alive();
  const entry=handles.get(serverHandle);
  if(!entry)fail('OWNER_150_TRUSTED_CHECKOUT_HANDLE_REQUIRED');
  await checkoutHost.revoke(entry.inner);
  alive();
  handles.delete(serverHandle);
  return Object.freeze({status:'LOCAL_CHECKOUT_REVOKED',
   paymentAuthorized:false,providerCalls:0});
 }
 function close(){
  if(closed)return;
  closed=true;
  bridge.close();
 }
 return Object.freeze({
  linkReview,inspectReview,revokeReview,issueCheckout,
  openOwnerOrder:handle=>perform('open',handle),
  refreshOwnerOrder:handle=>perform('refresh',handle),
  captureOwnerOrder:handle=>perform('capture',handle),
  reconcileOwnerCapture:handle=>perform('reconcile',handle),
  revokeCheckout,close,
  mode:'PRIVATE_TRUSTED_AUTHENTICATED_SANDBOX150_HOST_ONLY',
  publicHttpEnabled:false,productionIdentityProvidedByHostOnly:true,
  providerNetworkConfiguredByCallerOnly:true,
  automaticPaymentAuthorized:false
 });
}
