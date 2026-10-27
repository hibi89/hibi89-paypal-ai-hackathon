# PPL-D05 — 결제 원장·Sandbox 통신 통합 및 UNKNOWN 복구

**2026-10-24 KST 실행(원래 10/29 배정분 선행)** · **Day5 100%/100% OFFLINE MOCK ACCEPTED** · 실제 PayPal 호출 불가/미실행

## Implemented, tested
- src/sqlite_ledger.mjs: trusted PayPal GET mock data against owner/merchant/quote ID/approved USD amount, stores CREATED order ID durably with state UNKNOWN (not PAID), upgrades APPROVED only on verified approved order. Never downgrade APPROVED to CREATED from stale GET.
- src/paypal_sandbox_transport.mjs: getCaptureProof reads a fresh authenticated-looking **mock** GET of the order, checks one capture, amount, merchant, status. Without confirmed capture return no proof; `GET` body, not browser redirect or successful POST, is needed.
- src/payment_orchestrator.mjs: private backend-only glue. Checks approved quote/actor/merchant, performs `ledger.claimOperation(create)` BEFORE exactly one transport POST; stores remote ID after GET, subsequent clicks call GET first. `captureApproved` requires provider GET APPROVED + durable capture claim, POST at most once, sets UNKNOWN pending subsequent provider GET, marks PAID only after validated capture proof.
- A timeout after create POST but before known order ID returns UNKNOWN with explicit manual-operator recovery requirement; **never claim the unknown payment is completed, never blindly re-POST**. Once order ID is known, retry/worker restart queries GET and never repeats POST.
- Simulated seller mismatch, amount mismatch, capture mismatch are fail closed. Concurrent initial create calls produce only one provider POST. Captured response lost then provider GET can confirm PAID in mock.

## Evidence
- Code preparation `13cfdf7790c127e7075d8ba1581636ba2880d8e8`, [CI 40065784383](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40065784383) success.
- [Integration code commit bfd7f641183d150a685ccb11a30b3b796af6414a](https://github.com/hibi89/hibi89-paypal-ai-hackathon/commit/bfd7f641183d150a685ccb11a30b3b796af6414a), [GitHub Actions run 40065874692](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40065874692), **npm test 95/95 PASS, 0 FAIL** from actual job logs.
- Added 12 integration regression cases; original 82 + 1 incidental test count = 95 total (actual CI runner numbers supersede assumptions). Two SQLite handles, process restart/reopen, network loss after POST and idempotent duplicate request scenarios tested synthetically.

## Remaining external work **not** implied by Day5 100%
- Real PayPal Sandbox Developer app (Business merchant, Personal buyer), OAuth client credentials, buyer approve, Orders create/capture/GET: **NOT_TESTED / BLOCKED_BY_ACCESS** in separate D03 (0%).
- This payment orchestration code is **not mounted to any public/loopback payment route**. Quote payment HTTP POST remains 503, test demo has no working PayPal. User credentials and payee verification in a trusted production identity system are not connected.
- The transport accepts injected fetch and mock credentials in tests; no real provider signed proof. Production server secrets, TLS/redirect handling, D1 migration, auth/cookie/CSRF, and real browser E2E remain unverified.
- A create POST network timeout that loses remote order ID has no safe automated GET-based recovery; requires manual operator/provider investigation before ANY retry. This is a known fail-closed limitation.
- Amount and merchant proof need actual Sandbox regional and account verification. Do not treat a synthetic PAID database row as a completed PayPal payment.
- No Live or real funds, new spend 0 KRW, no secrets in repository.

## Day5 progress
- Checked 5 acceptance criteria totaling 100 weighted points, all verified **within offline mocked scope**; Day5 **100%**, estimated remaining **0h**, safety remaining **0h**. Those hours are only estimated residuals, not real elapsed time (NOT_MEASURED). Original 5h/10h estimate is NOT a statement of time used.
- D03 remains **0%/100%** / estimated remaining **3h** / safety remaining **8h** / external waiting UNKNOWN.
- D04 remains **80%/100%** / estimated remaining **2h** / safety remaining **4h** (actual free AI test blocked).
- Current NEXT D06 **0%/100%**, estimated remaining **5h** / safety remaining **9h**: validate full offline browser flow, refresh and double-click, owner security and real deployment gate without falsely enabling payment.

Source of truth [daily percent/hours JSON](../../data/paypal_daily_progress.json). Next actual work session must refresh HEAD and these facts.
