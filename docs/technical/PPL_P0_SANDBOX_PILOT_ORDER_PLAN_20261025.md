# P0 — Sandbox-only owner-pilot checkout request planning (2026-10-25)

## Reason and official API contract
Owner's first genuine Sandbox OAuth and Gemini one-shot both returned HTTP 200. The remaining D03 35% requires a **separately authorized** buyer-approved PayPal Orders create/GET/capture transaction. The existing `planOrder` enforced seller, quote and amount but omitted the buyer experience callbacks needed for this approval flow.

PayPal Orders v2 documents `payment_source.paypal.experience_context.return_url` and `cancel_url` for buyer approval. The return page is not proof of payment or permission to capture. See [PayPal integration](https://developer.paypal.com/whats-an-order/) and [Orders request schema](https://developer.paypal.com/sdk/orders/v2/definitions/order_request).

## Implemented offline-only contract
- `src/sandbox_pilot_checkout_plan.mjs` exports `planOwnerSandboxPilotCheckout({quote,publicOrigin,serverSession})`. It combines the existing deterministic `planOrder` with the already-tested `planBuyerCheckoutCallbacks` contract. It returns **a JSON request plan** but never constructs a network transport or performs a provider call.
- Requires immutable human-approved `quote.status === 'APPROVED'`, matching approval version, USD approved amount `$1.00–$2.00`, 13-character alphanumeric sandbox merchant ID and a **server-verified** checkout session bound to owner and merchant. A quote with a fixture merchant, untrusted localhost callback, forged session or over-cap test amount fails before building a request.
- Includes `payment_source.paypal.experience_context` with HTTPS `return_url`, `cancel_url`, `user_action:'CONTINUE'`. It never embeds the checkout session ID, account email, API key, OAuth access token, browser token or secret in the request body.
- `networkAllowed:false`, `requiresSeparateOwnerExecutionApproval:true`, `requiresDurableFirstClaim:true`, `buyerReturnIsProof:false`. The output is **not wired** to the real Sandbox transport, public HTTP server or production worker. No capture/POST authorization exists.
- Unit tests verify the exact PayPal schema field path, seller ID and amount, callback safety, owner mismatch, stale quote, $2 cap and no secret/call path.

## Critical unresolved external gates
1. Owner must *privately* verify the actual 13-character Sandbox Business merchant ID and that it belongs to the OAuth app. OAuth 200 did NOT prove merchant binding.
2. A trusted HTTPS origin with server-side authenticated checkout-session storage/lookup is absent. An HTTPS-looking string alone is **not** proof of a deployed, reachable service; do not invent a callback URL.
3. The full remote Orders CREATE, separate Personal buyer approval, secure GET reconciliation, one authorized capture POST and COMPLETED GET proof are **NOT_TESTED**. No Live API, paid AI, real card, bank data, publishing or deployment authorized.
4. Owner's one-shot OAuth/Gemini markers are consumed; do not delete markers or repeat the probes.
5. New code remains an offline preparation step. The D03 checkout criterion remains **BLOCKED** and D03 65% PARTIAL; D04 80% PARTIAL, D15 20% PARTIAL unchanged. Actual work time remains unmeasured.

**Next:** user-authorized trusted callback/merchant session readiness, then a distinct minimal Sandbox order execution tool with durable one-use claim and proof-only receipts. Never attach an untrusted browser parameter to capture and never retry ambiguous POST.
