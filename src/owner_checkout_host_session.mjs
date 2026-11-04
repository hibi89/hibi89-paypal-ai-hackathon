// Internal trusted-host bridge: login principal -> durable Checkout proof.
// NOT mounted on HTTP. A production host must inject real login verification
// and separate session issuance authorization. No network or PayPal calls.
// A raw cookie/query/body identity and a user-forged {verified:true} are NEVER
// accepted by this module as authority; only resolveTrustedPrincipal may attest.
// Server handles are non-serializable capabilities, valid only in this process.
// After a restart the owner must separately re-authenticate and rebind from
// private trusted host storage; no bearer token is emitted by this bridge.
import {boundServerSessionFromStoredProof} from './pilot_checkout_session_store.mjs';

const deny=code=>{const e=new Error(code);e.code=code;throw e;};
const ID=/^[a-zA-Z0-9_-]{1,64}$/;
const MERCHANT=/^[A-Za-z0-9]{13}$/;

export function createOwnerCheckoutHostSession({
  ledger,sessionStore,resolveTrustedPrincipal,authorizeSessionIssue
}={}){
  if(typeof ledger?.get!=='function'||
     typeof sessionStore?.issue!=='function'||
     typeof sessionStore?.verify!=='function'||
     typeof sessionStore?.revoke!=='function'||
     typeof resolveTrustedPrincipal!=='function'||
     typeof authorizeSessionIssue!=='function')
    deny('TRUSTED_CHECKOUT_HOST_DEPENDENCIES_REQUIRED');
  const active=new WeakMap();
  async function principalFor(hostLoginHandle){
    // Calls injected host auth verifier every time, including all reads.
    const principal=await resolveTrustedPrincipal(hostLoginHandle);
    if(principal?.verified!==true||!ID.test(principal.actorId??'')||
       !MERCHANT.test(principal.merchantId??''))
      deny('TRUSTED_HOST_LOGIN_REQUIRED');
    return Object.freeze({verified:true,actorId:principal.actorId,
      merchantId:principal.merchantId});
  }
  async function quoteFor(quoteId,principal){
    if(!ID.test(quoteId??''))deny('CHECKOUT_QUOTE_REQUIRED');
    const quote=await ledger.get(quoteId);
    if(!quote||quote.id!==quoteId||quote.ownerId!==principal.actorId||
       quote.merchantId!==principal.merchantId||
       quote.status!=='APPROVED'||
       quote.approval?.actorId!==principal.actorId||
       quote.approval?.quoteVersion!==quote.version)
      deny('TRUSTED_APPROVED_QUOTE_REQUIRED');
    return quote;
  }
  async function issue({hostLoginHandle,quoteId}={}){
    const actor=await principalFor(hostLoginHandle);
    const quote=await quoteFor(quoteId,actor);
    const authorized=await authorizeSessionIssue(Object.freeze({
      action:'ISSUE_OWNER_SANDBOX_CHECKOUT_SESSION',
      actorId:actor.actorId,merchantId:actor.merchantId,
      quoteId,quoteVersion:quote.version,
      amountMinor:quote.approval.amountMinor,currency:quote.currency
    }));
    if(authorized!==true)deny('CHECKOUT_ISSUANCE_AUTHORIZATION_REQUIRED');
    // Issue approval callback may take time: revalidate both login and quote.
    const currentActor=await principalFor(hostLoginHandle);
    if(currentActor.actorId!==actor.actorId||
       currentActor.merchantId!==actor.merchantId)
      deny('TRUSTED_HOST_LOGIN_CHANGED');
    const currentQuote=await quoteFor(quoteId,currentActor);
    if(currentQuote.version!==quote.version||
       currentQuote.approval?.amountMinor!==quote.approval.amountMinor)
      deny('APPROVED_QUOTE_CHANGED_DURING_ISSUANCE');
    const {token,expiresAtMs}=sessionStore.issue({
      quote:currentQuote,principal:currentActor
    });
    // Privately retain bearer token ONLY in WeakMap closure, never in response.
    const handle=Object.freeze(Object.create(null));
    active.set(handle,{token,quoteId,hostLoginHandle,
      actorId:currentActor.actorId,merchantId:currentActor.merchantId});
    return Object.freeze({handle,expiresAtMs,
      mode:'INTERNAL_SERVER_ONLY_NO_PUBLIC_SESSION'});
  }
  async function checked(handle){
    if(!handle||typeof handle!=='object')deny('CHECKOUT_SERVER_HANDLE_REQUIRED');
    const bound=active.get(handle);
    if(!bound)deny('CHECKOUT_SERVER_HANDLE_REQUIRED');
    const actor=await principalFor(bound.hostLoginHandle);
    if(actor.actorId!==bound.actorId||actor.merchantId!==bound.merchantId)
      deny('TRUSTED_HOST_LOGIN_CHANGED');
    const quote=await quoteFor(bound.quoteId,actor);
    const proof=sessionStore.verify({token:bound.token,quote,principal:actor});
    const branded=boundServerSessionFromStoredProof(proof,quote);
    if(branded.actorId!==actor.actorId||branded.merchantId!==actor.merchantId)
      deny('CHECKOUT_PROOF_SCOPE_MISMATCH');
    return {bound,actor,quote,proof};
  }
  async function resolveTrustedCheckout(serverHandle){
    const {bound,actor,quote,proof}=await checked(serverHandle);
    return Object.freeze({verified:true,quoteId:quote.id,
      actorId:actor.actorId,merchantId:actor.merchantId,sessionProof:proof});
  }
  async function revoke(serverHandle){
    const {bound,actor,quote}=await checked(serverHandle);
    sessionStore.revoke({token:bound.token,quote,principal:actor});
    active.delete(serverHandle);
    return Object.freeze({revoked:true});
  }
  return Object.freeze({issue,resolveTrustedCheckout,revoke,
    mode:'INTERNAL_TRUSTED_HOST_CHECKOUT_IDENTITY_BRIDGE',
    publicHttpEnabled:false,productionAuthImplemented:false,
    implicitProviderAccess:false,
    bearerTokenExposed:false});
}
