# P0 — owner-operated one-shot provider evidence probe (2026-10-24)

## Purpose / proof boundary
Implements the integrated chief's [ACTIVE P0 directive](../FROM_HACKATHON_COMMAND.md): prioritize first **real** PayPal Sandbox and **real** AI signals, not more simulated Cloudflare/D1 changes. The new probe code is *ready* but **has not been run against either provider**. Local source/CI tests only simulate remote responses. This file must not be mistaken for real OAuth, real Gemini, actual completed PayPal order or proof of free billing.

### Source and safeguards
- `src/p0_one_shot_probe.mjs` — no arbitrary provider URLs, user-supplied model, prompt or payload, no GET create/capture/post payment operations. Two static endpoints only: PayPal Sandbox OAuth **one** POST, or Gemini **one** fixed short synthetic `generateContent` POST.
- `scripts/p0_one_shot_probe.mjs` — **dry-run by default**. Requires both `--execute` and `--owner-authorized`; Gemini also requires `--free-tier-confirmed`. Only the owner should ever execute those flags after verifying account access, usage tier and credentials privately. A persistent per-provider local claim now atomically blocks re-running that one-shot command across processes/restarts; timeout outcomes remain permanently reserved until owner manual reconciliation.
- `tests/p0_one_shot_probe.test.mjs` — fixture-only checks: default no-network, half-confirmation fails closed, missing credentials, strict Sandbox-only URL, fixed Gemini model/prompt/output cap, provider error sanitization, no bearer/body/AI answer in output, no automatic retry, CLI default blocked.
- No keys, tokens, prompts, order IDs, app IDs, AI answers or error response bodies are printed. Results are limited to status code, class of observation, and explicit uncertainty. Do not run with verbose HTTP logging or process environment dumps.
- **Neither success nor environment presence verifies Sandbox merchant/buyer access or the Gemini project's actual Free tier.** Manual dashboard/account review and independent actual transaction/generation evidence remain mandatory before D03/D04 are updated.

## Local Windows PowerShell — safe first action (no credentials needed)
From repository `hibi89/hibi89-paypal-ai-hackathon`, branch `lead/paypal`, Node.js 22+:

```powershell
npm test
npm run preflight:p0
node scripts/p0_one_shot_probe.mjs --paypal
node scripts/p0_one_shot_probe.mjs --gemini
```

The last three commands are **no-network** and intentionally exit **2** (blocked/dry-run). Never paste `.env`, environment variable values or output of `Get-ChildItem Env:` into chat. No file/config mutation is needed. `npm test` is CI-equivalent local regression, not third-party validation.

## Only after the owner separately approves real provider calls
1. In the PayPal [Developer Dashboard](https://developer.paypal.com/dashboard/), manually confirm Sandbox REST app + linked **Business** merchant and distinct **Personal** buyer. Credentials should be provided privately through a secure local environment and should never enter chat/commits. A first narrow OAuth-only call does NOT require buyer login and **does not create/capture an order**.
2. **If and only if** owner explicitly authorizes one Sandbox OAuth call with no order operation, run locally:
   ```powershell
   node scripts/p0_one_shot_probe.mjs --paypal --execute --owner-authorized
   ```
   Requires locally present `PAYPAL_SANDBOX_CLIENT_ID`, `PAYPAL_SANDBOX_CLIENT_SECRET`. Only `https://api-m.sandbox.paypal.com/v1/oauth2/token` receives a credential exchange, at most once. If the response is valid, output `SANDBOX_OAUTH_REACHED`; no token is persisted or printed. It **does not confirm** the merchant/buyer/order flow, and cannot replace Orders GET/capture testing. No Live fallback, no retry.
3. In [Google AI Studio](https://aistudio.google.com/apikey), manually verify that the private project and chosen model are in its currently usable **Free** tier, with quota. The current official [pricing table](https://ai.google.dev/gemini-api/docs/pricing) lists `gemini-3.5-flash-lite` with free input/output on eligible Free tier projects **but a paid-tier project may still incur charges**. Do not connect billing, upgrade, use actual customer text or claim automatic free-eligibility detection. Free-tier content may be used to improve Google services; use only the static fake prompt in the probe.
4. **If and only if** the owner confirms project-level Free tier and separately authorizes one external AI request, run locally:
   ```powershell
   node scripts/p0_one_shot_probe.mjs --gemini --execute --owner-authorized --free-tier-confirmed
   ```
   Requires privately configured `GEMINI_API_KEY`. Uses `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent`, fixed synthetic prompt, `maxOutputTokens=96`, one POST only. Success `GEMINI_TEXT_GENERATED` confirms a shape-validated generated text signal but the script **cannot attest free project tier, zero charges, or human-approval UI integration**.
5. Sanitized evidence: retain only GitHub commit SHA, local UTC/KST date, selected provider, HTTP status, script status and manual Free tier/Business/Personal yes/no facts. *Never* store the raw access token, request headers, provider response, generated text, test user email or private account data.
6. Even if either probe succeeds, **do not mark D03 DONE**. Real Sandbox buyer approval/order create/capture and a verified real AI price draft integrated into the approved quote workflow are independent acceptance stages, requiring separate consent and evidence. D04 real-free-AI checklist remains blocked until an actual response is observed.

## Safety and audit
- CLI with no explicit owner flags has zero network requests even if credentials are accidentally configured. The code is neither an automation nor a web API endpoint.
- The owner consent flags are declarations by the *human invoking the command*; they do not cryptographically authenticate an account or establish legal authorization. The user remains responsible for choosing a key/project with suitable permissions, and the provider can enforce additional limits.
- One external call might still result in service use or billing if the account is paid. **Do not run the Gemini `--execute` command on an uncertain project.**
- Use the repo's `npm run preflight:p0` to check variable *names/presence* without reading values; it will not confirm account validity and returns code 2.
- `Node --experimental-sqlite` is required for the full mock test suite; the narrow one-shot script itself uses Node 22+ standard library only.

## Evidence / release status
- [GitHub Actions #40087887623](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40087887623) @ `efeb9a9e587cb6eddae52dfeeb045acaf05c1571`: **Node 251/251, local Chromium, master schedule 18-day check PASS**.
- Actual PayPal Sandbox authenticated call: **NOT_TESTED**.
- Actual Gemini API/eligibility: **NOT_TESTED**, project Free tier **NOT_VERIFIED**.
- Customer funds, Live, real card, cloud deploy, subscription: **NOT_TESTED** and **not authorized**.
- D03 remains 0% BLOCKED, D04 80% PARTIAL, D15 20% PARTIAL; planned D15 remaining 5h base / 10h inclusive safety, elapsed not measured.

## Up-to-date provider references consulted
- PayPal OAuth: https://developer.paypal.com/api/rest/authentication
- PayPal sandbox vs Live endpoint: https://developer.paypal.com/api/make-api-requests
- PayPal REST and sandbox accounts: https://developer.paypal.com/api/get-started/
- Google Gemini generateContent endpoint: https://ai.google.dev/api/generate-content
- Google Gemini API key setup and security: https://ai.google.dev/gemini-api/docs/api-key
- Google Gemini tier/quotas and charges: https://ai.google.dev/gemini-api/docs/billing and https://ai.google.dev/gemini-api/docs/pricing

## Next READY
Await owner dashboard confirmation and separately scoped test permission. If not available, preserve BLOCKED_EXTERNAL and improve submission reproducibility without expanding synthetic Cloudflare/D1. After approved real access, obtain sanitized API evidence and update the P0 checklist strictly from real provider responses, never from fixture CI.

## 2026-10-24 durable probe attempt fence
The original CLI executed one call per invocation but could be invoked again, potentially spending more AI quota. The new owner CLI uses a private per-provider atomic file at the user's home under `.paypal-hackathon-owner-probe` (`sandbox-oauth.claim` or `free-ai-text.claim`). Exclusive creation and fsync happen before the HTTP call; a restart or ambiguous failure never auto-releases it. No secrets, tokens or response bodies enter the marker. A dry-run or missing prerequisite does not create the marker. On `PROBE_ALREADY_CLAIMED_NO_RETRY`, do NOT delete the private marker and retry without checking provider account activity and separately authorizing the next attempt. Local file claims are not a billing-account-wide quota and cannot attest actual Free Tier. Fixture tests have no real HTTP.

## Model access review, 2026-10-24
Google's current [model directory](https://ai.google.dev/gemini-api/docs/models) limits Gemini 2.5 models for new projects. We now pin the stable candidate `gemini-3.5-flash-lite` in both the private Gemini quote adapter and the owner one-shot probe; [public pricing](https://ai.google.dev/gemini-api/docs/pricing) lists a Free Tier for it, but actual project availability, quota, billing tier and **zero-charge operation are NOT VERIFIED**. Owner must confirm project Free Tier and model access before any authorized request. Errors 403/404/429 stop without retry or switching to a paid model. A blocked/unknown attempt must not be repeated by bypassing the permanent local claim.
