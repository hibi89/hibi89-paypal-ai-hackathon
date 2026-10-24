# PayPal Freelancer Agent — Reviewer Reproduction Guide (Draft)

**Status: offline, synthetic local demonstration only. NOT yet an eligible live PayPal + AI implementation.**

## Preconditions

- Clone the public repository and check out `lead/paypal` (the current working branch).
- Install Node.js 22 or newer and Python 3 for the master progress validator. No paid services, database server, API keys, or npm install are required for the offline Node suite.
- Run `npm test`. This invokes Node's built-in test runner and the local SQLite driver.
- Run `python3 render_master_progress.py --check` to validate the full 18-day status dashboard.
- Run `npm run demo`; open the exact `http://127.0.0.1:<port>` URL printed by the command, using the same computer. Do not expose a reverse proxy, tunnel or public host.

## What the offline browser can demonstrate

1. Prepare a deterministic draft of a freelancer quote. This is a rules-based `OFFLINE_MOCK`, **not** generative AI.
2. Manually approve the versioned quote and confirm that a revised version invalidates stale approval.
3. Create a synthetic contract with milestones, submit work for review and inspect event history.
4. Simulate subscription active, failure, recovery and cancellation without provider requests.
5. Refresh read-only status views and inspect the synthetic integration projection.

All payment POST routes intentionally fail closed. Contract payment state remains `NOT_CAPTURED`. Subscription states are synthetic and do not establish a PayPal billing agreement.

## Optional browser test

The GitHub Actions job runs `tests/browser_offline_e2e.py` using Playwright/Chromium on loopback. This is distinct from running a production URL or authenticating with a real buyer. Never enter real card or customer data.

## Evidence still missing for a valid entry

- Actual PayPal Developer Sandbox Business merchant and Personal buyer flow, OAuth, create/approve/capture/GET, and signed webhooks;
- A real, permitted zero-cost AI provider response and limits/cost validation;
- Production-grade authentication / hosting or a separately validated reviewer reproduction mechanism;
- Approved open-source LICENSE, English final submission, public video under three minutes, and Devpost receipt.

No URL, sample script or green offline CI should be represented as proof of those external steps.
