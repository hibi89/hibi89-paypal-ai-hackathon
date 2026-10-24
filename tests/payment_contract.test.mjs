import test from 'node:test';
import assert from 'node:assert/strict';
import { approvedAmount, requestKey, planOrder, planCapture, reconcileCapture } from '../src/payment_contract.mjs';

const q = () => ({ id: 'quote-demo-1', version: 2, currency: 'USD',
  aiSuggestedMinor: 9900, approval: { decision: 'APPROVED', quoteVersion: 2,
    actorId: 'test-reviewer', amountMinor: 1500 } });
const order = (status = 'APPROVED') => ({ id: 'ORDERDEMO1', status });
const capture = (status = 'COMPLETED') => ({ id: 'CAPTUREDEMO1', orderId: 'ORDERDEMO1',
  status, amount: { currency_code: 'USD', value: '15.00' } });

test('human approval locks a 15.00 USD amount instead of 99.00 AI proposal', () => {
  assert.equal(approvedAmount(q()), 1500);
  assert.equal(planOrder(q()).body.purchase_units[0].amount.value, '15.00');
});
test('never create order without human approval', () => {
  assert.throws(() => planOrder({ ...q(), approval: null }), { code: 'HUMAN_APPROVAL_REQUIRED' });
});
test('quote version change invalidates stale approval', () => {
  assert.throws(() => planOrder({ ...q(), version: 3 }), { code: 'HUMAN_APPROVAL_REQUIRED' });
});
test('reject unsupported currency and malformed cents', () => {
  assert.throws(() => planOrder({ ...q(), currency: 'KRW' }), { code: 'UNSUPPORTED_CURRENCY' });
  assert.throws(() => planOrder({ ...q(), approval: { ...q().approval, amountMinor: 1.5 } }), { code: 'INVALID_APPROVED_AMOUNT' });
});
test('idempotency key is stable on refresh and different per action/version', () => {
  assert.equal(requestKey(q(), 'create'), requestKey(q(), 'create'));
  assert.notEqual(requestKey(q(), 'create'), requestKey(q(), 'capture'));
  assert.notEqual(requestKey(q(), 'create'), requestKey({ ...q(), version: 3, approval: { ...q().approval, quoteVersion: 3 } }, 'create'));
});
test('capture requires payer APPROVED, not CREATED/cancel return', () => {
  assert.throws(() => planCapture(q(), order('CREATED')), { code: 'PAYPAL_APPROVAL_REQUIRED' });
  assert.throws(() => planCapture(q(), order('VOIDED')), { code: 'PAYPAL_APPROVAL_REQUIRED' });
});
test('first capture allowed with stable action ID', () => {
  assert.equal(planCapture(q(), order()).action, 'CAPTURE_ONCE');
  assert.equal(planCapture(q(), order()).requestId, requestKey(q(), 'capture'));
});
test('network ambiguity and repeated clicks require GET reconciliation before retry', () => {
  for (const state of ['UNKNOWN', 'IN_FLIGHT', 'SUCCEEDED'])
    assert.equal(planCapture(q(), order(), state).action, 'RECONCILE_GET_FIRST');
});
test('only matching PayPal order + completed capture is paid', () => {
  assert.deepEqual(reconcileCapture(q(), order('COMPLETED'), capture()), { status: 'PAID', captureId: 'CAPTUREDEMO1' });
  assert.equal(reconcileCapture(q(), order(), capture()).status, 'UNKNOWN');
});
test('pending, failed and missing payment proof cannot be paid', () => {
  assert.equal(reconcileCapture(q(), order('COMPLETED'), capture('PENDING')).status, 'PENDING');
  assert.equal(reconcileCapture(q(), order('COMPLETED'), capture('FAILED')).status, 'FAILED');
  assert.equal(reconcileCapture(q(), order('COMPLETED'), null).status, 'UNKNOWN');
});
test('tampered capture order and amount fail closed', () => {
  assert.throws(() => reconcileCapture(q(), order('COMPLETED'), { ...capture(), orderId: 'WRONG' }), { code: 'CAPTURE_ORDER_MISMATCH' });
  assert.throws(() => reconcileCapture(q(), order('COMPLETED'), { ...capture(), amount: { currency_code: 'USD', value: '99.00' } }), { code: 'CAPTURE_AMOUNT_MISMATCH' });
});
