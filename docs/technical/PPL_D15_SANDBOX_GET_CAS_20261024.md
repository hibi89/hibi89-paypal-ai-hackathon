# PPL-D15 — Sandbox GET proof and D1 CAS state transition (2026-10-24)

## Executive status
**Offline mock-transport/SQLite shim only; NOT a live PayPal Sandbox or Cloudflare D1 validation.**
Baseline `lead/paypal` before this work: `260ae7fbdd845419ebb626f6ae8eee60a688bf31`. No external accounts created, customer records used, credentials touched, public hosting started or payment POST executed.

## Delivered
- `src/d1_sandbox_get_reconcile.mjs`: private `createD1SandboxGetReconciler({db,resolveSession,transport})` interface. Requires **verified server session** and a backend-injected `SANDBOX_ONLY` transport with `getOrder`/`getCaptureProof`; rejects LIVE mode or missing transport.
- `refreshOrder`: requires approved quote bound to merchant + authenticated owner, and a **previously stored remote order ID**. Never accepts an order ID merely from the browser. On missing remote ID returns `REMOTE_ORDER_ID_UNKNOWN_NO_RETRY` without HTTP GET or POST. Checks PayPal order ID, `intent=CAPTURE`, one purchase unit, reference ID, mandatory payee merchant ID, USD currency and exact approved amount. CREATED does not mean buyer approval; COMPLETED delegates to capture reconciliation. Only status APPROVED can trigger an atomic, authorization-scoped SQLite/D1-shaped CAS from IN_FLIGHT/UNKNOWN to APPROVED.
- `reconcileCapture`: requires a durable create attempt already APPROVED, a committed capture attempt, and a matching remote order ID. Inspects a backend-injected GET proof, requiring one COMPLETED capture in the COMPLETED order and matching capture ID, order ID, merchant, currency and amount. A guarded `UPDATE` sets state PAID once. A repeated PAID read refuses another transition or payment POST. No price, recipient or merchant may change after approval.
- Failed provider GET returns a sanitized error; malformed API proof never persists a PAID state. Both methods use **zero payment POSTs**. The result always reports `realProviderAccessTested:false` and `paymentPostAttempted:false` because this iteration never invoked real PayPal.
- `tests/d1_sandbox_get_reconcile.test.mjs`: 15 independent offline mock/provider-boundary tests. Covers missing/unsafe transport, forged login, cross-tenant access, missing order ID, valid approval, CREATED/COMPLETED distinctions, wrong reference/merchant/currency/amount/intent/order ID/extra units, provider failure, repeat GET, capture prerequisites, pending capture, valid PAID once, malformed capture and remote capture ID mismatch, stale quote.

## Evidence
- [CI run #40083028520](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40083028520) @ `c9464a671bc0b20fe434b2af189d3fa19258eb02`: **Node 219/219 PASS**, **local Chromium E2E PASS**, 18-day progress `--check` PASS.
- Compared with previous CI Node 204/204, exactly 15 new tests. This is a local Node SQLite shim and synthetic transport; no evidence of remote PayPal GET, OAuth, real merchant authentication, Cloudflare D1 sessions or public production browser.
- The original localhost demo (`src/offline_demo_server.mjs`) remains unchanged, and its payment route still fails closed at 503.

## Boundaries, assumptions and remaining work
1. Actual transport provenance: the injected interface's `mode='SANDBOX_ONLY'` is a **contract**, not an authenticity certificate. Before deployment instantiate the server-side `createSandboxTransport` implementation with private Sandbox credentials via approved configuration, and connect it only to trusted backend routes after independent authentication. No caller-controlled transport, quote or claimed `verified` flag.
2. D1 real atomicity: local SQLite lock and `meta.changes` simulation are not real D1. Verify D1 batch/Session consistency, concurrency, foreign key settings and rollback in staging before relying on production data.
3. Recovering POST without a saved order ID: an ambiguous create POST remains occupied and requires safe manual review / externally trusted lookup; do not invent an order ID or blind retry.
4. Quote approval, session-bound actor/merchant, CSRF protection, free-tier quotas, signing/merchant acceptance, capture idempotency, webhook authenticity and durable restart must be verified in a real hosted environment.
5. PayPal GET field validation includes strict payee merchant binding; missing `payee.merchant_id` is **not** considered proof. Test API payload variations only after authorized Sandbox access; do not weaken fields merely to make fixtures pass.
6. All current GET proof responses are simulated. `ORDER_APPROVED_BY_GET_CONTRACT` and `CAPTURE_COMPLETED_BY_GET_CONTRACT` indicate **local contract validation only**, NOT real capture or award submission evidence.
7. Actual user approval remains required for any Cloudflare account/configuration, remote DB migration, public URL, API secrets, sandbox authentication/requests, Live, money or paid services. No key should be pasted into chat.

## Progress and next READY unit
D15 remains **20% PARTIAL**, because only its requirements/design checkpoint is verified. Production/hosting implementation (40%), live automated verification (30%) and production handoff (10%) remain pending. D15 base estimated remaining 5h, safe planning buffer inclusive 10h; actual elapsed NOT_MEASURED, external waiting unknown. Overall DONE12 / PARTIAL2 / BLOCKED1 / NOT_STARTED3.

Next: bind verified server session and authenticated PayPal transport in an **offline-only composition harness** before any external account setup. Keep D03 Sandbox Business/Personal and D04 actual free AI as critical separate blockers; Cloudflare deploy should not eclipse the official contest's real PayPal + AI integration gate.

Related official documentation:
- https://developer.paypal.com/docs/api/orders/v2/#orders_get
- https://developers.cloudflare.com/d1/worker-api/prepared-statements/
- https://developers.cloudflare.com/d1/worker-api/d1-database/
