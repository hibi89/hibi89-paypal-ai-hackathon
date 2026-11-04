# PPL-002 Day2 — SQLite durable transaction ledger (offline only)

**Date:** 2026-10-24 KST (10/26 scheduled day done early). **Result:** DAY2_SQLITE_OFFLINE_ACCEPTED.

## What was implemented
- src/sqlite_ledger.mjs: Node 22 node:sqlite DatabaseSync with required disk filename (memory-only intentionally rejected), WAL, busy_timeout, foreign keys, schema and unique indexes.
- quotes: owner_id/merchant_id/version/approved snapshot; proposal → approval compare-and-set within BEGIN IMMEDIATE/COMMIT, owner and version enforced. Replayed or stale approval returns conflict; approved amount cannot be overwritten.
- payment_attempts: stable PayPal-Request-Id from pre-existing payment_contract.requestKey, DB unique (merchant,quote,version,operation), request ID primary key, remote ID unique. Distinct create and capture operations.
- first claim creates IN_FLIGHT row before any external POST; duplicate or crash recovery returns RECONCILE_GET_FIRST, not another POST. Startup recovery can change orphaned IN_FLIGHT to UNKNOWN.
- capture claim requires create attempt with remote_id and APPROVED status. Future trusted PayPal GET transport MUST supply provider evidence; synthetic order amount/quote/status and capture ID/order/amount/status are checked before marking PAID.
- Durable adapter can be injected into existing day1 createQuoteApi for read/approval; payment POST still always returns 503 PAYMENT_GATE_NOT_READY. No external payment transport was added.
- .gitignore excludes local SQLite DB/WAL, .env and node_modules. package.json uses Node --experimental-sqlite, zero dependency added.

## Verified evidence
- Source commits: initial 99a2a8be09a52846b3d9830f86faa4b5b4396269; SQL placeholder bug fixed at 0c07306bb9633183358f0a1c86a8a3d28653d15e.
- First CI https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40064603053 FAILED: npm test failure; SQL placeholders corrected, no attempt to relabel failure as PASS.
- Follow-up CI https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40064652611 COMPLETED/SUCCESS; npm test step SUCCESS; test source has 19 new SQLite cases plus 23 Quote API, 11 contract and 3 progress cases (56 total).
- Cases: disk persistence after reopen, duplicate quote, stale/foreign owner, two connections approval and create races, create/capture claim uniqueness, UNKNOWN after restart, synthetic mismatch failure, verified synthetic success, existing read-only GET/POST payment safety unchanged.

## Gaps and explicit safety limitations
- This is a Node local SQLite adapter, NOT Cloudflare D1; no Production deployment/authenticated real account integration, browser E2E or actual PayPal Sandbox transaction.
- Tests use multiple SQLite connections in one test process, and close/reopen of on-disk DB; **not a separate OS process crash/concurrency soak test**.
- recordApprovedOrderFromGet and recordCaptureFromGet are internal trusted-backend APIs that currently receive only synthetic test payloads. They are NOT cryptographically verifiable without real authenticated PayPal GET. They must never accept browser-supplied proof.
- Real purchase order creation/capture routes remain fail-closed. A persistent ledger alone is not sufficient to authorize real charges. Need real trusted identity, browser CSRF handling, API credentials, Sandbox GET comparison, seller/payee binding and provider reconciliation.
- Future Cloudflare Workers/D1 build must translate SQLite sync transaction semantics to D1 safely; do not claim this Node module runs unchanged on Workers.
- Day2 allotted expected 5h / safety 9h. Actual elapsed time NOT_MEASURED; remaining within Day2 offline scope 0h. Day3 has planned hands-on 3h/safety 8h, but external account waiting is UNKNOWN.

## Next task
- PPL-D03 (scheduled 10/27): validate private developer Sandbox merchant+buyer and free AI model access, then actual OAuth → create → buyer approval → GET → capture → GET if legally/technically available. No secrets in GitHub/chat, PayPal Live and new spending prohibited. If blocked, preserve exact evidence and request safe path rather than falsely marking gate passed.
