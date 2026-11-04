# D15 follow-up — offline D1-compatible payment claim fence

**Status: Local SQLite simulation only. No real D1, no Cloudflare account, no PayPal, no public HTTP, and no AI invocation.**

## Scope
- `migrations/d1/0001_payment_claims.sql`: proposed D1 schema for quote approval snapshots and payment operation claims. Enforces primary key request ID, unique merchant/quote/version/operation, one remote ID, foreign keys, approved-quote amount constraints, and immutability once claimed.
- `src/d1_claim.mjs`: uses only the D1-shaped `prepare().bind().run()/first()` interface. Single `INSERT SELECT ... ON CONFLICT DO NOTHING` is the first-claim fence: verifies trusted actor and merchant, approved quote, exact version and currency, and previously approved order for capture. The first claim yields `FIRST_CLAIM_ONLY_NO_PROVIDER_CALL`; repeated claims yield `RECONCILE_GET_FIRST` rather than another provider POST.
- `tests/d1_claim.test.mjs`: Node `node:sqlite` shim executes SQL offline. Checks duplicate claims, two independent connections, foreign actor/merchant, stale version, changed request key, capture prerequisite, UNKNOWN after restart, invalid input, SQL constraints, migration re-apply, and invalid D1 result metadata.

## Critical safety boundaries
- An internal trusted caller must derive actor and merchant from authenticated server session, not a client-supplied request body/header.
- Request ID must be generated from a verified quote/payment operation contract. This low-level function does not provide an HTTP route and contains no provider POST, token, real approval, or real capture.
- A synthetic `UPDATE state='APPROVED'` in one test is **not** real verified PayPal GET. Actual order-verification/reconciliation and authorized transition logic still require implementation and provider evidence.
- Do not import `node:sqlite` into Cloudflare Workers; D1 migrations run only after owner approval, backups, tenant security review, limits, auth and staging checks.
- `D1Result.meta.changes` was reviewed against the official D1 docs; a Node SQLite shim does not establish D1 service behavior, edge concurrency or production persistence.

## Deployment decision remains unchanged
Option A: local reviewer reproducibility (0 additional cost but not actual external integration); Option B: Workers+D1 free deployment with independent account validation, full authentication, data migration, rollback and provider integration. Preserve A while preparing B, never present A as actual PayPal or AI.

## Evidence and follow-up
GitHub Actions Node and Chromium outcomes must be cited by commit and run before recording verification. D15 **20%**: the fixed acceptance weight for requirements/design is verified; the **40% full implementation**, **30% production automated tests**, and **10% production handoff** remain PENDING. Real D03 Sandbox, real D04 AI, Cloudflare Free account and public URL remain blocked.

Official references:
- https://developers.cloudflare.com/d1/worker-api/prepared-statements/
- https://developers.cloudflare.com/d1/worker-api/d1-database/
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/
