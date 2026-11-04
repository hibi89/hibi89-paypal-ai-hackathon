# PPL-D06 — 실제 Chromium 로컬 견적·승인 UI E2E 증거

**실행:** 2026-10-24 KST (10/30 6일차 계획을 선행) · **100%/100% offline scope** · 남은 예상 0h / 안전 0h · 실제 경과 NOT_MEASURED

## Implemented
- web/demo_client.js: synchronous busy guard + disable all active controls during pending network action; quote already APPROVED disables approval button. UI refresh and F5 issue GET only. Synthetic approval POST requires checked human confirmation and strictly parsed integer cents (no exponent, fractions beyond 2 decimals, 1.00~10,000.00 USD). A second click/submit cannot issue another POST while first is pending.
- web/offline_demo.html: explicit form button IDs and aria-busy state; large banner makes OFFLINE_MOCK/no PayPal clear. Explicit card data displayed as textContent (no untrusted HTML insertion).
- tests/demo_client.test.mjs: six Node VM synthetic DOM interaction regressions (bootstrapping, GET refresh, double approval, quote approval invalidation, invalid price, payment GET-only).
- tests/browser_offline_e2e.py: **actual Chromium** launched in GitHub Actions against the real Node 127.0.0.1 local app (`npm run demo`). It loads and reloads the app, verifies F5/refresh generates no POST, two submit events in the same JS task produce exactly one draft and one approve POST, approval amount 17.55 persists, revision invalidates approval, and payment status triggers no order POST.
- GitHub workflow .github/workflows/test.yml adds free pinned Playwright 1.56.0 installed in ephemeral Python virtualenv and executes system Chromium against loopback. No external AI, PayPal or secret environment injected.

## Evidence
- Initial frontend/source commit `a629e59f44dc6f1b4266d5bd93e47331e01b89d7`; first Node VM harness CI [40066459542](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40066459542) **failed** due to insufficient bootstrap microtask wait. Test-only harness correction `b936cb4dd208507102f6c052a9478f145e69e651` [40066534103](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40066534103) **success**.
- Actual browser script `d93093f99839d2e4781fd0803cf8b058d2efb1e5`, workflow `04c57a4c39767835940ed9dc3a42ca2793b47643`.
- [GitHub Actions 40066792213](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40066792213): **Node tests 102/102 PASS; Chromium browser E2E PASS**. Job runner logs contain `CHROMIUM_BROWSER_E2E_PASS: actual loopback, F5, double-click, approval, payment blocked`; directly verified.
- Older `tests/quote_api.test.mjs` verifies 401/404 owner, CSRF origin; `tests/offline_demo_server.test.mjs` verifies local forged Host rejection and wrong Origin 403; still passing in latest CI.

## Deferred/not implied by day6 100%
- Actual deployed hosted browser and production account session provider **NOT_TESTED**. Local loopback uses one fixed synthetic demo identity and exposes local CSRF token for demo; cannot be deployed publicly.
- Actual PayPal Sandbox OAuth, buyer test checkout, Orders GET/capture and real AI remain **D03 BLOCKED_BY_ACCESS**, not claimed from mock/browser results. POST /api/quotes/:id/orders remains **503**, no funds/capture or Live PayPal used.
- Public deployment, free hosting, cross-account production isolation and D1 migration belong to later D14~D16 work; real browser and production browser are different evidence levels.
- Previous explicit user instruction: day budgets are conservative original estimates, NOT actual measured work time. Here Day6 remaining 0h within synthetic scope, not full submission.

## Next
- Active PPL-D07 (scheduled 10/31): contract/milestone durable SQL schema, per-owner guards, separate payment vs delivery state, append-only event history. Expected **4h** / safety reserve **8h**, progress **0%**.
- D03 still **0%**, remaining expected **3h** / safety **8h** (external wait UNKNOWN). D04 **80%**, remaining expected **2h** / safety **4h**, real free AI blocked.
- Record every new session in [daily JSON](../../data/paypal_daily_progress.json) and lead→overall report.
