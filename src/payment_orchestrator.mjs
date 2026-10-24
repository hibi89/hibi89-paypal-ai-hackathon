// PPL-D05 internal payment orchestration: OFFLINE MOCK VERIFICATION ONLY.
// NOT mounted to HTTP endpoints. Real PayPal credentials and merchant auth absent.
// This coordinates atomic local SQLite claims with explicit sandbox-only transport.
// Every POST is preceded by durable claim, and no repeat POST after UNKNOWN.
import { approvedAmount, requestKey } from './payment_contract.mjs';

function demand(ok, code) {
  if (!ok) {
    const error=new Error(code);
    error.code=code;
    throw error;
  }
}
export function createSandboxPaymentOrchestrator({ledger,transport}={}) {
  demand(ledger && typeof ledger.get==='function' &&
    typeof ledger.claimOperation==='function' &&
    typeof ledger.recordCreatedOrderFromGet==='function' &&
    typeof ledger.recordCaptureFromGet==='function' &&
    typeof ledger.markUnknown==='function',
  'DURABLE_LEDGER_REQUIRED');
  demand(transport?.mode==='SANDBOX_ONLY' &&
    typeof transport.createOrderOnce==='function' &&
    typeof transport.getOrder==='function' &&
    typeof transport.captureOnce==='function' &&
    typeof transport.getCaptureProof==='function',
  'SANDBOX_TRANSPORT_REQUIRED');

  async function check({quoteId,actorId,merchantId}) {
    demand(typeof quoteId==='string' &&
      typeof actorId==='string' && actorId.length>0 &&
      typeof merchantId==='string' && merchantId.length>0,
    'VERIFIED_IDENTITY_AND_MERCHANT_REQUIRED');
    const q=await ledger.get(quoteId);
    demand(q && q.id===quoteId && q.ownerId===actorId &&
      q.merchantId===merchantId,'QUOTE_NOT_FOUND');
    demand(q.status==='APPROVED' && q.approval?.actorId===actorId,
      'HUMAN_APPROVAL_REQUIRED');
    approvedAmount(q);
    return q;
  }
  const args=(ctx,operation)=>({...ctx,operation});
  const unknown=(detail)=>({status:'UNKNOWN', detail,
    paymentState:'NOT_CONFIRMED',retryPost:false});
  const orderIdValid=id=>typeof id==='string' &&
    /^[A-Za-z0-9_-]{1,64}$/.test(id);

  async function reconcileCapture(ctx) {
    const quote=await check(ctx);
    const create=await ledger.getAttempt(requestKey(quote,'create'));
    const cap=await ledger.getAttempt(requestKey(quote,'capture'));
    if (!create?.remoteId || !cap)
      return {status:'CAPTURE_NOT_STARTED',paymentState:'NOT_PAID'};
    // A verified provider GET is mandatory before PAID; no redirect/POST proof.
    try {
      const {order,capture}=await transport.getCaptureProof(quote,create.remoteId);
      if (!capture) return unknown('PROVIDER_GET_HAS_NO_COMPLETED_CAPTURE');
      const stored=await ledger.recordCaptureFromGet({
        ...ctx,order,capture,
      });
      return stored.state==='PAID'
        ? {status:'PAID',orderId:create.remoteId,captureId:stored.remoteId,
          paymentState:'VERIFIED_BY_GET'}
        : unknown('CAPTURE_NOT_VERIFIED');
    } catch {
      return unknown('PROVIDER_GET_FAILED_OR_PROOF_REJECTED');
    }
  }

  async function refreshOrder(ctx) {
    const quote=await check(ctx);
    const prior=await ledger.getAttempt(requestKey(quote,'create'));
    if (!prior) return {status:'ORDER_NOT_STARTED',paymentState:'NOT_PAID'};
    if (!prior.remoteId)
      return unknown('CREATE_POST_MAY_HAVE_RUN_ORDER_ID_NOT_SAVED_OPERATOR_REQUIRED');
    try {
      const order=await transport.getOrder(quote,prior.remoteId);
      if (order.status==='COMPLETED') {
        const result=await reconcileCapture(ctx);
        return result.status==='PAID' ? result :
          unknown('ORDER_COMPLETED_CAPTURE_PROOF_MISSING');
      }
      const recorded=await ledger.recordCreatedOrderFromGet({...ctx,order});
      return {status:recorded.state==='APPROVED'
        ? 'ORDER_APPROVED' : 'BUYER_APPROVAL_PENDING',
      orderId:recorded.remoteId,paymentState:'NOT_PAID'};
    } catch {
      return unknown('PROVIDER_GET_FAILED_OR_ORDER_PROOF_REJECTED');
    }
  }

  async function openOrder(ctx) {
    const quote=await check(ctx);
    const claim=await ledger.claimOperation(args(ctx,'create'));
    if(claim.action!=='FIRST_CLAIM_ONLY_NO_PROVIDER_CALL')
      return refreshOrder(ctx); // NEVER repeat provider POST.
    try {
      const created=await transport.createOrderOnce(quote,claim);
      demand(orderIdValid(created.orderId),'SANDBOX_ORDER_ID_REQUIRED');
      const verified=await transport.getOrder(quote,created.orderId);
      demand(verified.id===created.orderId,'SANDBOX_ORDER_ID_MISMATCH');
      const saved=await ledger.recordCreatedOrderFromGet({...ctx,order:verified});
      return {status:saved.state==='APPROVED'
        ? 'ORDER_APPROVED' : 'BUYER_APPROVAL_PENDING',
      orderId:saved.remoteId,approvalUrl:created.payerUrl,
      paymentState:'NOT_PAID'};
    } catch {
      // First POST could have reached PayPal even if this client saw an error.
      await ledger.markUnknown(claim.attempt.requestId);
      return unknown('CREATE_RESULT_AMBIGUOUS_NO_SECOND_POST');
    }
  }

  async function captureApproved(ctx) {
    const quote=await check(ctx);
    const existing=await ledger.getAttempt(requestKey(quote,'capture'));
    // A capture idempotency entry is authoritative even after process restart.
    if(existing) return reconcileCapture(ctx);
    const checked=await refreshOrder(ctx);
    if(checked.status!=='ORDER_APPROVED')
      return {status:checked.status,paymentState:'NOT_PAID',retryPost:false};
    const create=await ledger.getAttempt(requestKey(quote,'create'));
    demand(orderIdValid(create?.remoteId),'APPROVED_ORDER_ID_REQUIRED');
    const claim=await ledger.claimOperation(args(ctx,'capture'));
    if(claim.action!=='FIRST_CLAIM_ONLY_NO_PROVIDER_CALL')
      return reconcileCapture(ctx);
    try {
      await transport.captureOnce(quote,claim,create.remoteId);
    } catch {
      // Do not issue second POST, regardless of ambiguous HTTP failure.
    }
    // Assume unknown until a fresh PayPal GET demonstrates the matching capture.
    await ledger.markUnknown(claim.attempt.requestId);
    return reconcileCapture(ctx);
  }
  return Object.freeze({openOrder,refreshOrder,captureApproved,reconcileCapture,
    mode:'INTERNAL_MOCK_TEST_ONLY',publicHttpEnabled:false});
}
