# PPL-D09 local contract/reviewer browser evidence (2026-10-24 KST)

## Functional contract
- `web/contract_client.js` is added to the existing local HTML, separate from quote client. Contract create uses only an approved quote amount and version. User action creates a single synthetic contract/milestone, shows currency and explicitly separate `paymentState` / fulfillment state.
- Owner browser submits evidence (PENDING→SUBMITTED), trusted reviewer browser rejects with reason (SUBMITTED→REJECTED), owner resubmits (REJECTED→SUBMITTED), reviewer explicitly accepts (SUBMITTED→ACCEPTED). `paymentState` remains `NOT_CAPTURED` throughout.
- GET/F5/read-only refresh never causes POST. Create, submit, accept/reject happen only on explicit UI actions. Synchronous button lock prevents duplicate POST; server CAS and event uniqueness remain source of truth.
- Human-readable HTML uses `textContent` for untrusted evidence to avoid injection.

## Reviewer test identity (NOT production)
- The existing local demo has a fixed synthetic owner and is bound to 127.0.0.1. To exercise reviewer UI without a role query/body/header backdoor, `startOfflineDemo({testReviewSessions:true})` generates random 32-byte reviewer cookie; resolver checks via constant-time comparison, rejects forged values.
- `scripts/run_demo.mjs` enables the fixture only with the test runner's temporary file environment variable and writes the ephemeral cookie to mode-0600 file without logging it. Browser Playwright uses a separate isolated context with HTTP-only SameSite=Strict cookie. Temp file is removed on process stop. No real user account, login/session invalidation, or production credentials.
- Synthetic owner default and reviewer test fixture must never be deployed publicly.

## CI
- Code/UI SHA `37ae135c6b5bc463d37ff781757f709cab690050`: [Actions 40070887095](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40070887095) existing tests PASS (before full reviewer E2E).
- Final evidence SHA `9e3ee79aab9e7b2326360fd165c9bb12a575efe2`: [Actions 40071015803](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40071015803) **133/133 Node tests PASS, 0 FAIL, actual Chromium browser E2E PASS**.
- Playwright checks approval/version invalidation, no POST on F5, double-submit only once, owner create/submit, server-issued reviewer separate tab, reviewer reject/resubmit/accept, final ACCEPTED vs NOT_CAPTURED, no PayPal order POST.
- Node added 2 regression tests for test-token forgery/identity, actual local loopback reviewer behavior and append-only events.
- Real PayPal Sandbox account/Orders, actual free AI, production login, public hosting/D1 and Devpost remain NOT_TESTED. Budget cost zero, actual developer elapsed time NOT_MEASURED.

## Next
D10 official Subscription/Webhook compatibility and state-machine research; still no user credentials or region entitlement evidence. Do not represent an offline mock acceptance as real PayPal provider availability.
