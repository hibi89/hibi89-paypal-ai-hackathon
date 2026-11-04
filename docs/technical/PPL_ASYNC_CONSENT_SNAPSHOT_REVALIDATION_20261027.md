# PPL P0 — Async human-consent snapshot revalidation (2026-10-27 KST)

**Result:** Source and regression tests COMMITTED on `lead/paypal`; GitHub Actions Node/Chromium result NOT VERIFIED at this handoff. No external PayPal, Gemini, deployment or payment was performed.

## 1. Goal, original requirement, stack
Keep the existing owner-approved PayPal Sandbox checkout binding: quote version, exact merchant, actor, approved minor amount/currency, human approval and durable one-shot session. Node.js ESM, built-in `node:sqlite`, existing mock transport; no dependency change.

## 2. Gap and design decision
`createOwnerPilotCheckoutCoordinator.check()` had fetched an approved quote BEFORE awaiting a host-provided human-authorization callback. The callback could yield while the quote was revised and RE-APPROVED at the same price on a newer version. The previous post-consent proof check used the stale JavaScript quote snapshot.

Options considered: (A) rely only on `claimOperation`'s DB checks (no extra code, but old consent/snapshot could remain in transport context), (B) fresh DB read + immutable-scope comparison + branded session proof check after the human callback (small cost, minimal change), (C) hold a database transaction across human interaction (long locks, poor reliability). **Chose B**.

## 3. Actual implementation
`src/owner_pilot_checkout_coordinator.mjs` re-reads the quote after `authorizeAction()` returns `true`. Denies with `OWNER_PILOT_APPROVAL_CHANGED_DURING_AUTHORIZATION` if ID, owner, merchant, approval state, actor, quote version, currency, approval version or amount changed. Rechecks the durable branded proof against the FRESH quote, including TTL and revocation. No new provider path, implicit capture, network call or HTTP route.

## 4. Regression tests
`tests/owner_pilot_checkout_coordinator.test.mjs` adds (1) quote revision 2→3 + same-$1.50 reapproval while a CREATE approval callback is pending: old consent rejected, no provider call and no durable claim; (2) session revocation during CAPTURE consent: no Capture POST and no extra payment claim. The fixture's trusted authorizeAction hook can now mutate state during callback without changing default tests.

## 5. Verification
- GitHub source commit: `5c6eb30593ca49a4002c328b0aff6287fda30b68`
- GitHub regression commit: `f8822b459cf818558c0856767d3ea0a14de6b6c6`
- Remote code + test fetched back after write; 6 static structural checks PASS.
- **Node runtime test count/pass/fail: NOT VERIFIED; latest workflow run unavailable via connected GitHub Actions query.** Do not assume 409 PASS because 407 were previously reported for an older SHA.
- Commands for verified environment: `npm test`, `python render_master_progress.py --check`, then inspect real Chromium job output for the exact tested SHA.

## 6. Current scope/status
COMMITTED: minimal checkout safety patch and two test cases. PENDING_VERIFICATION: CI, actual runtime regression. BLOCKED_BY_APPROVAL/ENV: genuine distinct Sandbox Business/Personal merchant + buyer, HTTPS callback and separate consented Order CREATE, buyer approval, CAPTURE, provider GET. No change to measured complete percent (full vision remains NOT_MEASURED).

## 7. Production and external calls
No production URL/Cloudflare deployment; no new Vercel project. This code remains an INTERNAL owner pilot, not publicly mounted. Existing localhost synthetic demo unchanged. No actual PayPal order, live funds or real Gemini call in this step.

## 8. Source/data/rollback
Original repository code at `lead/paypal`. Safe baseline immediately before this patch: `5ce68872ff9bf9fff87d3f8f38827b1e4795caf9`. Inspect diff or revert the two code/test commits with a normal non-force Git revert if needed. Do not copy token, credentials, actual account email or customer PII to GitHub.

## 9. Immediate next steps and acceptance
1. Obtain exact-SHA GitHub Actions result for `f8822b45`; if failed, inspect logs and minimally repair. Never report PASS from structural check.
2. Recheck `lead/paypal` against source, test and docs after concurrent writers.
3. Prioritize owner-authorized actual Sandbox buyer→CAPTURE→provider GET and real AI integrated workflow; do not launch any external call without separate scope approval.
4. Then public reviewer cold-start + safe English instructions, face-free genuine under-3-minute judging video and Devpost submission.

## 10. Handoff metadata
Checked on 2026-10-27 KST. Evidence: connected GitHub fetch/update actions, remote blob roundtrip and static checks only. Source reference commit `f8822b459cf818558c0856767d3ea0a14de6b6c6`; this report and subsequent STATUS/HANDOFF pointers may be on later commits. No full CI or production validation claimed.
