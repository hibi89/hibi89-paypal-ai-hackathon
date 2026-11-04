# PPL-D13 Local Three-Feature Integration / Freeze Candidate — 2026-10-24 KST

## Acceptance
**D13 is OFFLINE-ONLY.** Single 127.0.0.1 demo integrates quote/human approval, contract/delivery/reviewer, and synthetic subscriptions. A local fixture status named `LOCAL_DEMO_CANDIDATE` is expressly not a production, public demo or Devpost-ready verdict. Real PayPal, AI, sandbox OAuth, public HTTPS, app Webhook, D1, reviewers' public login and live money all remain NOT_TESTED.

## Design and implementation
- `src/local_integration_readiness.mjs`: pure, deterministic cross-feature projection with immutable output. Local quote must have version-matched human approval, contract must bind quote owner/merchant/version/currency/amount and milestone amount totals, all delivery milestones accepted, and **synthetic** subscription active while evidence remains NOT_VERIFIED; otherwise local incomplete.
- `src/offline_demo_server.mjs`: fixed loopback-Host gate, trusted server-assigned synthetic owner only `GET /api/demo/integration`; reviewer session receives 404, POST receives 405. No input role selection, provider network, write or charge.
- `web/offline_demo.html`, `web/integration_client.js`: fourth read-only cross-feature overview; F5/click refresh GET only. Displays a caution on realPayPal/realAI/deployment; never hides financial evidence.
- Existing contract quote revision guard prevents editing an already contract-bound quote, even if previously human approved. Reviewer-only accept is checked; subscription failure or CANCELLED invalidates synthetic local candidate without changing contract money.
- No data migration from SQLite fixtures to Cloudflare D1, no external payment, and no production identity upgrade. Local audit is a diagnostic, **not** security certification.

## Verified evidence (actual remote CI)
[GitHub Actions 40077804576](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40077804576) SHA `673f47a1e47b25197e2a51f1b949024e356d3a25`: **Node 175/175 PASS**, local actual Chromium browser E2E PASS and 18-day master JSON/MD pass. 4 additional tests verify rejection of amount/owner/merchant/version mismatch; forged role 404; cross-feature quote approval→contract create→submit→review accept→subscription recovery/cancel; payment API still 503 and payment independent. Existing Browser tests continue to cover F5 GET-only/no payment POST.

## Blockers and D14
D03 real PayPal Sandbox/free AI access blocked (0%), D04 free AI external work blocked (remaining 20%). D14 next: verify documented security/release hazards, rate-limits, license and English entry; actual public deployment and Devpost acceptance remain later and require external approved access.
