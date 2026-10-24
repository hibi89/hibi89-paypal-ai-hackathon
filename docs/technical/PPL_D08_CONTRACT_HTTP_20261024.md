# PayPal PPL-D08 — Offline contract/delivery HTTP API implementation (2026-10-24 KST)

## Decision
- Compared embedding D08 routes into `src/quote_api.mjs` vs. a dedicated `src/contract_api.mjs` and reusing the existing bounded JSON + no-store reply helpers. Separate handler chosen to preserve quote approval, PayPal 503 safe gate and SQLite payment flow with minimal regression risk.
- API is explicitly local, server-resolver injected, synthetic/Node SQLite only. No public identity provider, PayPal OAuth or production deployment is present.

## Routes
- `POST /api/contracts` — approved quote + expectedVersion, 1..30 milestone sum, reviewerId, stable eventId → 201, all within local SQL transaction.
- `GET /api/contracts/:contractId` — authorization-bound read-only status including `paymentState` separate from milestone states.
- `GET /api/contracts/:contractId/events` — immutable event history read-only, source IP/role not trusted.
- `POST /api/contracts/:contractId/milestones/:id/submit` — owner-submitted delivery evidence, expectedState+CAS version+eventId.
- `POST .../:id/accept` or `reject` — assigned reviewer only, verified backend actor/merchant and CAS; reject requires reason.
- Unsupported methods 405; foreign contract/merchant/owner 404; role mismatch 403; stale or replay 409. JSON max 4096 bytes; response no-store; CSRF + Origin when supplied. Browser/request-controlled actorId, merchantId, role fields rejected.
- Existing POST `/api/quotes/:id/orders` continues 503. No real payment POST introduced.

## Evidence / CI
- First code SHA `ecd172e64532f41e703484e832113aff47aa64a1`: Actions [40070147386](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40070147386) **130 PASS / 1 FAIL**, mistaken 404 expectation for assigned reviewer self-ownership where domain rejects identity with 400.
- Correction SHA `17b804eb93d2d36f94a2813b6c002769fdd5b9c2`: Actions [40070199115](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40070199115) **Node 131/131 PASS, fail 0, local actual Chromium existing quote E2E PASS**.
- Tests include 10 new cases in `tests/contract_api.test.mjs`: quote+contract creation/GET, submit/accept/reject, wrong actor/merchant, CSRF/Origin/bad JSON, stale idempotent replay, local HTTP with real Node loopback, PayPal 503.
- No real PayPal Sandbox credentials or AI external provider call. No actual production reviewer login. Contract endpoints were exercised via Node unit/HTTP integration; browser Chromium E2E covers old quote UI only.

## Next / limitations
- D09 local UI and browser E2E for contract/delivery; tester-owned buyer/reviewer identity must be server-sourced. Do not turn local synthetic reviewer selector into production role escalation.
- D03 0% actual provider, D04 80% mock-only, D1/production/Devpost unverified. Actual elapsed time NOT_MEASURED, no paid API.
