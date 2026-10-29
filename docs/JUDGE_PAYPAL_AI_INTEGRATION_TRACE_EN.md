# Proofline — PayPal + Gemini integration code and evidence boundaries

**This is a reproducibility aid, not a live provider receipt or publication authorization.** The localhost marketplace is explicitly synthetic. The owner-only operator has separate real Sandbox/Gemini adapters; CI exercises that same orchestration by injecting fictional transport responses rather than contacting providers.

## Reproduce the actual adapter call order without provider accounts

From the latest approved code checkout, with Node.js >=22.5.0:

```bash
npm run judge:reproduce
npm run judge:evidence
```

Both commands are local-only. Inspect the ignored `output/submission/judge_reproduction_receipt.json` under `reproducibleB.fakeApiProtocol`, and `output/submission/judge_evidence_report.json` under `verifiedFromThisCommand.fakeApiProtocol`.

The fixed allowlisted labels prove that the **real owner orchestration code** invokes injected transport functions in this order:

1. `FAKE_GEMINI_GENERATE_POST` — Gemini-shaped skill classification request
2. `FAKE_PAYPAL_OAUTH_POST` — Sandbox-shaped authentication request
3. `FAKE_ORDER_CREATE_POST` — one USD 1.50 synthetic order bound to the approved quote
4. `FAKE_ORDER_GET_PAYER_ACTION_REQUIRED` — do not capture before buyer approval
5. `FAKE_ORDER_GET_APPROVED` — simulated distinct buyer approval was observed
6. `FAKE_ORDER_CAPTURE_POST` — exactly one simulated Capture after that GET
7. `FAKE_ORDER_GET_COMPLETED` — local injected GET reconciliation

Additional fake OAuth/GET events may occur between these stages. The validator rejects a missing/reordered Capture, unapproved buyer, unexpected endpoint, duplicate write, missing human consent stage, or a forged real-provider status. The sanitized JSON exposes symbolic labels only, never provider IDs, tokens, credentials, private SQLite, full request URLs or user data.

**Five distinct simulated human consent stages** must also be recorded: skill classification, human amount approval, checkout session, order creation, and Capture. These checks are in `src/synthetic_provider_trace.mjs`, called by `src/offline_operator_mvp_smoke.mjs`.

## Inspect the source that would use real providers

| Responsibility | Actual source | Limits |
| --- | --- | --- |
| Gemini API skill classification | `src/gemini_marketplace_provider.mjs` | Owner-authorized, model response restricted to skills |
| AI scope, consent and one-shot reservation | `src/owner_marketplace_ai_service.mjs` | Persistent state; no AI authority over USD amount |
| Human quote approval and private process coordination | `src/owner_mvp_flow.mjs` | Distinct amount and Capture approvals |
| PayPal Sandbox OAuth, Orders, GET and Capture | `src/paypal_sandbox_transport.mjs` | Fixed Sandbox origin; no Live fallback |
| Durable order claims, GET-first reconciliation | `src/owner_pilot_checkout_coordinator.mjs`, `src/sqlite_ledger.mjs` | No blind capture retries |
| Actual private owner execution | `scripts/run_owner_mvp_operator.mjs` | Opt-in TTY + per-stage consent; not a public login or web application |

The fake test uses those same adapter/orchestration modules with an explicit `fakeFetch` implementation. It is more than a static screenshot but is **not** evidence that a reviewer just connected to the provider.

## What was previously observed and what remains unproven

- **A — Synthetic browser:** two categories, quotes, versioned human approval, contracts and reviewer workflow; no Gemini or PayPal network calls
- **B — Injected API contracts:** the source-level lifecycle above with fake Gemini/PayPal response bodies, fake buyer, temporary SQLite; no external calls
- **C — Owner's 2026-10-28 historical Sandbox/Gemini run:** an earlier real provider result was reported by the owner; the private original SQLite can be inspected **read-only** on the original PC using `npm run mvp:receipt`. This confirms local consistency, **not** fresh authenticated PayPal GET or independent provider attestation
- **D — Public release and Devpost:** unapproved/unsubmitted until final public repository, video and Devpost URLs actually exist

For the owner on the original PC, `npm run owner:review:local` prepares a summarized, ignored JSON status without contacting any provider. The owner should never reset the historical private SQLite, replay Capture, share OAuth credentials, or upload private receipt files.

## Optional owner-only fresh Sandbox GET of the *existing* paid test order

A second real Sandbox CREATE or Capture is **not** necessary to check the status of an already-recorded historical order. The official Orders v2 `GET /v2/checkout/orders/{id}` interface permits inspecting an existing order using an OAuth bearer token. [PayPal Orders v2](https://developer.paypal.com/sdk/orders/v2/orders-get/) · [PayPal OAuth](https://developer.paypal.com/api/rest/authentication).

**Default `npm run owner:sandbox:get:optional` is blocked and makes zero network calls.** It does not read credentials or SQLite unless the owner separately chooses to run the command on the original Windows machine with all four explicit flags and types the interactive authorization phrase:

```powershell
npm run owner:sandbox:get:optional -- --execute --owner-authorized --sandbox-only --existing-order-get-only
```

The *optional, explicitly authorized* command first checks the existing private Gemini+PayPal audit data with SQLite immutable + read-only mode, then allows **at most one Sandbox OAuth POST (not a payment)** and **one Sandbox Orders GET**, using the PayPal Sandbox origin only. Any Orders CREATE, Capture, PATCH, refund, Gemini request, extra GET, Live host or automatic retry is blocked. The provider order/capture identifiers and sensitive response remain in memory, not stdout, repository, or output artifact. The returned summary reports only whether authenticated GET matches the prior USD 1.50 approved quote, merchant, completed status and historical capture ID. It does not prove the owner's historical Gemini request was independently run and does not authorize Devpost publication.

**No provider calls were made by the development assistant or CI.** Even if the owner later obtains a confirmed GET, that is an owner-device observation rather than a third-party-signed audit or a judge-reproducible live app. Do not distribute Sandbox credentials, buyer account login, order IDs or private databases. The owner may choose not to perform the optional external request.

**Remaining hackathon risk:** the official rules require an app with PayPal developer platform integration central to the AI project and a working judge-accessible build. This evidence distinguishes code paths but does **not** substitute for an owner-approved, genuinely reviewer-reproducible PayPal + Gemini Sandbox flow.

[Official rules](https://paypalaihackathon.devpost.com/rules) · [Owner release checklist](FINAL_OWNER_SUBMISSION_CHECKLIST_20261030.md)
