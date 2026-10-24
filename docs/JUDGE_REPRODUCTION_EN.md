# PayPal Freelancer Agent — Reviewer Reproduction Guide (Draft)

**This is an honest OFFLINE/SYNTHETIC demonstration, NOT a completed real PayPal + generative AI contest entry.** The browser shows a local proof of the quote/approval, contract/milestone and subscription *interface*. The real PayPal Sandbox Business/Personal and actual AI generator are still awaiting independent verification. Do not interpret local tests as payment confirmation.

## Current verified scope

- Root [MIT LICENSE](../LICENSE) is present and approved; `package.json` says `MIT`.
- `lead/paypal` holds the current working source. The `main` branch is **not** asserted to be equivalent to the current lead.
- GitHub Actions verifies `npm test`, the 18-day dashboard and an actual Chromium **localhost** UI journey. The CI logs contain the exact SHA/results; they do **not** prove third-party API integration, production authentication or Devpost submission.
- This demo uses SQLite and a loopback Node server. No npm package installation or developer credentials are needed to run the offline demo.

## Linux / macOS terminal

```bash
git clone https://github.com/hibi89/hibi89-paypal-ai-hackathon.git
cd hibi89-paypal-ai-hackathon
git switch lead/paypal
node --version
npm test
python3 render_master_progress.py --check
npm run preflight:submission
npm run demo
```

## Windows PowerShell

```powershell
git clone https://github.com/hibi89/hibi89-paypal-ai-hackathon.git
Set-Location hibi89-paypal-ai-hackathon
git switch lead/paypal
node --version
npm test
python render_master_progress.py --check
npm run preflight:submission
npm run demo
```

**Prerequisites:** Node.js 22 or newer, Git, and Python 3 to check the generated progress dashboard. `npm test` invokes Node's `--experimental-sqlite` local driver and built-in test runner. No PayPal account, API keys, paid plan, additional server or production database is required for this offline walkthrough.

`npm run preflight:submission` reports **SUBMISSION_BLOCKED_EXTERNAL_EVIDENCE** and intentionally exits code **2**, even when the offline assets all exist. The tool makes zero API calls and does not perform or authorize the final Devpost submission. Its blocked result is expected until verified real provider/entry evidence exists.

`npm run demo` prints an exact URL similar to `http://127.0.0.1:PORT`. Open **the printed URL**, with your browser on the same computer. Do not publish the Node loopback server behind an internet tunnel, reverse proxy, Cloudflare Worker or public network address. Stop the process with Ctrl+C.

## Safe walkthrough (synthetic only)

1. Inspect the initial quote and version in the local page. Click the draft control. This is an `OFFLINE_MOCK` deterministic suggestion, **not a real language model response**.
2. Enter an approved amount and explicitly check human approval; verify the latest version and amount show `APPROVED`.
3. Revise the quote and verify the previous approval is invalidated. Reapprove the new version before creating a contract.
4. Create a contract and submit milestone deliverables. Inspect the local review state, rejection/revision/acceptance and event log. The headless E2E includes a **special test-only reviewer cookie** created by the runner; do not infer production-grade user authentication from it. The interactive manual demo may not expose a separate reviewer login.
5. Inspect subscription lifecycle states, failure and local recovery. These are **synthetic state machines**, not PayPal billing subscriptions.
6. Refresh the page and use read-only status controls. The client must not issue a payment POST merely because the page refreshed. The quote/contract payment state remains **NOT_CAPTURED** and subscription payment verification remains **NOT_VERIFIED**.
7. Select payment status. The browser must not initiate any real PayPal Orders create or capture operation. Live/capture routes intentionally fail closed.

## Optional automated browser journey

The `tests/browser_offline_e2e.py` test launches Chromium on **127.0.0.1** and validates versioned approval, read-only refreshes, duplicate submission handling, contract lifecycle, synthetic reviewer actions and subscription scenarios. GitHub Actions installs browser test tooling and runs this on a private runner. To run manually, use a properly configured Playwright Python environment and installed Chrome/Chromium; this browser test is not part of the zero-install Node suite.

## Owner-only, separately authorized third-party evidence

The [P0 prerequisite guide](technical/PPL_P0_REAL_PROVIDER_UNBLOCK_20261024.md) distinguishes a PayPal Sandbox REST app, linked Business merchant and distinct Personal buyer, as well as an AI Studio project with verified Free tier.

The [one-shot owner probe instructions](technical/PPL_P0_OWNER_ONE_SHOT_REAL_API_PROBE_20261024.md) explain Sandbox-only OAuth and one eligible Free-tier Gemini text generation. Those two probes are **dry-run by default**, were not used to establish this offline reviewer guide, and do not create/capture any PayPal order. They also cannot independently verify account tier, a real merchant/buyer workflow or AI quoting integration. Never share credentials, OAuth tokens, private customer information or API keys with reviewers.

## Missing evidence and release gates

| Gate | Reality as of 2026-10-24 | Proof needed |
|---|---|---|
| MIT license / offline instructions | Root license and guide available | Reviewer repeats clone/commands |
| Real PayPal Sandbox OAuth + Business/Personal | BLOCKED / NOT_TESTED | Privately approved authenticated Sandbox result, plus buyer flow, create/approval/capture and independently verified GET |
| Genuine AI response | NOT_TESTED | Free-eligible account/model, one actual generated text response integrated into approved quote flow |
| Public/reviewer authenticated production path | NOT_TESTED | Real identity, data durability, secure roles, restart/refresh and remote browser evidence, **if deployment is chosen** |
| Final video | NOT_FILMED | Owner-reviewed under-three-minute English video and public link |
| Devpost entry | NOT_SUBMITTED | Owner-approved submission and receipt/link |

There is no evidence of real money movement, Live PayPal, production D1, a real AI provider call, a public production URL, video publication or completed Devpost entry. A green local CI run is **only** engineering quality evidence. The [submission evidence preflight](../scripts/check_submission_evidence.mjs) keeps this distinction explicit.

**Owner authorization is required** before any real provider requests, account/billing changes, public deployment, video release or final contest submission.
