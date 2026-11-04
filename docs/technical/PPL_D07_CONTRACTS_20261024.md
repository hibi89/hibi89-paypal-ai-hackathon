# PPL-D07 — Local contract/milestone SQLite offline verification (2026-10-24 KST)

## Scope/decision
- Adopted a separate `src/contract_milestones.mjs` module mounted on existing `src/sqlite_ledger.mjs`. This is less invasive than merging delivery state into `payment_attempts`; existing quote approval, UNKNOWN/capture guards and HTTP payment POST 503 are unchanged.
- A contract is created atomically only from an approved USD quote with exact owner/merchant/version and approved-amount matching the sum of 1..30 uniquely ordered milestones. One contract per quote.
- A contract's immutable approved quote snapshot and `version` are independent of PayPal payment attempts. `paymentState` reads capture attempts only; a PAID capture never auto-accepts delivery.
- Owner may submit milestone evidence; a separate reviewer identity may accept/reject. Status transitions require a trusted authenticated caller, expected state and compare-and-set contract version. Rejected milestones may be resubmitted.
- Audit records have unique event IDs and per-contract versions, referential integrity with composite milestone FK, and DB triggers blocking UPDATE/DELETE. Existing quote revision is prohibited once a contract exists.

## Evidence
- Code: `src/contract_milestones.mjs`, `src/sqlite_ledger.mjs`; tests `tests/contract_milestones.test.mjs`.
- Initial D07 implementation SHA `8c15b126a91dac3a7ad501c2e493d7ea57986dac`: [CI 40068908347](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40068908347) **120/120 PASS + offline Chromium PASS**.
- Final D07 regression/hardening SHA `e682d6dd876cfc1afe9ca7aeec32842ad306d698`: [CI 40069063023](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40069063023) **121/121 PASS + local Chromium PASS**. Includes authentic pre-D04/day2 SQLite fixture migration and original quote/approval preservation; two SQLite connection CAS, duplicate/stale/foreign role, immutable event trigger coverage.
- No extra API expenses; no outbound payment traffic. `npm test` via Node22 GitHub runner. Local host file-level development test not separately executed, because only the GitHub-connected repository was accessible.

## Security and limitations
- Caller authentication is **NOT** implemented in this new DB module. `actorId` and `merchantId` are only secure when provided by validated server-side session/merchant binding. Browser-controlled identities must not be passed through. Production buyer reviewer session remains D08/future integration.
- D1 migration and production persistence are untested; SQLite module is local/offline.
- All actual PayPal Sandbox OAuth/merchant/buyer/Orders/GET/Capture, real free AI generation, Cloudflare production, and Devpost are blocked/not tested. Payment POST remains 503. No live funds.
- Elapsed human/agent effort NOT_MEASURED; 4h/8h were planning bounds, not logged hours.

## Next
- PPL-D08: authenticated HTTP contract creation/GET, owner submission, reviewer acceptance/rejection, full negative/security tests; do not allow GET/F5 to perform writes.
