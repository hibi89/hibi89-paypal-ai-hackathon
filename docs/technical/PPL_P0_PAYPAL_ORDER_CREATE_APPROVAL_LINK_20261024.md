# PayPal P0 Orders v2 create and HATEOAS link contract audit (2026-10-24 KST)

## Findings against official PayPal documentation
- [Purchase Unit reference](https://developer.paypal.com/api/orders/v2/definitions/purchase_unit): one purchase unit may explicitly declare `payee.merchant_id`. The current quote-bound merchant was checked against GET results but **not sent in CREATE**. This could cause ambiguity when resolving the seller, especially if the OAuth app and quote merchant are mismatched.
- [PayPal Orders integration](https://developer.paypal.com/whats-an-order/): the returned `payer-action` link sends the buyer to an approval URL. Previously the code required only a trusted Sandbox domain and HTTPS but did **not** require the query token to match the newly created order ID.
- The PayPal documented merchant account identifier is **13 characters with restricted alphabet** (the fixture identifier `sandbox_merchant` is synthetic, not a real merchant and cannot be used for provider testing). Real owner account linkage is still untested.

## Applied code changes
1. `src/payment_contract.mjs:planOrder` now requires an explicit syntactically safe quote merchant ID and emits `purchase_units[0].payee.merchant_id`, maintaining the exact single quote reference, human-approved USD amount, CAPTURE intent and deterministic persisted request key. The upstream Sandbox transport and GET verifier already require identical seller ID; no unbound merchant can enter the payload.
2. `src/paypal_sandbox_transport.mjs:approvalLink` now restricts HTTPS to known sandbox hosts, exact checkout path, single `token` query parameter **equal to the response order ID**, and no fragment, unexpected port or authentication in URL.
3. New tests cover happy path merchant in POST body; malformed/missing merchant rejection; malicious other/missing/multiple order tokens, wrong checkout path and fragment; harmless additional `useraction` parameter; no new provider retries.
4. No change to buyer-approval business logic, GET-only refresh, idempotency or paid-state proof. Strict GET still requires matching actual PayPal `intent:CAPTURE`, `payee.merchant_id`, approved amount, order status.

## Intentional remaining external P0 block
- PayPal's [checkout flow](https://developer.paypal.com/whats-an-order/) documents buyer return/cancel URLs under `payment_source.paypal.experience_context`. This repository intentionally **has no verified public HTTPS callback or authenticated buyer-return endpoint**, and we must not invent one or falsely claim a working buyer approval redirect. A later separately authorized integration must configure those URLs and reconcile approved order exclusively via backend GET, never trust browser redirect parameters.
- Official `merchant_id` values must come from a verified Sandbox **Business** account. Current synthetic identifiers are only suitable for CI fixtures. The owner's actual 13-character merchant identifier, REST application linkage, and separate Personal buyer account are NOT VERIFIED.
- PayPal may return another intermediate order status for an alternate `payment_source` flow; current implementation is intentionally narrow and fail-closed; actual compatibility cannot be asserted without sandbox evidence. No Live/payments/AI/provider HTTP calls were performed.
- D03 0% BLOCKED, D04 80% PARTIAL, D15 20% PARTIAL (base 5h / safe 10h / measured null), D16–D18 0%. Source SHA `f588f160134c7e97ae993179973614bef914d75b`: [GitHub Actions #40102281851](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40102281851) **SUCCESS** — 309/309 Node tests, actual Chromium localhost E2E PASS, and 18-day progress validation PASS. This is **synthetic fixture-only** and provides no real Sandbox merchant/approval/capture evidence.

## Next owner-only steps
1. Independently inspect PayPal Developer dashboard: Sandbox REST app linked Business merchant and separate Personal sandbox buyer. Keep keys, passwords and IDs out of GitHub and chat.
2. Confirm approved HTTPS buyer-return / cancel callback design and trusted server identity verification, before any authorized order creation. Prefer existing secured app when available; never expose the offline loopback server.
3. Separately check Gemini project's eligible Free Tier and model, and explicitly authorize narrowly scoped real OAuth/test order and one Free-tier AI text request before provider execution. Record sanitized proof only; no synthetic CI result can advance D03.
