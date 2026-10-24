# P0 — Owner-reported dashboard access, not real API proof (2026-10-25 KST)

## Confirmed via user-supplied screenshots and explicit user statement
- PayPal Developer Dashboard is accessible in **Sandbox**, not Live.
- **Apps & Credentials** displays one existing Sandbox REST application (`Default Application`), with Client ID/Secret fields populated but their values were not copied.
- **Testing Tools → Sandbox Accounts** displays **one Business seller** and **one Personal buyer** test account. No account emails, credentials, numbers or identifiers are stored in this document.
- Google AI Studio **API Keys** shows a key under a project marked **Free Tier**. The owner subsequently explicitly confirmed creation of a **separate hackathon API key**. Its value and the exact project association have not been accessed by this agent. Verify that the new key belongs to a Free Tier project before any call.

## Explicitly NOT verified
- Actual PayPal OAuth success, business merchant identity and REST app/merchant binding, live PayPal Orders v2 create/GET/buyer approval/capture, or real-money payments.
- Actual Gemini API response or model-specific quota, rate limit, region availability, or zero-charge request; no credentials have been supplied to any GitHub tool, this chat or a cloud build.
- Checkout HTTPS return/cancel handling, host authentication, public deployment, Devpost submission.
- No external API call occurred in this documentation update.

## Approved safe next sequence on owner's own Windows PC
1. Work from the latest `lead/paypal` repository and keep secrets out of files, screenshots, chat, terminals/CI logs and Git commits.
2. Without credentials, run `npm run preflight:p0` to verify the safe entry point; **exit code 2 is expected** because it does not establish external evidence.
3. Privately set process-scoped `PAYPAL_SANDBOX_CLIENT_ID`, `PAYPAL_SANDBOX_CLIENT_SECRET`, and `GEMINI_API_KEY` to values from their respective Sandbox/Free Tier dashboards; **never paste their values into this conversation**. Use a secret manager or non-echoing prompts, not `setx` or `.env` files in the repo.
4. `node scripts/p0_one_shot_probe.mjs --paypal` and `node scripts/p0_one_shot_probe.mjs --gemini` are dry-runs by default and make **zero** external calls. After an explicit user decision permitting a specific real Sandbox-only OAuth call, see [owner-only one-shot safety](PPL_P0_OWNER_ONE_SHOT_REAL_API_PROBE_20261024.md). For AI, confirm Free Tier project, `gemini-3.5-flash-lite` model and free quota first, then request separate permission for exactly one synthetic text request. No Live, Order POST, Capture, billing upgrade, or deployment permission is implied.
5. Report only sanitized statuses; PayPal Sandbox OAuth does not itself prove buyer checkout or capture. Treat ambiguous outcomes as UNKNOWN and do not retry automatically.

## Source and current completion accounting
- Prior source SHA `9cc221fb0cdeff9ba7703ba62f974e2c22f91a7c` and latest synced branch `a13b60eb1f5a129b5b0965331977de9ef1adaa2e`; latest CI at time of review [#40105474259](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40105474259) reported 325/325 offline Node tests plus Chromium PASS.
- `PPL-D03` **0% BLOCKED** pending *real* PayPal checkout proof; `D04` **80% PARTIAL** pending *real* Gemini response; `D15` **20% PARTIAL** pending runtime deployment gates. 18-day DONE12/PARTIAL2/BLOCKED1/NOT_STARTED3. No change to planned hours and no fabricated measured elapsed time.
- Chief instruction [P0 provider proof first](../FROM_HACKATHON_COMMAND.md) acknowledged: access discovery moves from unknown to user-confirmed, real-provider evidence remains required.

## Official references reviewed
- [Gemini 3.5 Flash-Lite model](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
- [Gemini 3.5 Flash-Lite pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Google API key security and Free Tier billing](https://ai.google.dev/gemini-api/docs/billing)
