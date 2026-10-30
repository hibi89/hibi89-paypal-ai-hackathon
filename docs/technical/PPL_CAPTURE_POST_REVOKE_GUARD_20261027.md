# PayPal P0 — Revoked checkout session guard across provider GET and CAPTURE claim

**Date:** 2026-10-27 KST. **Repository/branch:** `hibi89/hibi89-paypal-ai-hackathon` / `lead/paypal`.
**Verification:** GitHub code/test commits and remote roundtrip **CONFIRMED**; full CI/Node test execution and Chromium **NOT VERIFIED** at this handoff. No PayPal/Gemini network request or production deployment.

## 1. Goal, approved product and stack
Preserve the contest's one Sandbox-only quote→human approval→Orders v2 buyer approval→separate capture→provider GET evidence path. Existing Node ESM / node:sqlite / injected mock transport, zero additional dependency. Browser redirects, GET and cookies cannot grant payment authority.

## 2. Gap + architectural alternatives
Old `captureOwnerOrder()` checked branded checkout proof once before awaiting the provider's order GET; `payment.captureApproved()` could then send a CAPTURE POST after the session was revoked during a slow GET.

Alternative A: trust initial session check (fast but unsafe after async operations). Alternative B: recheck privately branded current SQLite proof after GET, before CAPTURE claim and again immediately before outbound POST (minimal code, two extra local DB checks; chosen). Alternative C: hold a SQLite transaction across external GET/human consent (locks and operational hazard; rejected).

## 3. Implemented code
- `src/payment_orchestrator.mjs` adds optional internal `beforeCapturePost` callback argument to `captureApproved`. It runs after provider order GET and before capture claim; reruns after claim, before `transport.captureOnce`. Missing callback retains previous general-orchestrator behavior; invalid callback is rejected.
- `src/owner_pilot_checkout_coordinator.mjs` supplies `beforeCapturePost` on its separately authorized owner capture route. It rereads the current quote, checks owner/merchant/approval, and verifies stored branded session against the **fresh** quote, including expiry/revocation.
- If revoked before claim, no claim/no capture POST. If revoked after claim, claim is conservatively UNKNOWN, no automatic retry; GET-only recovery applies. Caller approval never comes from browser objects.
- Unchanged: `createOwnerPilotOrderOnce`, PayPal Live prohibition, GET-only buyer-return handler, monetary caps and claim uniqueness.

## 4. New regression tests
`tests/owner_pilot_checkout_coordinator.test.mjs` now simulates:
1. checkout proof revoked *inside delayed provider GET* after an otherwise valid owner consent and confirmed buyer approval; CAPTURE call blocked, no capture claim or POST.
2. proof revoked *after* the durable capture claim, before outbound POST; result UNKNOWN, zero capture POST, duplicate attempt blocked with the revoked proof.

Added two tests; module totals 11 test declarations (previously 9). **Declarations are not evidence of execution.** Existing earlier successful 407 tests cover an older SHA only.

## 5. Evidence, tests, failures
- Orchestrator source: `8480f1d561707d46ca884da7081347f0ff460871`
- Owner coordinator source: `1ca20dfabc519c0741343d2c409e754cfe16456e`
- Regression source: `bb5bc431082c189bcf3b4b6a0c7e64eb865b0523`
- Connected GitHub remote roundtrip: three updated blobs verified; 10 static wiring/ordering/test-presence checks PASS.
- GitHub Actions wrapper filters pull-request-triggered runs and returned no run for older `f8822b45`; combined statuses were empty. Public GitHub page unavailable through search/browser tools; container git network DNS failed. **CI for this and previous changes NOT VERIFIED**, not declared failed. `npm test` / actual Chromium job must still run.
- No provider transaction, no new model call, no customer data or financial movement.

## 6. Work state
DONE: repo source, test cases, static remote checks.
IN PROGRESS: exact-SHA Node/Chromium CI verification.
WAITING FOR OWNER AUTHORIZATION: actual PayPal Sandbox Business merchant/app and distinct Personal buyer, HTTPS return/cancel callback, one capped CREATE, buyer approve, separately approved Capture, fresh provider GET.
NOT STARTED: production release, authentic demo recording, Devpost submission. Full product percent remains NOT_MEASURED.

## 7. Runtime / deploy
No new dependency or environment setting. Local Node >=22.5 with `--experimental-sqlite`; CI command `npm test`, progress `python render_master_progress.py --check`. Existing 127.0.0.1 synthetic UI only. **Production URL / Vercel project: NOT APPLICABLE.** Public GitHub source doesn't imply a deployed service.

## 8. Source, backups, security
Previous lead/paypal HEAD `c665c65f406c9a5fbb639a72d57ae931be86d375` preserved in Git history, followed by three change commits. Recover via ordinary Git revert on lead/paypal if tests fail; no force push. Never log credentials/tokens/customer data or merge these routes into public HTTP without real authentication and explicit scope approval.

## 9. Next work and acceptance
1. Inspect latest exact-SHA Actions Node + Chromium/CI logs; if failed, fix root cause once and rerun, never infer PASS.
2. Validate callback's real host authentication integration and one consented Sandbox buyer purchase with owner-approved scoped access; avoid extra synthetic polishing.
3. Run public reviewer cold-start, then face-free true demo video under 3 minutes and Devpost evidence after owner permission.
4. Submission deadline per frozen requirements: 2026-11-13 05:00 KST.

## 10. Handoff provenance
Checked 2026-10-27 KST from connected GitHub `lead/paypal` source and synthetic test definitions. Technical evidence base `bb5bc431`; documentation synchronization commits follow separately. Full QA and production validation are **PENDING**, not passed.
