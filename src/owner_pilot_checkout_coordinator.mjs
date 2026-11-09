// P0 owner-only PayPal Sandbox coordinator. NOT wired to HTTP or CLI.
// An authenticated host must inject a trusted, per-action human authorizer.
// Synthetic tests use an explicitly injected fake PayPal fetch. No implicit network.
// Never accept a browser-supplied session/authorization object as proof.
import {approvedAmount} from './payment_contract.mjs';
import {boundServerSessionFromStoredProof} from './pilot_checkout_session_store.mjs';
import {planOwnerSandboxPilotCheckout} from './sandbox_pilot_checkout_plan.mjs';
import {createSandboxPaymentOrchestrator} from './payment_orchestrator.mjs';

const deny=code=>{const e=new Error(code);e.code=code;throw e;};
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(value);
const unknown=detail=>Object.freeze({status:'UNKNOWN',paymentState:'NOT_CONFIRMED',
  detail,retryPost:false});
export function createOwnerPilotCheckoutCoordinator({ledger,transport,authorizeAction,
 verifyPrivateA2AReview}={}){
  if(typeof authorizeAction!=='function')deny('TRUSTED_OWNER_AUTHORIZER_REQUIRED');
  // Optional private-only prerequisite. The callback must be bound to the
  // verified host; caller-supplied request JSON is NEVER a review receipt.
  if(verifyPrivateA2AReview!==undefined&&
     typeof verifyPrivateA2AReview!=='function')
   deny('TRUSTED_PRIVATE_A2A_REVIEW_CALLBACK_REQUIRED');
  async function checkLinkedReview(quote){
   if(verifyPrivateA2AReview===undefined)return;
   let view;
   try{
    view=await verifyPrivateA2AReview(Object.freeze({
     quoteId:quote.id,quoteVersion:quote.version,
     actorId:quote.ownerId,merchantId:quote.merchantId,
     amountMinor:approvedAmount(quote),currency:quote.currency
    }));
   }catch{deny('OWNER_PILOT_PRIVATE_A2A_REVIEW_REQUIRED')}
   if(view?.status!=='PRIVATE_UNATTESTED_A2A_REVIEW_ONLY'||
      view?.provenanceClass!=='PRIVATE_INJECTED_AGENT_NOT_ATTESTED'||
      view?.quoteId!==quote.id||view?.quoteVersion!==quote.version||
      view?.amountMinor!==approvedAmount(quote)||
      view?.currency!==quote.currency||
      view?.amountMinor<100||view.amountMinor>200||
      view?.paymentAuthorized!==false||
      view?.paypalOrderCreated!==false||
      view?.paypalCapturePerformed!==false||
      view?.realProviderEvidence!==false||
      view?.modelProviderAttested!==false||
      view?.agentCalls!=='NOT_ATTESTED')
    deny('OWNER_PILOT_PRIVATE_A2A_REVIEW_REQUIRED');
  }
  if(transport?.mode!=='SANDBOX_ONLY'||
    typeof transport.createOwnerPilotOrderOnce!=='function'||
    typeof transport.getOrder!=='function'||
    typeof transport.captureOnce!=='function'||
    typeof transport.getCaptureProof!=='function')
    deny('SANDBOX_PILOT_TRANSPORT_REQUIRED');
  const payment=createSandboxPaymentOrchestrator({ledger,transport});
  async function check(input,operation=null){
    if(!input||!validId(input.quoteId)||
       typeof input.actorId!=='string'||!input.actorId||
       typeof input.merchantId!=='string'||!input.merchantId)
      deny('OWNER_PILOT_SCOPE_REQUIRED');
    const quote=await ledger.get(input.quoteId);
    if(!quote||quote.id!==input.quoteId||
       quote.ownerId!==input.actorId||quote.merchantId!==input.merchantId||
       quote.status!=='APPROVED'||quote.approval?.actorId!==input.actorId)
      deny('OWNER_PILOT_APPROVED_QUOTE_REQUIRED');
    // Proof is privately branded and is checked against durable SQLite on use.
    const bound=boundServerSessionFromStoredProof(input.sessionProof,quote);
    if(bound.actorId!==input.actorId||bound.merchantId!==input.merchantId)
      deny('OWNER_PILOT_SCOPE_REQUIRED');
    // Verify capped amount, 13-character merchant syntax, HTTPS return/cancel
    // and session binding BEFORE any durable first-claim is occupied.
    planOwnerSandboxPilotCheckout({
      quote,serverSession:bound,publicOrigin:input.publicOrigin
    });
    const cents=approvedAmount(quote);
    await checkLinkedReview(quote);
    if(operation){
      // The injected verifier MUST obtain/verify explicit human approval through
      // the trusted host. Do not use request body booleans, query params or headers.
      const approved=await authorizeAction(Object.freeze({
        operation,quoteId:quote.id,quoteVersion:quote.version,
        actorId:bound.actorId,merchantId:bound.merchantId,
        currency:quote.currency,amountMinor:cents,
      }));
      if(approved!==true)deny('OWNER_EXPLICIT_ACTION_AUTHORIZATION_REQUIRED');
      // A human consent callback can outlive the approved quote snapshot.
      // Even a newly approved version with the SAME amount must need fresh
      // checkout-session proof and fresh human consent, not the old snapshot.
      const current=await ledger.get(quote.id);
      if(!current||current.id!==quote.id||
         current.ownerId!==input.actorId||current.merchantId!==input.merchantId||
         current.status!=='APPROVED'||current.approval?.actorId!==input.actorId||
         current.version!==quote.version||current.currency!==quote.currency||
         current.approval?.quoteVersion!==quote.approval?.quoteVersion||
         current.approval?.amountMinor!==quote.approval?.amountMinor)
        deny('OWNER_PILOT_APPROVAL_CHANGED_DURING_AUTHORIZATION');
      // The branded SQLite proof also checks revocation and TTL AFTER consent.
      boundServerSessionFromStoredProof(input.sessionProof,current);
      await checkLinkedReview(current);
    }
    return {quote,bound,ctx:{quoteId:quote.id,actorId:input.actorId,
      merchantId:input.merchantId}};
  }
  async function openOwnerOrder(input){
    const {quote,ctx}=await check(input,'CREATE_SANDBOX_ORDER');
    const claim=await ledger.claimOperation({...ctx,operation:'create'});
    if(claim.action!=='FIRST_CLAIM_ONLY_NO_PROVIDER_CALL'){
      // Existing durable claim: provider GET only. Never issue second POST.
      const result=await payment.refreshOrder(ctx);
      return {...result,retryPost:false,approvalUrl:null};
    }
    try{
      // Recheck the proof after first-claim. A revoked/expired token consumes
      // the claim (safe UNKNOWN), never results in provider activity.
      boundServerSessionFromStoredProof(input.sessionProof,quote);
      await checkLinkedReview(quote);
      const created=await transport.createOwnerPilotOrderOnce(quote,claim,{
        publicOrigin:input.publicOrigin,sessionProof:input.sessionProof
      });
      if(!validId(created?.orderId)||
         !['CREATED','PAYER_ACTION_REQUIRED','APPROVED'].includes(created.orderStatus))
        deny('PILOT_CREATE_PROOF_REQUIRED');
      // A provider GET, not CREATE response or browser redirect, updates ledger.
      const order=await transport.getOrder(quote,created.orderId);
      if(order.id!==created.orderId)deny('PILOT_ORDER_ID_MISMATCH');
      const saved=await ledger.recordCreatedOrderFromGet({...ctx,order});
      return Object.freeze({status:saved.state==='APPROVED'
        ?'ORDER_APPROVED':'BUYER_APPROVAL_PENDING',
      orderId:saved.remoteId,approvalUrl:created.payerUrl,
      paymentState:'NOT_PAID',providerGetChecked:true,retryPost:false});
    }catch{
      // A PayPal POST may have reached Sandbox even when its response was lost.
      // Mark this first claim UNKNOWN and forbid any automatic retry.
      await ledger.markUnknown(claim.attempt.requestId);
      return unknown('CREATE_AMBIGUOUS_GET_FIRST_OPERATOR_REVIEW');
    }
  }
  async function refreshOwnerOrder(input){
    const {ctx}=await check(input);
    return payment.refreshOrder(ctx); // no outbound Orders POST
  }
  async function captureOwnerOrder(input){
    const {ctx}=await check(input,'CAPTURE_SANDBOX_ORDER');
    // Buyer APPROVED GET may be slow. Revalidate the *current* durable proof
    // before claiming and immediately before outbound CAPTURE POST. The proof
    // can be revoked while the provider GET is in progress.
    const beforeCapturePost=async()=>{
      const current=await ledger.get(ctx.quoteId);
      if(!current||current.id!==ctx.quoteId||
         current.ownerId!==ctx.actorId||current.merchantId!==ctx.merchantId||
         current.status!=='APPROVED'||current.approval?.actorId!==ctx.actorId)
        deny('OWNER_PILOT_APPROVED_QUOTE_REQUIRED');
      const bound=boundServerSessionFromStoredProof(input.sessionProof,current);
      if(bound.actorId!==ctx.actorId||bound.merchantId!==ctx.merchantId)
        deny('OWNER_PILOT_SCOPE_REQUIRED');
      await checkLinkedReview(current);
    };
    // Provider APPROVED GET is still mandatory; UNKNOWN never re-POSTs.
    return payment.captureApproved(ctx,{beforeCapturePost});
  }
  async function reconcileOwnerCapture(input){
    const {ctx}=await check(input);
    return payment.reconcileCapture(ctx); // GET-only
  }
  return Object.freeze({openOwnerOrder,refreshOwnerOrder,captureOwnerOrder,
    reconcileOwnerCapture,mode:'INTERNAL_OWNER_SANDBOX_PILOT_ONLY',
    publicHttpEnabled:false,implicitProviderAccess:false,
    privateA2AReviewRequired:verifyPrivateA2AReview!==undefined,
    productionAuthConfigured:false});
}
