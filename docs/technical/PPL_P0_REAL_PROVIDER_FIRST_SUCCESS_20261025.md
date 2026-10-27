# P0 FIRST REAL PROVIDER SUCCESS — 2026-10-25 KST

## Source and scope of evidence
The user provided **sanitized local PowerShell output**, not credentials, from the one-shot CLI in `hibi89/hibi89-paypal-ai-hackathon`, branch `lead/paypal`. The assistant did **not** independently make these provider requests or inspect their tokens. The owner had expressly approved one Sandbox-only OAuth request and one owner-confirmed Free-tier Gemini synthetic text call. Each command was executed exactly once according to the provided outputs:

| Provider | Explicit CLI status | HTTP | networkCalls | externalEvidence | Meaning |
|---|---|---:|---:|---|---|
| PayPal Sandbox | `SANDBOX_OAUTH_REACHED` | 200 | 1 | true | PayPal Sandbox OAuth token response shape passed the protected parser |
| Gemini | `GEMINI_TEXT_GENERATED` | 200 | 1 | true | One actual synthetic text response from `gemini-3.5-flash-lite` parsed successfully |

Both outputs show `credentialsReported:false`. No credential/token or model output is reproduced in this document or the progress ledger; no API key was ever supplied to the assistant. The project previously passed GitHub Actions [#40107826163](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40107826163) for **offline** regression only. This new provider evidence comes from the user-operated local PowerShell commands, **not** GitHub CI.

## Accounting without overclaim
- **PPL-D03: 65% PARTIAL**: account precheck **20/20** (dashboard screenshots), actual Sandbox OAuth **25/25** (single verified-shape response), one Gemini actual text call **20/20** (owner-confirmed Free Tier flag + HTTP 200), **0/35** buyer-approved Orders create/GET/capture. The owner has not shared independent project billing receipt, model quota or charge detail. The Free Tier claim is owner-confirmed, not independently attested by API response.
- **PPL-D04: 80% PARTIAL unchanged**. One artificial prompt generating one real text sentence does **not** prove the app's genuine AI quote generation, bounded pricing, validation, human approval and UI integration.
- **PPL-D15: 20% PARTIAL unchanged**; no Cloudflare/D1/remote HTTPS session/deployment. D16-D18 0%.
- Total planned 18 days: DONE12 / PARTIAL3 / BLOCKED0 / NOT_STARTED3. Day progress is not overall hackathon progress. Times remain planned estimates (D03 remaining 2h base / 5h incl safety), with **actual elapsed NOT_MEASURED**.
- Real-money Live, card/bank details, order/capture, hosting, public demo, YouTube and Devpost have not been performed.

## Required next work
1. On the owner's PC, **do not repeat** `node scripts/p0_one_shot_probe.mjs --paypal --execute --owner-authorized` or its Gemini equivalent: the per-provider one-shot reservation is already consumed, and duplicate testing is neither necessary nor authorized.
2. Plan a **separately approved** Sandbox-only *new test order* for a small synthetic USD quote, aligned with the real Business payee and separate Personal buyer. Keep `PayPal-Request-Id` stable. The currently available one-shot CLI does **not** create an order, nor does it preserve its OAuth token for an order.
3. Before real CREATE/CAPTURE, prove the trusted merchant ID, server-side owner identity, quote amount, safe HTTPS return/cancel callbacks or an equally safe test flow, and a durable operation claim. A redirect URL or browser token alone never authorizes a capture. If POST outcome is uncertain, STOP, reconcile with trusted PayPal GET, never auto-retry POST.
4. Verify specific Gemini key project's Free Tier, model allowance, usage dashboard and permitted quota; then wire the real AI response into quote-specific draft/human-approval, with no paid fallback and new limited user permission for external calls.
5. Store sanitized proof only (provider/status/HTTP/date/checklist); no account emails, merchant IDs, keys, OAuth tokens, response bodies, billing screenshots, or real purchase data in repo/chat.

**Owner's actual authorization was limited to the two already-performed single-call probes.** The next Orders CREATE, checkout/capture, real AI quote generation, hosting, billing upgrades, PayPal Live and Devpost require separate explicit action/approval.

## Cross-references
- [Owner UI access evidence (account existence only)](PPL_P0_OWNER_UI_ACCESS_20261025.md)
- [One-shot source/safety](PPL_P0_OWNER_ONE_SHOT_REAL_API_PROBE_20261024.md)
- [Account setup/security](PPL_P0_REAL_PROVIDER_UNBLOCK_20261024.md)
- [Top-level chief directive](../FROM_HACKATHON_COMMAND.md)
