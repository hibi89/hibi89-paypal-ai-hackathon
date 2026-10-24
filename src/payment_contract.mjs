// PPL-001: offline-only, pure domain guards. NOT a PayPal client or persistent ledger.
import { createHash } from 'node:crypto';

export class ContractError extends Error {
  constructor(code) { super(code); this.name = 'ContractError'; this.code = code; }
}

function failIf(condition, code) { if (condition) throw new ContractError(code); }

export function approvedAmount(quote) {
  failIf(!quote || typeof quote !== 'object', 'QUOTE_REQUIRED');
  failIf(!quote.id || !Number.isSafeInteger(quote.version) || quote.version < 1, 'INVALID_QUOTE');
  failIf(quote.currency !== 'USD', 'UNSUPPORTED_CURRENCY'); // Gate 1 synthetic USD only.
  failIf(!quote.approval || quote.approval.decision !== 'APPROVED' ||
    quote.approval.quoteVersion !== quote.version || !quote.approval.actorId,
  'HUMAN_APPROVAL_REQUIRED');
  const cents = quote.approval.amountMinor;
  failIf(!Number.isSafeInteger(cents) || cents < 100 || cents > 1000000,
    'INVALID_APPROVED_AMOUNT');
  return cents;
}

export function requestKey(quote, action) {
  approvedAmount(quote);
  failIf(!['create', 'capture'].includes(action), 'INVALID_ACTION');
  return `${action}-${createHash('sha256').update(`${quote.id}:${quote.version}:${action}`).digest('hex').slice(0, 32)}`;
}

export function planOrder(quote) {
  const cents = approvedAmount(quote);
  return {
    method: 'POST',
    path: '/v2/checkout/orders',
    requestId: requestKey(quote, 'create'),
    body: { intent: 'CAPTURE', purchase_units: [{ reference_id: quote.id,
      amount: { currency_code: 'USD', value: (cents / 100).toFixed(2) } }] }
  };
}

export function planCapture(quote, paypalOrder, priorAttempt = 'NOT_STARTED') {
  approvedAmount(quote);
  failIf(!paypalOrder || !paypalOrder.id, 'ORDER_REQUIRED');
  if (['IN_FLIGHT', 'UNKNOWN', 'SUCCEEDED'].includes(priorAttempt)) {
    return { action: 'RECONCILE_GET_FIRST', requestId: requestKey(quote, 'capture') };
  }
  failIf(priorAttempt !== 'NOT_STARTED', 'INVALID_ATTEMPT_STATE');
  failIf(paypalOrder.status !== 'APPROVED', 'PAYPAL_APPROVAL_REQUIRED');
  return { action: 'CAPTURE_ONCE', requestId: requestKey(quote, 'capture'),
    method: 'POST', path: `/v2/checkout/orders/${encodeURIComponent(paypalOrder.id)}/capture` };
}

export function reconcileCapture(quote, paypalOrder, paypalCapture) {
  const cents = approvedAmount(quote);
  failIf(!paypalOrder || !paypalOrder.id, 'ORDER_REQUIRED');
  if (!paypalCapture) return { status: 'UNKNOWN', reason: 'NO_CAPTURE_PROOF' };
  failIf(!paypalCapture.id || paypalCapture.orderId !== paypalOrder.id,
    'CAPTURE_ORDER_MISMATCH');
  failIf(paypalCapture.amount?.currency_code !== 'USD' ||
    paypalCapture.amount?.value !== (cents / 100).toFixed(2),
  'CAPTURE_AMOUNT_MISMATCH');
  if (paypalCapture.status === 'COMPLETED' && paypalOrder.status === 'COMPLETED') {
    return { status: 'PAID', captureId: paypalCapture.id };
  }
  if (paypalCapture.status === 'PENDING') return { status: 'PENDING' };
  if (['FAILED', 'DECLINED'].includes(paypalCapture.status)) return { status: 'FAILED' };
  return { status: 'UNKNOWN', reason: 'VERIFY_WITH_PAYPAL' };
}
