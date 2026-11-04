# P0 — REAL PayPal Sandbox + Free-tier AI unblock instructions (2026-10-24 KST)

## Supervisor directive and actual state
**Highest priority:** the [ACTIVE chief directive](../FROM_HACKATHON_COMMAND.md) asks for proof of one real PayPal Sandbox OAuth/Orders buyer transaction and at least one real AI text generation, without secrets leaked, money charged, Live transactions or a premature Cloudflare deployment.

**As of this file:** D03 `0% BLOCKED` (real PayPal Business/Personal + real free AI), D04 `80% PARTIAL` (last 20% real AI unverified), D15 `20% PARTIAL` (offline hosting/D1 planning only). GitHub Actions Node synthetic tests and Chromium localhost **are not third-party evidence**. No real PayPal Developer app, Sandbox account, Gemini project or linked secrets were inspected, and no actual provider HTTP request occurred.

The following is a **one-time human account setup checklist**, not an automated action or proof that these accounts exist. Account creation, permissions, settings, paid upgrades, provider requests and secrets remain the owner's decisions. The user must never send API keys, client secrets, buyer passwords, session cookies or OAuth access tokens to chat or GitHub.

## A. PayPal Developer Sandbox: owner-only setup
1. Open **https://developer.paypal.com/dashboard/** in the owner's browser and sign in to an authorized PayPal Developer account. Select **Sandbox**, NOT Live.
2. In **Apps & Credentials**, confirm a *Sandbox REST API app* and its associated Business merchant. The **Client ID** and **Secret** are for the same sandbox app; verify the app is linked to the intended sandbox Business account. Use an existing app when suitable; creating an app or changing permissions remains owner action. Do **not** enable Live or unrelated Payouts/Vault/production permissions.
3. In **Testing Tools → Sandbox Accounts**, confirm one **Business** (merchant/seller) and one **Personal** (buyer) sandbox test account. Accounts are synthetic PayPal test accounts; their email/password are different from the REST app credentials. If either is absent, the owner may create one. Keep buyer credentials in PayPal Developer Dashboard or a private secret manager; do not transmit them here.
4. Use a private browser session for the Personal sandbox buyer at **https://www.sandbox.paypal.com/** when a later authorized test requires buyer approval. Keep merchant and buyer roles separate. Never enter a real card or real bank detail.
5. After separate approval for real provider calls, validate **only** `https://api-m.sandbox.paypal.com`: exchange REST app Client ID + Secret for OAuth access token via `POST /v1/oauth2/token` with `grant_type=client_credentials`. Record only HTTP success/failure, sandbox environment, timestamp and generated evidence ID; **never log/store the bearer token**. If the app is not linked to the intended merchant, stop.
6. Authorized test sequence: create exactly one disposable USD test order through `POST /v2/checkout/orders` with the ledger's immutable approved quote amount and `PayPal-Request-Id` idempotency key; buyer approves in sandbox; backend `GET /v2/checkout/orders/{id}` checks **order ID/intent, merchant/payee, reference ID, USD amount, status**; capture is **one operation claim** only, then fresh GET proves a COMPLETED capture. No blind retry after network ambiguity. Manual or self-initiated real provider calls are NOT part of `npm run preflight:p0`.
7. Required non-secret evidence to record privately: Sandbox app present? (yes/no), merchant/buyer present? (yes/no), OAuth status and timestamp, one sanitized order ID if the owner approves evidence logging, buyer approval and capture GET result, exact amount match, failure details without personal identifiers or tokens. Only after those are verified may D03's corresponding acceptance checks change to VERIFIED.

**Never:** use `https://api-m.paypal.com` (Live), real cards, actual money, purchaser private data, browser redirect values as authorization proof, or a public checkout site without production user authentication.

## B. One candidate actual AI provider — Google Gemini API *only if truly free for this project*

**2026-10-24 compatibility update:** Google's [current model directory](https://ai.google.dev/gemini-api/docs/models) limits 2.5 models to prior users. This repo now pins `gemini-3.5-flash-lite` for both owner one-shot and quote adapter, as recommended for new projects. The [public price table](https://ai.google.dev/gemini-api/docs/pricing) has a Free Tier entry, but does not establish this owner's project free-billing status or quota. Verify in AI Studio before allowing `--free-tier-confirmed`. No fallback to a paid model.
1. In the owner's browser visit **https://aistudio.google.com/apikey**. Use a project with **Free** usage tier that is eligible and active. Current free model, RPD/RPM/TPM limits and access vary by project/model/region and must be checked under the project's **Billing Tier**, model availability and usage dashboards; not all projects are eligible for a free tier.
2. **Do not click Set up billing or link a payment method** just to force this step. If the only available project or model requires Paid Tier / billing, record **BLOCKED_NO_FREE_AI**, choose a permitted alternative, and request a separate owner decision before any cost. A trial/free quota is not guaranteed indefinitely.
3. Create or use an authorized **Gemini API auth key** for the Free project. Restrict its handling and application scope as supported by the provider; keep it only in a local secret store/current trusted process. Never store in repository, screenshot, chat, browser client bundle, request URL, CI logs, or demo pages.
4. After separate owner authorization for a real AI request and confirming a truly zero-charge model, run **one** short non-sensitive text generation with the currently eligible model through the official Gemini API/SDK. Use a synthetic quote scope such as “Prepare a short draft scope for a website landing page” — no customer identifiers. Validate that a response is truly generated, not `OFFLINE_MOCK`; store provider/model family, date, outcome and usage tier without text secrets or key.
5. Only after genuine response evidence should the `PPL-D04 REAL_FREE_AI_PROVIDER` 20-point criterion be considered for verification. Integrating real AI response into the human-approved quote UI requires separate testing of bounds, validation and actual free limits; do not mark this criterion with only an environment variable present.

**AI free-tier data note:** Google's Free tier may allow data use to improve products; use **synthetic prompts only** and review the current policies before uploading proprietary user material.

## C. Windows PowerShell — local *presence-only*, no network, no provider account changes
Within an up-to-date local clone of `hibi89/hibi89-paypal-ai-hackathon` / branch `lead/paypal`:

```powershell
npm run preflight:p0
```

Expected result without local variables: missing `PAYPAL_SANDBOX_CLIENT_ID`, `PAYPAL_SANDBOX_CLIENT_SECRET`, `GEMINI_API_KEY`; status `EXTERNAL_PROVIDER_EVIDENCE_REQUIRED`; **exit code 2 is intentional**, not an application defect.

**If** the owner has a separate, secure local method for supplying credentials to a private process, the tool reads only their **names/presence** from the current process environment. It never prints values and never contacts the provider. Setting them is **NOT** permission for ChatGPT, scripts or GitHub Actions to perform a real call.

Environment names for an eventual *private and owner-authorized* integration:

```text
PAYPAL_SANDBOX_CLIENT_ID
PAYPAL_SANDBOX_CLIENT_SECRET
GEMINI_API_KEY
```

- Existing `.gitignore` blocks `.env` / `.env.*` other than `.env.example`. No secrets are written or needed for this P0 check.
- Do not `echo` environment variables, paste screenshots or include `curl -v` output; OAuth headers and tokens can leak in verbose logs.
- Treat any result saying `LOCALLY_PRESENT_NOT_VERIFIED` as **still blocked**. The CLI always returns code 2 until external evidence is gathered by a separate, explicitly authorized, real backend test. The command **does not** call PayPal, AI, Cloudflare or any outside API.

## D. Exactly what to report to the PayPal lead without sharing secrets
Use these **non-secret yes/no facts**:
1. **PayPal Developer Dashboard** login available? Sandbox REST app with matching Business merchant? Separate Personal buyer sandbox account?
2. **Gemini AI Studio** project has a **Free** Billing Tier? Eligible text model and nonzero free quota visible? API key exists **privately**?
3. **Permissions:** May the lead perform narrowly-scoped real **Sandbox-only OAuth/GET** (before any create/capture) and **one free-tier AI text call** from a separately secured local environment? This decision does **not** approve public hosting, PayPal Live, actual money, adding billing or entering secrets in chat.

Once (1) and (2) are established privately, the developer can prepare a one-shot restricted validation command. Record test result and sanitized receipts in GitHub. If access is missing, mark blockers and do not substitute mocks. No pressure to create accounts or enable paid billing.

## 2026-11-01 update — first-party pilot is NOT third-party marketplace authority

Verified against PayPal's published REST documentation (no owner account inspection, calls or permission change):
- https://developer.paypal.com/api/make-api-requests distinguishes **first-party/direct merchant** calls for your own business and **third-party/platform** calls on behalf of another merchant. An app Client ID + Secret, a synthetic merchant ID, or successful first-party OAuth/GET does NOT by itself prove that a platform may receive or direct payments for unrelated sellers.
- https://developer.paypal.com/api/rest/authentication documents client credentials OAuth at Sandbox, not seller identity or a multi-merchant mandate.
- https://developer.paypal.com/api/rest/integration/orders-api describes separate Create/GET/Capture operations. They are not interchangeable with buyer approval and merchant/platform authorization.

**Current offline guard:** `npm run preflight:p0` now reports `paypal.merchantAuthority.directFirstParty`, `.platformThirdParty`, `.appMerchantOwnership`, and `.sellerAccountOwnership` as **NOT_VERIFIED** even when all local credential *variable names* are present. All activation flags remain false, and untrusted environment hints (`PAYPAL_PLATFORM_APPROVED`, `PAYPAL_MERCHANT_ID`, `OWNER_AUTHORIZED`) are ignored. Tests assert this fail-closed behavior. This is a reporting contract, NOT PayPal OAuth/account attestation or an executable access policy.

**Two implementation tracks, subject to owner approval before provider calls:**
1. **First-party owner-only Sandbox pilot:** Existing verified owner session proof + one immutable approved USD test quote + intended **same sandbox app Business merchant**; check dashboard binding and merchant identity first, then narrowly approved one-order flow. It cannot prove that arbitrary freelancers' merchant accounts are allowed.
2. **Multi-merchant marketplace:** Separately verify platform integration requirements, seller onboarding/merchant consent and PayPal's permissions for third-party calls. Do not silently reuse a first-party OAuth token to collect on behalf of independent sellers. If missing, show "NOT_VERIFIED" and keep Part1 marketplace matching, contracts and Part2 synthetic innovation operating without real settlement.

The added preflight fields are static audit flags only: no account credentials or data are read beyond existing local presence checks, no browser auth configuration or actual provider endpoint is changed. No Sandbox POST, Live operation, user data or paid product is authorized.

## E. Verification gates and safe stop conditions
| Gate | Current | Required proof | Failure response |
|---|---|---|---|
| PayPal Sandbox merchant/buyer | NOT_VERIFIED | private Dashboard confirmation | keep D03 BLOCKED |
| PayPal real OAuth | NOT_TESTED | Sandbox-only 2xx without leaking token | stop on 401/403, no Live fallback |
| Orders GET/capture | NOT_TESTED | authorized test order, verified merchant/amount, one capture+GET | UNKNOWN and no duplicate POST |
| Free AI project/model | NOT_VERIFIED | Free tier eligibility and zero-charge model | stop if billing/upgrade required |
| Real AI text | NOT_TESTED | actual provider response with sanitized receipt | D04 last 20% remains BLOCKED |
| Cloudflare/D1 | NOT_TESTED | separate approval and verified deployment tests | defer; local reviewer path remains |

**Official references (verified 2026-10-24):**
- PayPal REST start and Sandbox accounts: https://developer.paypal.com/api/get-started/
- PayPal Sandbox OAuth: https://developer.paypal.com/api/rest/authentication
- PayPal Sandbox vs Live URLs: https://developer.paypal.com/api/make-api-requests
- Gemini AI Studio API key: https://ai.google.dev/gemini-api/docs/api-key
- Gemini billing and Free restrictions: https://ai.google.dev/gemini-api/docs/billing
- Gemini rate limits (verify in project): https://ai.google.dev/gemini-api/docs/rate-limits
- Gemini text-generation REST or SDK: https://ai.google.dev/gemini-api/docs/text-generation/

## Chief response
- **ACCEPTED:** P0 actual PayPal+AI evidence outranks synthetic Cloudflare/D1 expansion.
- **IMPLEMENTED_VERIFIED_OFFLINE:** `src/p0_provider_readiness.mjs`, `scripts/check_p0_provider_readiness.mjs`, `tests/p0_provider_readiness.test.mjs`. Check reports only local presence and never assumes proof.
- **BLOCKED_EXTERNAL:** real Sandbox Business/Personal access, actual OAuth/Orders proof, Gemini free-tier eligibility and real generated text. Accounts/credentials/customer data not accessed or shared.
- **Next:** user-side private confirmations and explicit real provider call authorization; then tightly scoped real evidence. D03=0%, D04=80%, D15=20% until real proof.
