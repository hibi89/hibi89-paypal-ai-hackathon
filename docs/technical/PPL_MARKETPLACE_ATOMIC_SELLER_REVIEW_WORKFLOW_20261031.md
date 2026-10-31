# PayPal Proofline — Atomic seller/reviewer backend workflow, 2026-10-31

VERIFIED SOURCE: 8fb6e097fe2b5f513cea650b074cb535f86c298b. GitHub full CI https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/41188821906: SUCCESS, 604/604 Node, Chromium AI Work + Global Services, Windows first-run PASS. Offline smoke https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/41188821864 SUCCESS.

## Design comparison

Option A, API-only role precheck then legacy contract transition: smallest change, but authorization can become stale between async check and DB write, and existing legacy seller submission is modeled as the contract buyer. This leaves a revoke/assignment race; rejected as final authorization boundary.

Option B, same SQLite transaction for active membership and seller assignment, contract CAS, milestone state, immutable event: preserves existing source/data, no extra DB or paid costs, safely serializes authorization and mutation. SELECTED for isolated synthetic backend.

## Workflow

Trusted host session and role policy proof plus server-side scope for contract; POST with matching Origin, CSRF and precise JSON. Seller with assigned seller profile may submit PENDING or REJECTED with detail >=8 chars. Named reviewer may accept or reject only SUBMITTED, with rejection detail >=8 chars. The SQLite BEGIN IMMEDIATE transaction rechecks role active, tenant, seller assignment or named reviewer, contract state and expected version, milestone state, duplicate global event ID, then increments version and records immutable actor event. On failure all writes rollback. No owner-as-seller bypass in this new path.

Result always paymentAuthorized:false; no payment authority, Orders, Capture, seller payout or Gemini network. Existing main contract API, website and synthetic demo unchanged. New handler is opt-in, not registered as real login/public endpoint. Historical owner real Sandbox/Gemini evidence remains unmodified.

New tests: tests/marketplace_contract_workflow.test.mjs 7 scenarios; full reject→resubmit→accept, reviewer acceptance, access scope/cross tenant, forged actor role headers, CSRF, inactive grants, stale CAS, duplicate event, restart, source payment NOT_CAPTURED.

## Failure and next

Initial connector-generated feature commit 7bc41f4 failed CI due malformed escaped SQL backticks, fixed at 4e11fcd; final feature SHA 8fb6e09 full CI green. Next migrate existing REST quote/contract authentication with deny-by-default permissions and atomic checks, then local synthetic seller GUI/browser flow. Real users, merchant verification and public/paid external actions need explicit separate owner approval. No production service test has occurred.