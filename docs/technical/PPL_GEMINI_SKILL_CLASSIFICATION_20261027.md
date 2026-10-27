# PPL — Gemini skill classification / matching internal bridge

Date: 2026-10-27 KST. Branch: `lead/paypal`. Code SHA: `00125f6124a8341c3746c6ff610f8daae58273fd`. Verified [GitHub Actions #40496719791](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40496719791).

## 1. Objective and original architecture comparison
Global owner vision has a buyer task, real AI classification, real owner-approved seller quote, PayPal buyer→capture→GET, SOVIA-like trace, DBVORA-like observability, privacy-safe BI. Prior local match had **only regex detection of English skill words** against 3 fictional profiles. Prior optional Gemini was for quote dollars and had no controlled skill-classification bridge. Implement real-provider-shaped, controllable matching code without an unauthorized Gemini network call or fake seller/payment claims.
Considered (A) turn on external Gemini in current 127.0.0.1 synthetic owner server: insecure, synthetic identity, no owner HTTP auth, implicit paid/quota risk; rejected. (B) internal composition with closed skill taxonomy, explicit host-provided owner identity and consent, injected fetch and independent durable one-shot reservation, no public mounting; implemented. Real provider execution still separately gated by owner's explicit permission and eligibility.

## 2. Implemented paths and data contracts
- `src/marketplace_match.mjs`: exposes `MARKETPLACE_SKILL_NAMES` and `matchSyntheticMarketplaceSkills(skills,{source})` using same 3 fictional fixed profiles, score, eligibility and ranking. Existing `matchSyntheticMarketplaceBrief` delegates with source OFFLINE_REGEX to preserve working offline UI and never claims real AI.
- `src/gemini_marketplace_provider.mjs`: strict 8–500-char synthetic brief, fixed `GEMINI_P0_ENDPOINT`, injected owner-approved/free-tier verified credentials and fetch, JSON schema for skill enum {web,design,payments,automation,data,qa}, exact-key only JSON parser, single finishReason STOP, bounded body, rejects invented fields/skills/duplicates, no arbitrary endpoint/model fallback, no numeric price, seller, automated approval or payment.
- `src/marketplace_ai_budget.mjs`: durable Node SQLite WAL budget, single reserved attempt per file, SHA256 brief digest but no raw prompt content, actor/merchant binding, `RESERVED→COMMITTED|UNKNOWN`, no implicit reset or network retry. This budget is *separate* from `ai_draft_attempts` quote generation budget; they are not a globally merged free-tier quota. Host must manage global billing/quota conditions before approval.
- `src/owner_marketplace_ai_service.mjs`: internal `classify` requires injected trusted-actor resolver, separate `authorizeRequest` outcome and budget first-claim before calling provider; deterministic rule engine produces 3-profile result. No current server route, public auth handler, real identities or provider calls; fake `verified:true` from client must NEVER be used by a future host.

## 3. CI / test evidence
Added `tests/gemini_marketplace_provider.test.mjs` (6) and `tests/owner_marketplace_ai_service.test.mjs` (8): no permission/fetch/Free Tier rejection, exact endpoint and typed schema, refusal of model-disallowed categories/prices/free text, no arbitrary model route, secret sanitization, invalid inputs before network, durable one-shot after restart, parallel race with one provider request, failure UNKNOWN, per-actor status scope, offline server remains AI and PayPal disabled.
[GitHub Actions #40496719791](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40496719791) **SUCCESS on source SHA** `00125f6124a8341c3746c6ff610f8daae58273fd`: Node **384/384 PASS, 0 fail**, actual Chromium local demonstration PASS, 18-day progress/dashboard gate PASS. No real Google/PayPal network calls made in tests, no standalone buyer approval or Capture provider GET.

## 4. Status distinctions
DONE: typed Gemini skill-classification adapter and trusted-host/consent/one-shot architecture tested by injected fake transport; existing deterministic offline 3-profile matching/quote/human approval/audit/BI preserved.
PARTIAL: Gemini genuine inference over a consented synthetic project (not executed here), AI+human interaction in published UI, verified Seller Merchant binding, long-lived AI result persistence, restart presentation and disjoint per-feature/global budgets.
BLOCKED: actual PayPal Business merchant↔REST app, distinct Personal buyer, authenticated HTTPS callback, authorized order/capture/get demonstration; external Gemini owner permission and Free Tier availability confirmation.
NOT_DONE: independent SOVIA/DBVORA production systems, real customer dataset, valid real-world pricing comparables, public site, public video, English Devpost submission receipt. **Full product % not measured**; do not infer it from passing isolated tests.

## 5. Failures, retry and recovery policy
New code + new test stage passed CI on first run (earlier separate audit UDF CI incident already recorded). Any provider error/timeouts/malformed/malicious JSON after reservation moves attempt to UNKNOWN. Reopen SQLite database and check `status`; cannot call provider again automatically. Explicit owner operator intervention outside this module would be needed for recovery. Secrets, API error content and raw briefs are not recorded in the budget database. Unknown PayPal CREATE/CAPTURE POST likewise stays GET-first and never auto retries.

## 6. Repo, source, identity and commit paths
Repo `hibi89/hibi89-paypal-ai-hackathon`, `lead/paypal`, prior source+docs SHA `0d5ce37ce1126e7ccc996bd4fb3bf8668a08e10f`, tested module commit `625ed4f08ccf34c3d6ffd899bb94db17e3fc2b8f`, tested source+test commit `00125f6124a8341c3746c6ff610f8daae58273fd`; doc-only follow-up HEAD requires separate CI verification. Existing GitHub identity `hibi89`, no main edits, no force push. Source/test file paths in §2 and §3.

## 7. Runtime, deployment, cost and evidence truth
Node.js ESM >=22.5, `node --experimental-sqlite` for durable one-shot; zero external dependency additions. Public Production URL NONE; Vercel/Cloudflare deployment NONE. Sandbox Live money NONE. Current local demo uses synthetic identity and regex/offline only. Gemini actual one-shot OAuth HTTP200 from earlier owner report does not prove this new matching adapter has been called. No global free-tier eligibility assumed; cannot promise zero billable usage without separate confirmation.

## 8. Safety, IP and source backup
No proprietary SOVIA/DBVORA source copied; no secret values, consumer records, personal buyer identifiers, market transaction PII, synthetic price predictions presented as real. Prior source at `0d5ce37` remains in git history. Code in contest repository can be reviewed and reverted. All third-party skill extraction handles synthetic data only until explicit consented true user data handling implemented. No external API, publication, payments or accounts accessed in this step.

## 9. Next priority and success condition
**P0 still real PayPal Sandbox authorized buyer→capture→GET**, with authenticated server session, verified merchant app/payee and separate owner authorization for one capped virtual USD transaction, no Live. After that, owner can separately authorize one actual Gemini skill classification under confirmed free tier and synthetic prompt; verify generated classification in UI. Next reasonable internal work: persist only non-sensitive validated skills to support crash-safe presentation, integrate future authenticated host without looping on unsupported synthetic auth. Enforce real trusted owner identity and money/AI independent permission, privacy/sanitization, 3min YouTube, public MIT repo, Devpost receipt by 2026-11-13 05:00 KST.

## 10. Time and verification cutoff
2026-10-27 KST; source SHA `00125f6124a8341c3746c6ff610f8daae58273fd`, GitHub Actions #40496719791 successful. Documentation commit is distinct. Real Gemini skill model, Sandbox order/buyer approval/capture/GET, public URL, video and Devpost remain NOT_VERIFIED.
