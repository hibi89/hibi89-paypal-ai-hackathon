# Part 2 Gemini A2A private operator pilot — 2026-10-31 KST

## Model and price evidence (NOT account verification)
- Official stable model gemini-3.5-flash-lite and structured output support: https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite
- Official price listing for Gemini 3.5 Flash-Lite Standard Free Tier shows input and output tokens free of charge, while Paid Tier has chargeable pricing. Free Tier data may be used to improve Google products: https://ai.google.dev/gemini-api/docs/pricing
- Actual model/RPM/TPM/RPD/Free Tier eligibility varies by project and must be manually checked in Google AI Studio before sending a provider request: https://ai.google.dev/gemini-api/docs/rate-limits
- No owner account/billing/credential has been accessed or verified this turn. No live API requests were sent. NEVER send customer/PII/payment secrets through the pilot.

## Commands
- Safe offline default: npm run pilot:gemini:a2a ; prints JSON readiness, reads no API key, opens no SQLite, sends 0 requests.
- OPTIONAL only after owner separately authorizes a synthetic real provider trial and verifies actual Free Tier/model quota: npm run pilot:gemini:a2a -- --execute --owner-authorized --free-tier-confirmed
- Use an interactive private terminal with GEMINI_API_KEY in process environment, never committed. Exact additional typed phrase: AUTHORIZE GEMINI A2A FOUR CALLS.
- No flags or non-TTY execution cannot touch provider. Typed consent denial performs no API call.

## Financial, transport and replay boundaries
- Private server-side CLI is not mounted to the browser server or production. It only generates synthetic Buyer/Seller price negotiation text; no PayPal order, capture, subscription or invoice action.
- Maximum four role turns/model calls, max 3000 measured tokens per in-memory negotiation, SQLite preclaims 2560 reserved tokens per call, daily actor/merchant cap 8 claims / 20480 reserved tokens.
- Durable local SQLite path: ~/.paypal-ai-pilot-private/gemini-a2a-one-shot.sqlite . Single fixed one-shot job key. A claim survives failure/crash; UNKNOWN or prior claim means no automatic retry. Never delete ledger to bypass a claimed call.
- Source: scripts/run_owner_gemini_a2a_pilot.mjs, src/owner_gemini_a2a_pilot.mjs, src/gemini_a2a_durable_roles.mjs, src/gemini_a2a_budget_store.mjs. Existing normal browser/demo stays offline deterministic.
- Results always distinguish test-injected transport from actual provider attestation: realGeminiVerifiedByThisRun=false, accountFreeTierVerifiedByThisRun=false. A provider POST response is not financial consent.

## Verification
- Feature SHA: 01b4a8a4196ac1ae97a1ef30d8e9646b505374b2.
- https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/41204629305 : full CI success, 674 Node tests pass, 0 fail, 0 skip; five existing Chromium E2E journeys plus Windows first-run pass.
- https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/41204629294 : smoke run, check actual completed conclusion before claiming success.
- NOT verified: real Google API key/project quota/access/model output, actual live agent conversation, any PayPal Sandbox or Live capture, production deployment, Devpost publication.

## Next
- Wait for separate explicit owner authorization and private account Free Tier verification before a single live synthetic A2A call. Validate model output/API response and account billed usage safely, log proof without credentials.
- Complete Part1 real buyer/seller/merchant authorization and Part2 five actual modules; video remains last.
