# PayPal — Quarantined legacy Gemini pricing: trusted host and consent gates
2026-10-27 approximately 23:12 KST. PPL contest lead.

## 1. Objective / confirmed requirements / stack
Preserve approved local Node ESM + node:sqlite MVP, submit one real PayPal Sandbox proof and actual Gemini skill classification. Do not imply unlicensed market pricing dataset or make AI authoritative for PayPal. Keep budget zero and secrets private. Existing legacy `createGeminiQuoteDraftProvider` can output a dollar number, which is not the finalized Gemini skill-classification submission requirement.

## 2. Change and design comparison
Option A delete legacy price adapter: narrowest exposure but breaks existing regression/legacy work and complicates future experiments. Option B preserve but default-off, explicit opt-in + trusted host consent, revalidate current owner/merchant/session/quote before provider call. Selected B: same cost and smaller compatibility impact while submissions do not activate pricing. No new service, account, dependency, user data or approval scope.

## 3. Functionality and source
`src/quote_api.mjs`: require `allowAiPricingExperiment === true` and an injected function `authorizeExternalAi` whenever an external draft provider is configured. Browser flag `externalAiConsent` remains necessary but is not sufficient. Host authorizer receives action, actor ID, merchant, quote ID/version, and SHA256 scope digest, not raw prompt or secrets. Independently check current trusted principal, tenant/merchant, CSRF header and quote version after awaited authorization, and after the durable one-shot SQLite claim. Revocation after claiming transitions to UNKNOWN; no model POST or automatic replay. This is server-injected experimental code, NOT mounted to public demo or real provider.

## 4. Tests / commands / failure details
Four new tests in `tests/ai_draft_reservation.test.mjs`: disabled-by-default host gate, browser-only consent refusal, revocation during host authorization, revocation after SQLite claim. Updated legacy synthetic fixtures in `tests/gemini_quote_provider.test.mjs` and `tests/p0_ai_payment_integration.test.mjs` to inject trusted host permissions and merchant.
- Initial branch commit `a5a8c62c1e67707e7c3561858a7caf52131aa064` + [CI #40517754066](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40517754066): 419 pass / 1 fail because the existing P0 synthetic AI→payment fixture lacked new constructor requirements; Chromium not run. No runtime payment/AI provider issue was inferred.
- Test-only fixture fix `8d5daaf108547b4febe518009d02dd7892629af0` + [CI #40518688492](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40518688492): `npm test` 420/420 PASS, `python3 render_master_progress.py --check` 18 entries PASS, real Playwright Chromium browser E2E PASS, no provider/payment POST. Commands in repo: `npm test`, `npm run preflight:reviewer`, `python render_master_progress.py --check` on Windows (GitHub Python3 elsewhere).

## 5. Status and remaining gates
Engineering source/CI VERIFIED (offline). PPL-D03 Sandbox real payment 65% PARTIAL, PPL-D04 AI 80% PARTIAL, PPL-D15 remote demo deployment 20% PARTIAL per unchanged source-of-truth progress. Real merchant↔REST app, Personal sandbox buyer, external Orders create/approval/capture/GET, genuine in-app Gemini classification, secure externally accessible login, publicly filmed video and Devpost receipts remain NOT_VERIFIED. No whole-product percent measured.

## 6. Repo / branch / SHA / code paths
`hibi89/hibi89-paypal-ai-hackathon` / `lead/paypal`. Tested code SHA `8d5daaf108547b4febe518009d02dd7892629af0`; prior lead SHA `a9d966b1653465e961567e395ec7533c440c6881` preserved in history. PR #4 is the CI route; separate fix branch also retained. `main` unchanged. Files above plus handoff/status docs.

## 7. Production / runtime
No Vercel project or Production URL, no Cloudflare D1 live adapter or published HTTPS callback. Offline runs use Linux GitHub runner Node 22, built-in `node:sqlite`, local Chromium; publicly trusted authentication absent. Existing loopback app cannot be exposed publicly as production auth.

## 8. Originals / backups / permissions
No original database replaced, no migration, no payment/order creation, no actual model traffic, no developer account mutation and no secret handling. Remote Git commit parent is immutable backup. No force push. Never store API credentials, billing data or user secrets in chat, GitHub, demo logs or docs.

## 9. Next work, priorities and owner-only approvals
P0: Verify existing authorized Sandbox Business REST app and a separate Personal buyer with approved private credentials/HTTPS host, and obtain explicit owner authorization for one bounded virtual USD 1–2 create→buyer approval→capture→provider GET. Reconcile any UNKNOWN via GET, no second POST. P1: Use currently permitted no-charge Gemini project and existing typed skill provider for one real in-app classification of a synthetic brief, with consent and quotas, not fabricated price ML. P2: cold-start run from GitHub, actual under-3-minute screen video, English Devpost submission by 2026-11-13 05:00 KST, approval before publication/submission. Never claim these completed from offline CI.

## 10. Confirmations and handoff scope
Checked connected GitHub `lead/paypal` and PR-associated CI job logs on 2026-10-27 KST. Application code SHA and Actions success directly verified; these docs were added after test and are not additional runtime verification. On next chat, read HANDOFF→STATUS→AGENTS→REQUIREMENTS→actual source and fresh HEAD; do not extend synthetic features ahead of real provider gating.
