# PayPal Freelancer Agent — Reviewer Reproduction Guide (Draft)

**This browser demo remains strictly OFFLINE/SYNTHETIC, not a public real-provider application.** Separately, the owner ran one private Windows terminal Gemini skill-classification → Sandbox USD 1.50 buyer approval → Capture → fresh GET on 2026-10-28 and provided output `SANDBOX_PAYMENT_VERIFIED_BY_PROVIDER_GET`. The run is owner-observed evidence, **NOT independently reproduced in GitHub CI**, not a production authenticated marketplace, not a public judge experience, and not a video/Devpost submission. The price was manually approved, **not AI-generated**, and the browser demo still uses offline mock quote drafting. Never confuse localhost synthetic browser outcomes with live third-party payment evidence. The private SQLite receipt can be reviewed safely via `npm run mvp:receipt`, but must NOT be uploaded or reset.

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
npm run verify:local
npm run demo
```

## Windows PowerShell

```powershell
git clone https://github.com/hibi89/hibi89-paypal-ai-hackathon.git
Set-Location hibi89-paypal-ai-hackathon
git switch lead/paypal
node --version
npm run verify:local
npm run demo
```

**Prerequisites:** Node.js **22.5+** (or newer major), Git, and Python 3 to check the generated progress dashboard. Node 22.0–22.4 lacks the built-in experimental `node:sqlite` module used by the demo. `npm test` invokes Node's `--experimental-sqlite` local driver and built-in test runner. No PayPal account, API keys, paid plan, additional server or production database is required for this offline walkthrough.

`npm run preflight:reviewer` is the **green local readiness check**. It starts an isolated loopback instance, performs eight local **GET** smoke requests across the page, session, quote, subscription, integration and evidence read models, including post-rejection state rechecks, and two local **POST rejection probes** against the integration/evidence read models (HTTP 405; no payment endpoint), closes its temporary SQLite-backed server and prints `REVIEWER_LOCAL_READY` with **exit 0** on success. No external PayPal/AI calls, paid services, public ports or payment POSTs occur. The POST rejection probe never creates a payment or changes the synthetic ledger. This result **does not prove** the real providers or final submission. `npm test` then checks Node contracts; `npm run demo` launches the separate interactive page.

`npm run verify:local` is the one-command offline verification: it checks the Git HEAD, Node runtime, generated schedule, Node suite, synthetic MVP, reviewer loopback and—when Python Playwright is installed—the real Chromium UI journey. It strips credential-like environment variables from child processes and records sanitized logs in a temporary directory. On Windows it locates a standard Chrome installation automatically; set `BROWSER_CHROME_PATH` only when Chrome/Chromium is installed in a nonstandard location. Three symlink-rejection cases are reported as **SKIP** on Windows only when the host denies symlink creation; they remain enabled wherever symlinks are permitted.

**Separately, for contest-entry eligibility only**, run `npm run preflight:submission` when reviewing remaining deliverables. It prints **SUBMISSION_BLOCKED_EXTERNAL_EVIDENCE** and intentionally exits **2**, even when the offline demo works. Do **not** place this expected-blocked command ahead of an automated demo sequence or interpret it as an app startup failure. The command makes zero third-party calls and cannot authorize Devpost submission.

`npm run demo` prints an exact URL similar to `http://127.0.0.1:PORT`. Open **the printed URL**, with your browser on the same computer. Do not publish the Node loopback server behind an internet tunnel, reverse proxy, Cloudflare Worker or public network address. Stop the process with Ctrl+C.

## Safe walkthrough (synthetic only)

1. Inspect the initial quote and version in the local page. Click the draft control. This is an `OFFLINE_MOCK` deterministic suggestion, **not a real language model response**.
2. Enter an approved amount and explicitly check human approval; verify the latest version and amount show `APPROVED`.
3. On a proposed quote, enter a reason and select **Reject current quote**. The version displays `REJECTED`; approval is blocked for that version. Draft a revision and verify the new version clears the rejection and requires a fresh human decision.
4. Revise an approved quote and verify the previous approval is invalidated. Reapprove the new version before creating a contract.
5. Create a contract and submit milestone deliverables. Inspect the local review state, rejection/revision/acceptance and event log. The headless E2E includes a **special test-only reviewer cookie** created by the runner; do not infer production-grade user authentication from it. The interactive manual demo may not expose a separate reviewer login.
5. Inspect subscription lifecycle states, failure and local recovery. These are **synthetic state machines**, not PayPal billing subscriptions.
6. Refresh the page and use read-only status controls. The client must not issue a payment POST merely because the page refreshed. The quote/contract payment state remains **NOT_CAPTURED** and subscription payment verification remains **NOT_VERIFIED**.
7. Select payment status. The browser must not initiate any real PayPal Orders create or capture operation. Live/capture routes intentionally fail closed.

## Optional automated browser journey

The `tests/browser_offline_e2e.py` test launches Chromium on **127.0.0.1** and validates versioned approval, read-only refreshes, duplicate submission handling, contract lifecycle, synthetic reviewer actions and subscription scenarios. GitHub Actions installs browser test tooling and runs this on a private runner. To run manually, use a properly configured Playwright Python environment and installed Chrome/Chromium; this browser test is not part of the zero-install Node suite. On Windows, the runner reads Node's UTF-8 loopback output using a background reader because `select()` cannot wait on Windows pipes.

## Owner-only, separately authorized third-party evidence

The [P0 prerequisite guide](technical/PPL_P0_REAL_PROVIDER_UNBLOCK_20261024.md) distinguishes a PayPal Sandbox REST app, linked Business merchant and distinct Personal buyer, as well as an AI Studio project with verified Free tier.

The [one-shot owner probe instructions](technical/PPL_P0_OWNER_ONE_SHOT_REAL_API_PROBE_20261024.md) explain Sandbox-only OAuth and one eligible Free-tier Gemini text generation. Those two probes are **dry-run by default**, were not used to establish this offline reviewer guide, and do not create/capture any PayPal order. They also cannot independently verify account tier, a real merchant/buyer workflow or AI quoting integration. Never share credentials, OAuth tokens, private customer information or API keys with reviewers.

## Missing evidence and release gates

| Gate | Status reviewed 2026-10-28 | Proof needed |
|---|---|---|
| MIT license / offline instructions | Root license and guide available | Reviewer repeats clone/commands |
| Real PayPal Sandbox OAuth + Business/Personal | OWNER-REPORTED SANDBOX E2E 2026-10-28 | One local Sandbox buyer/create/capture/GET success was owner-observed; independent reviewer-safe confirmation still needed |
| Genuine AI response | OWNER-REPORTED REAL SKILLS CLASSIFICATION | Real Gemini skill extraction succeeded in private CLI; quote draft UI, actual free billing and judge integration still pending |
| Public/reviewer authenticated production path | NOT_TESTED | Real identity, data durability, secure roles, restart/refresh and remote browser evidence, **if deployment is chosen** |
| Final video | NOT_FILMED | Owner-reviewed under-three-minute English video and public link |
| Devpost entry | NOT_SUBMITTED | Owner-approved submission and receipt/link |

The owner supplied evidence of one real Gemini skill-classification call and one PayPal **Sandbox** checkout/capture/GET, but these were not independently reproduced in CI. There is no evidence of real money movement, Live PayPal, production D1, a public production URL, video publication or completed Devpost entry. A green local CI run is **only** engineering quality evidence. The [submission evidence preflight](../scripts/check_submission_evidence.mjs) keeps this distinction explicit.

**Owner authorization is required** before any real provider requests, account/billing changes, public deployment, video release or final contest submission.

