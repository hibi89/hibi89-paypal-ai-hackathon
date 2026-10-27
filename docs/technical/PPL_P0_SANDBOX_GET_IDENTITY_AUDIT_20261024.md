# P0 Sandbox GET identity and intent trust-boundary audit (2026-10-24 KST)

## Finding
Previously `verifiedOrder` allowed an absent `intent` (only rejected a present non-CAPTURE value) and only compared the seller payee when `quote.merchantId` was truthy. In the standalone Sandbox transport, missing merchant metadata or an unbound first-claim proof could allow insufficiently attributed synthetic GET to pass the transport check. D1 reconciliation had stricter merchant/intent checks, but it is unsafe to rely on downstream code to repair an inconsistent upstream payment transport.

Official reference: [Orders v2 order schema](https://developer.paypal.com/sdk/orders/v2/definitions/order/) permits an optional `intent` in its general response shape; [order details example](https://developer.paypal.com/whats-an-order/) shows a concrete intent value. **This code intentionally fails closed** if live GET omits intent/payee; real Sandbox compatibility must be checked later before relaxing verification. PayPal request-schema fields are not proof of received API response shape.

## Alternatives
A. Validate fields only in downstream D1 reconciler: leaves standalone `captureOnce` and create/GET transport permissive. Rejected.
B. Validate the trusted quote merchant and durable claim merchant **before outbound token/POST**, and require exact CAPTURE + payee merchant on every authenticated GET; keep existing D1 checks as defense in depth. Selected.
C. Add a separate global payments state machine/rewrite: high risk and unnecessary without real provider credentials. Deferred.

## Implementation
- Merchant ID must be a non-empty quote-bound ID, `claim.attempt.merchantId === quote.merchantId` on create/capture. Refuse before any OAuth or payment POST if not. Direct `getOrder` likewise refuses unbound merchant before token acquisition.
- GET requires `intent === 'CAPTURE'`, exactly one purchase unit, matching `reference_id`, merchant payee, USD amount, ID and expected order state. Previously omission of intent or merchant binding slipped through.
- After create POST, a checked GET already marked COMPLETED is not returned to the client as an approval URL with `NOT_PAID`; fails closed for operator reconciliation.
- `getCaptureProof` refuses non-COMPLETED nested capture for a COMPLETED order.
- Six new fixture-only regression tests include denial before OAuth/POST, forged seller claim, missing intent/payee, status conflict, nested pending capture, and positive accepted GET. No network and no real payment.

## Limits / verification
- Current tests are **synthetic**, not PayPal certification, and exact GET response field presence from this owner's actual Sandbox account is still **NOT_TESTED**.
- Existing SQLite ledger keys (including 38-byte outbound ID conversion), human approval, no blind retry after UNKNOWN, and D1 DB mutations remain unchanged.
- Real Sandbox Business + Personal buyer account, actual OAuth + Orders + GET + Capture, real free AI, safe public route, video and final Devpost submit remain BLOCKED/NOT_TESTED.
- Progress unchanged: D03 0% BLOCKED; D04 80% PARTIAL; D15 20% PARTIAL (base 5h/safe 10h, actual elapsed null); D16–18 0% NOT_STARTED.
- Verified source SHA `622669985c89e9179ab3e19568639769d31d0289`, [GitHub Actions #40096062080](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40096062080): Node 287/287 PASS, Chromium localhost E2E PASS, 18-day progress PASS. Docs-only synchronization has a separate CI.
