# Gemini new-project P0 model audit — 2026-10-24 KST

## Confirmed public source limitation
The project hardcoded `gemini-2.5-flash-lite` in two distinct private code paths. Google's [official model directory](https://ai.google.dev/gemini-api/docs/models) now says access to Gemini 2.5 series may be restricted for new projects and explicitly recommends 3.5 Flash-Lite or 3.8 Flash. The [official 3.5 Flash-Lite model page](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) lists `gemini-3.5-flash-lite` stable. [Pricing](https://ai.google.dev/gemini-api/docs/pricing) lists Free Tier input/output for this candidate; **project tier, available quota and actual zero billing are unverified**.

## Applied limited fix
- Central immutable candidate `src/gemini_p0_model.mjs` exports a fixed model and fixed Google endpoint.
- Both `src/p0_one_shot_probe.mjs` and `src/gemini_quote_provider.mjs` import the identical endpoint; owner probe reports correct model.
- No caller-controlled endpoint/model or automatic fallback to legacy/paid model, and no discovery API call.
- The existing Free Tier declarations, owner flags, credential requirement, permanent one-shot local attempt claim and SQLite one-attempt AI quote reservation remain unchanged.
- Regression tests assert URL consistency and fail-closed response on 404 without a second request.

## Owner-only next action, not performed
In AI Studio, privately verify selected API project is Free, that `gemini-3.5-flash-lite` is accessible, and that free quota is nonzero. Do not enable billing or put API keys in GitHub/chat. A single synthetic API call is only permitted after separate owner approval; OAuth, purchase unit buyer approval and actual PayPal capture remain separately blocked. Do not label synthetic tests or a public price list as real provider evidence.

## Current truth
Real Gemini requests 0, real PayPal requests 0, deployment/submission 0. D03 0% BLOCKED; D04 80% PARTIAL; D15 20% PARTIAL (remaining base 5h/safe 10h; measured time null); D16–D18 0. CI pending for exact source commit.
