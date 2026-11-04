# PPL — Real GitHub Actions Node + Chromium CI verified (2026-10-27 KST)

## 1. Objective and branch
Get genuine reproducible execution evidence for the P0 PayPal owner-only sandbox transport, after several source and regression updates were marked CI UNVERIFIED. Repo `hibi89/hibi89-paypal-ai-hackathon`, testable source baseline `lead/paypal@8ba5c89bbf53ec98348a80b10b78b60be47fc26a`.

## 2. CI visibility issue and fix
The original `.github/workflows/test.yml` ran on `push: lead/paypal` and `pull_request: main`. The GitHub connector only exposes pull-request-associated Actions run listings; push runs could not be resolved. A previous draft PR targeting `main` did not produce a usable run, because the test workflow did not exist on main.
On `lead/paypal`, changed existing pull_request branch filters from `[main]` to `[main, lead/paypal]`. Commit `8ba5c89bbf53ec98348a80b10b78b60be47fc26a`. No test command, credentials or provider operations changed.

## 3. Verification-only PR procedure
Created temporary branch `ci/paypal-lead-pr-check-20261027` from `8ba5c89`. A harmless single Markdown marker commit `3cceb1c432dc2ce70b3d887fe7fefb39ab6b51ae` triggered draft [PR #2](https://github.com/hibi89/hibi89-paypal-ai-hackathon/pull/2) **targeting lead/paypal**. Existing workflow ran against PR's merged test checkout. This differs from the baseline **only by a Markdown verification marker**, so actual application/source and tests matched `8ba5c89`; no feature code changed.

## 4. Actual runtime result
[GitHub Actions #40511879186](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40511879186), run number 244, workflow `Offline payment-contract tests`, event `pull_request`:
- Final workflow status: `completed`, conclusion `success`.
- Job `test`: ID `122215634126`, status `completed`, conclusion `success`.
- `python3 render_master_progress.py --check`: `MASTER_PROGRESS CHECK PASS 18 calendar entries`.
- `npm test` (real Linux Node 22): `# tests 415`, `# pass 415`, `# fail 0`.
- `python tests/browser_offline_e2e.py` (actual Chromium with Playwright): `CHROMIUM_BROWSER_E2E_PASS: marketplace+quote+contract+subscription+integration, no provider/payment POST`.
- All workflow steps, including Node, install Playwright and Chromium journey, completed with `success`.

These are **actual remote CI logs**, not static checks or V8 injection. This verifies the previously pending latest transport/coordinator/SQLite regression source through `8ba5c89`, including recent consent, capture and create revocation fixes.

## 5. What this does not prove
No live PayPal payment/order/capture/GET, actual buyer approval, real Gemini quote integration, cloud hosting, official PayPal Business merchant ↔ REST app binding or Free Tier subscription. CI runs without merchant keys and provider secrets by design. A successful synthetic integration test MUST NOT be relabelled real payment evidence. Do not mark D03/D04/D15 complete or change unmeasured total product percentage.

## 6. Cleanup, backup and source integrity
Closed PR #2 **without merging**, preserving `lead/paypal` application source, main and repository permissions. Verification branch remains as evidence; no force-push, live deploy or secret changes. `main` was never updated. The workflow filter addition remains on lead/paypal to permit future observable CI.

## 7. Environment / release
Node.js 22, built-in `node:sqlite`, Linux GitHub runner, Python 3 Playwright 1.56.0 Chromium, `npm test`; no container/new dependency or paid API. No Production URL. Entire test environment was synthetic/offline.

## 8. Risk and next priority
P0 blocking proof is now **external Sandbox buyer→Orders create→human approval→separate capture→provider GET with owner authorization**, and actual in-app AI draft generation from a verified free/approved project. Host login, safe HTTPS return and PayPal merchant app owner verified independently before any scoped real Sandbox trial. Maintain UNKNOWN no-retry, explicit human consent and exact merchant/quote/session binding.

## 9. Actions for next lead
1. Verify `lead/paypal` latest source is stable; workflow now has PR lead/paypal trigger.
2. Prepare one **owner-authorized** synthetic USD 1.00–2.00 real Sandbox trial via trusted host with separate Business+Personal credentials, without revealing secrets in GitHub/chat.
3. Wire real Gemini generation into quote draft and check human approval while preserving zero-cost controls, only after separately scoped API permission.
4. Finish authentic browser demo video under 3 minutes, English reproducibility and Devpost submission before official 2026-11-13 05:00 KST.

## 10. Evidence confidence
CI result **verified** from GitHub connector run, job, detailed step summaries and downloaded job log. Head/base distinction explicitly documented. Document-only handoff commits occurring after the tested base do **not** imply application code was retested.
