# P0 — Owner Sandbox Pilot Order transport bridge (2026-10-25)

## Scope
Safe forward-development only. The owner has **already verified** a single real PayPal Sandbox OAuth HTTP 200 and Gemini synthetic generation HTTP 200 on the owner's Windows machine, but **has NOT authorized** an actual PayPal Orders CREATE, buyer transaction or Capture in this turn. No real provider HTTP is performed in this work.

PayPal's Orders v2 reference documents `payment_source.paypal.experience_context` with `return_url`/`cancel_url` on CREATE and a `payer-action`/approval link followed by server-side confirmation. [Official order guide](https://developer.paypal.com/whats-an-order/) · [Orders v2 create](https://developer.paypal.com/sdk/orders/v2/orders-create/) · [request schema](https://developer.paypal.com/sdk/orders/v2/definitions/order_request).

## New connection, explicitly internal only
- `src/paypal_sandbox_transport.mjs` now exposes `createOwnerPilotOrderOnce(quote,claim,{publicOrigin,serverSession})` in addition to the unchanged `createOrderOnce`. It requires the same durable first claim **before** any outbound OAuth or POST, regenerates the JSON payload internally from trusted quote/context via `planOwnerSandboxPilotCheckout`, and **does not** accept arbitrary JSON, URL or environment override.
- Shared `createFromPlan` is private to the transport module. The pilot sends capped virtual $1.00–$2.00 USD CREATE with merchant, version, approved amount and two canonical HTTPS return/cancel callback URLs inside `payment_source.paypal.experience_context`; then validates PayPal's original order ID, strict Sandbox payer-action URL and an authenticated order GET before exposing the buyer link.
- Existing `createOrderOnce` semantics are preserved for already-tested internal orchestration. No public route, owner CLI, Cloudflare deployment, browser action, or payment auto-capture is added.
- If the one POST returns HTTP 503/invalid JSON/throws/timeouts, the result stays `SANDBOX_POST_OUTCOME_UNKNOWN`; it is **never retried automatically**. Capturing remains an independent, separately authorized operation requiring a verified APPROVED GET, persistent capture claim, and later completed-capture GET proof.
- Newly added six offline regression tests in `tests/sandbox_pilot_transport.test.mjs` inject a **synthetic fetch only** and check exact outbound POST JSON, 38-byte idempotency header, one GET, seller mismatch, pre-network owner/session/origin/amount rejection and no post retry.

## External safeguards and unresolved steps
1. No live PayPal, public server, real merchant/account/keys, card, order, capture or additional Gemini request was used. The only successful *real* API evidence is the previous owner one-shot.
2. A value `serverSession.verified === true` is a trusted-server contract, **not** a cryptographic session validator. Before actual user checkout, deploy/configure a verified server-side identity + durable checkout-session lookup and an actually reachable HTTPS callback; do not trust user-supplied JSON, `Host` or `X-Forwarded-Host`.
3. Confirm the Sandbox Business merchant's real 13-character ID and corresponding REST app access **privately**. The 13-character validation is syntax only, not account ownership verification.
4. This module can be invoked by a future trusted, permissioned backend with injected Sandbox credentials; **merely exporting it grants no owner authorization** and it must never be mounted on current localhost synthetic demo as a public payment route.
5. D03 **65% PARTIAL** pending actual order/buyer/GET/capture (35%). D04 **80% PARTIAL** pending real AI quote/UI integration. D15 **20% PARTIAL** pending hosting/session. 18 days DONE12/PARTIAL3/BLOCKED0/NOT_STARTED3. No percentage increase or inferred actual work hours from offline code.

## Next READY
Secure verified server identity and callback deployment choice without cost or public payment route. Before *any* real CREATE or CAPTURE call, obtain a **new, narrowly scoped owner approval** (previous one-shot provider approvals do not cover payments). Use strict Sandbox-only, separate Personal buyer, small test amount, one-use durable claims and no ambiguous POST retries. Never publish app secrets or account ID in docs/chat.
