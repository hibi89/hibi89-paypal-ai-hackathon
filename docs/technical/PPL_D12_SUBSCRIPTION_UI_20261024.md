# PPL-D12 — Subscription Scenario UI, Failure / Cancel / Recovery (2026-10-24 KST)

## Decision
The approved project has three interfaces: quote+human approval, contract/milestone/reviewer, and subscriptions. D12 exposes all three on a **single loopback-only HTML demo**. Real PayPal Sandbox Business/Personal subscription entitlement and live provider API remain unverified (D03 access blocked). A product-like live subscription button was intentionally not built. Instead the demo explicitly labels synthetic scenario controls.

## Implemented
- `src/subscription_demo_store.mjs`: separate local SQLite scenario, owner/merchant bound state, version compare-and-set, immutable event log and unique eventId. Valid local transitions: NOT_STARTED→ACTIVE, ACTIVE→RECOVERY_REQUIRED, RECOVERY_REQUIRED→ACTIVE via **SYNTHETIC_GET_FIXTURE_ONLY_NOT_PAYPAL**, ACTIVE/RECOVERY_REQUIRED→CANCELLED. CANCELLED is terminal; no renewal/capture or money mutation.
- `src/subscription_demo_api.mjs`: Fetch-style handler with `offlineOnly:true` constructor, trusted fixed session, CSRF+origin checks, strict JSON request shape, size limit, owner/merchant isolation, read-only GET. It is not registered as production HTTP; `src/offline_demo_server.mjs` routes it only from 127.0.0.1 with Host guard.
- `web/subscription_client.js` + `web/offline_demo.html`: clearly marked subscription lifecycle / payment evidence, local explicit-button `start/fail/recover/cancel`, GET-only refresh and reload, no browser role selector. Reviewer test-cookie role cannot mutate owner subscription. `NOT_VERIFIED` payment evidence persists even after activation or recovery.
- Existing quote `POST /orders` stays fail-closed; requests without human quote approval fail earlier at 409, approved-but-unverified pay route stays 503. There is no actual PayPal plan/product/subscription/network request.

## Evidence
- Changes: `cff439aedce4bcf590a2c264bfd480fac47902ff` local scenario API/SQLite; `e48364122cb4dfc19e118ce8c77e91926614c6cb` HTML/JS/localhost integration; `e489b73760f00734790921b45d85988ca7814de6` negative and Chromium E2E.
- Test adjustment `80bb6c8442e02bde8247980537cc1efbc05e6698` — previous fixture expected provider 503 but unapproved quote correctly produced 409 and never sent money.
- [GitHub Actions 40077024670](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40077024670) **completed SUCCESS, Node 171/171, Chromium real loopback browser PASS**: refresh/F5 no POST, explicit scenario start/fail/recover/cancel, cancelled terminal, independent contract NOT_CAPTURED/subscription NOT_VERIFIED, forbidden extra PayPal API requests, forged role/CSRF/body rejected, SQLite persisted while server runs.
- This is not a successful real PayPal call, D1 migration, production authentication, external reviewer access, official submission or AI provider.
