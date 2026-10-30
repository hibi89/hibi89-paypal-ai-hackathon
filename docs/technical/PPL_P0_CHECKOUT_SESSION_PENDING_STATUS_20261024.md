# P0 Checkout Status and HTTPS Callback Readiness — 2026-10-24

## Finding
PayPal's public Orders v2 guide shows `PAYER_ACTION_REQUIRED` as an order status that requires buyer action, not payment confirmation. The old transport, SQLite, and D1 GET verification omitted it and could reject legitimate pending orders.

References:
- https://developer.paypal.com/whats-an-order/
- https://developer.paypal.com/sdk/orders/v2/definitions/order_request

## Implemented
- Sandbox transport accepts the pending status on initial order create and GET, but capture still requires actual APPROVED.
- SQLite records a pending order ID in UNKNOWN state, not APPROVED or PAID.
- D1 GET reconciliation returns BUYER_APPROVAL_PENDING_NO_POST, without writing approval.
- A pure future callback planner validates configured HTTPS public origin plus trusted server session bound to the owner, merchant, and approved quote. It returns fixed same-origin return/cancel paths with user_action CONTINUE. It is NOT wired to the checkout POST or hosted deployment.
- Tests cover status handling, restarts, callback URL inputs and missing session binding. No external service calls.

## Verified test evidence
Feature SHA dbb60eb90e5b32a0e38c0c7a293dbb2f9a0602ff.
https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40104173572
Result SUCCESS: 323/323 Node tests, Chromium localhost E2E PASS, 18-day progress PASS.

## Remaining external blockers
D03 0% BLOCKED: real Sandbox Business/Personal accounts and authorized requests remain unverified.
D04 80% PARTIAL: free AI access and real generated draft remain unverified.
D15 20% PARTIAL: production HTTPS origin, server authentication, durable checkout-session association and real callback wiring are absent. Remaining plan base 5h / safety 10h, not measured.
D16–D18 0%: operational, video and submission evidence outstanding.
Browser return/cancel values are never approval or paid-state proof. Real completion needs trusted backend GET after independent authorization.
