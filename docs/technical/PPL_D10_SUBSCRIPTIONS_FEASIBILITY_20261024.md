# PPL-D10 PayPal Subscriptions / Webhooks official feasibility research (2026-10-24 KST)

> **SCOPE = verified public documentation + local pure state contract only. NO authenticated PayPal account / OAuth / Sandbox calls / production webhook / real charges.**

## Sources — official, checked 2026-10-24
1. [Subscriptions REST v1](https://developer.paypal.com/api/subscriptions/v1) — plans `POST /v1/billing/plans`, subscriptions `POST /v1/billing/subscriptions`, `GET /v1/billing/subscriptions/{id}`, suspension/cancellation/reactivation POST routes. Presence of documentation does not establish this merchant's account entitlement.
2. [Subscription entity states](https://developer.paypal.com/api/subscriptions/v1/definitions/subscription/) — `APPROVAL_PENDING`, `APPROVED`, `ACTIVE`, `SUSPENDED`, `CANCELLED`, `EXPIRED`. Local `UNKNOWN` is only our internal state, not an official provider state.
3. [PayPal Subscriptions Webhooks](https://developer.paypal.com/subscriptions/webhooks/) — lifecycle events `BILLING.SUBSCRIPTION.CREATED/ACTIVATED/SUSPENDED/CANCELLED/EXPIRED/UPDATED/PAYMENT.FAILED`; separate `PAYMENT.SALE.COMPLETED/REFUNDED/REVERSED`. A subscription activation notice is **not proof of a captured payment**.
4. [REST Webhooks Integration](https://developer.paypal.com/api/rest/webhooks/rest/) (updated June 18, 2026) — listener must have HTTPS:443, verify webhook authenticity. Self verification uses original raw JSON body CRC32 **decimal** with `transmissionId|timestamp|webhookId|crc32` and PayPal RSA certificate. Alternative endpoint `POST /v1/notifications/verify-webhook-signature`; simulator mock events have special `WEBHOOK_ID` and do not support postback signature verification. Missing 2xx causes retry (up to 25 times over 3 days). **Never accept an unsigned event as trusted.**
5. [REST Webhooks overview](https://developer.paypal.com/api/rest/webhooks) — duplicate/retries expected; webhook ID from registered app differs from client ID. Reorder and duplicate resilient DB processing required, not accomplished by public source review.
6. [PayPal Sandbox test overview](https://developer.paypal.com/sandbox-testing/overview/) and [Sandbox accounts](https://developer.paypal.com/sandbox-testing/accounts) — Sandbox transactions are synthetic and use Business merchant/Personal buyer; cannot be described as live charges or real money.
7. [REST country codes](https://developer.paypal.com/reference/country-codes) — South Korea `KR` listed among REST-supported countries **generally**, but **not an eligibility matrix for Subscriptions for this specific seller account**.
8. [Korean PayPal fees](https://www.paypal.com/kr/cshelp/article/what-are-the-fees-for-paypal-accounts--help383?locale.x=en_KR) — PayPal account creation fee is zero; live payments/currency conversion/cross-border transaction can have fees. Sandbox-only costs no real transactions; do not call real API without authorization.
9. [Subscriptions test / go-live guide](https://developer.paypal.com/subscriptions/test-go-live) (updated October 14, 2026) — access token required before API testing.

## Definitive ability assessment
| Question | Observed | Status |
|---|---|---|
| Subscription products/plans + recurring API exist | Official documented endpoints | DOCUMENTED |
| Lifecycle status/event names exist | Current official state and webhook docs | DOCUMENTED |
| Raw-body signature / verify signature API available | Official Webhooks integration docs | DOCUMENTED |
| Test purchases can avoid live financial transactions | Sandbox docs explicitly describe mock purchases | DOCUMENTED |
| Country code KR accepted generally by REST | Official country codes list | DOCUMENTED_GENERAL_ONLY |
| This particular KR merchant eligible for subscriptions | No account login/entitlement or successful create+GET | **NOT_TESTED** |
| Sandbox product/plan/subscription for real developer account | No credentials/calls | **BLOCKED_BY_ACCESS** |
| Personal sandbox buyer checkout/approval | No buyer account session | **BLOCKED_BY_ACCESS** |
| Webhook delivery/verification with actual app Webhook ID | No HTTPS public listener/real sandbox event | **NOT_TESTED** |
| D1 / production persistence / public session | No deployment | **NOT_TESTED** |
| Actual developer work effort | No wall-clock measurements | **NOT_MEASURED** |

## D10 implementation decision
- Compare **(A) real webhook endpoint/signature verification implementation without credentials** vs **(B) pure lifecycle transition planner + negative/replay tests**. Use **B** for D10: A would claim security properties without real provider certificates, webhook ID, registered listener or controlled raw body. D11 will handle actual receiver, verified signature, DB deduplication, and out-of-order GET reconciliation.
- `src/subscription_contract.mjs` receives only internally trusted, already verified event observations; `trusted=true` is a *test and integration-boundary parameter*, **not a production signature verifier**. Never map an HTTP body/header value to it. No HTTP route wired. A D11 production receiver must prove signature first and persist unique `event.id` transactionally before acknowledging.
- `BILLING.SUBSCRIPTION.UPDATED`, payment failure and `PAYMENT.SALE.*` request provider **GET-first reconciliation** rather than deriving subscription payment success. Older and same-time events, illegal terminal transitions, mismatched IDs also require provider GET.
- Keep quote and contract `NOT_CAPTURED` separate. A webhook alone cannot initiate any local capture, order or subscription POST, and never bypasses existing HTTP 503 payment guard.
- Memory-only event ID array is explicitly bounded to 200 and is **not durable**; D11 must use SQLite UNIQUE and atomic transaction across processes/restarts before handling real events.

## D11 follow-up / acceptance gates
- Build verified server-side Webhook ingress under verified app webhook ID, enforce HTTPS/size/Content-Type; implement actual cryptographic signature verification against configured trusted PayPal certificate (cert URL validation, no SSRF) or actual verified PayPal postback, with real Sandbox evidence separated from mocked cryptography.
- Persist idempotency by `event.id` and `transmission_id`, merchant/subscription binding, out-of-order unknown GET-first and audit; no payment POST on delivery. Replayed webhooks must never write twice.
- Official documents conflict in some product-specific guides about raw-body hash algorithms; for REST webhook listener the product-matched [REST integration documentation](https://developer.paypal.com/api/rest/webhooks/rest/) specifies CRC32 decimal. Reconfirm exact provider event type/verification flow during actual implementation rather than mixing instructions from other PayPal product lines.
