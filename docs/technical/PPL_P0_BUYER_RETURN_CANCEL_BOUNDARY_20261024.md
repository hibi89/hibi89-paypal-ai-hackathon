# PayPal P0 buyer return/cancel no-payment safety boundary — 2026-10-24 KST

## Official protocol and limitation
- PayPal Orders v2 documentation specifies buyer `return_url` and `cancel_url` in **`payment_source.paypal.experience_context`**, rather than deprecated root `application_context`. The buyer's redirect is not a trusted paid/captured order record. Sources: https://developer.paypal.com/whats-an-order/ ; https://developer.paypal.com/api/orders/v2/definitions/order_capture_request/ ; https://developer.paypal.com/sdk/orders/v2/definitions/order_request .
- The current product has **no authorized public HTTPS origin, session-bound buyer return/cancel callback or private Sandbox Business/Personal credentials**. Inventing a public URL or assuming the local demo address is externally reachable is prohibited.
- The program already enforces separate manual order create/capture claims with trusted GET evidence at `payment_orchestrator`/`sqlite_ledger`. Query token, PayerID, `paid=true`, return URL hit or cancel URL hit are **never** payment or cancellation evidence.

## Implemented scoped result
1. `src/paypal_buyer_return_boundary.mjs` is an explicit **offline-only** read-only GET projection for paths `/checkout/paypal/return` and `/checkout/paypal/cancel`. It accepts no provider/ledger injection and does not read credentials or call PayPal, create/capture orders, update SQLite or record cancellation. It ignores every untrusted callback query parameter, cookie, Referer, browser status and role header.
2. Both paths return `paymentState=NOT_CONFIRMED`, `orderApproved=false`, `paymentVerified=false`, `retryPost=false`, `providerGetPerformed=false`, `providerPostPerformed=false`, `ledgerMutationPerformed=false`, and an explicit instruction that a separate **authenticated server GET reconciliation** is required.
3. Non-GET requests fail 405; cache private/no-store, Referrer-Policy no-referrer, nosniff, CSP default none / frame none. The actual loopback server mounts these routes behind existing 127.0.0.1-only Host checks and rate limiting.
4. Dedicated and actual loopback HTTP negative tests inject forged `token`, `PayerID`, amount, `status=COMPLETED`, role headers and reviewer cookies, repeat redirects, assert quote state unchanged and payment remains 503, and ensure no query fields are reflected.

## Real integration gate intentionally NOT completed
Before a real Sandbox order create/approval:
1. Owner verifies PayPal Sandbox REST app, **Business merchant and distinct Personal buyer**, and explicitly approves the intended owner-only API call sequence.
2. Obtain an approved public HTTPS origin with **authenticated** buyer/owner session binding and separately valid return/cancel URLs. Plan these URLs under `payment_source.paypal.experience_context`, never trust browser-provided callbacks or route values as ownership.
3. Independent authenticated backend GET checks PayPal order id, merchant, quote, intent CAPTURE, approved amount and status. An explicit CSRF-protected payment capture action plus durable first claim is required before any POST. An authenticated fresh GET showing COMPLETED nested capture is required before PAID.
4. Cancellation only signifies the browser left checkout. It does not prove that a PayPal order was voided or unpaid and must not wipe an existing payment ledger.
5. No real PayPal/Gemini calls, public hosting, customer funds or Devpost were used. D03 0% BLOCKED / D04 80% PARTIAL / D15 20% PARTIAL (5h base, 10h safe, elapsed null), D16–18 0.

## Verified GitHub test evidence
Feature SHA: `c8d364aba216d7456c6002d7b26c29caaf23952f`. [Actions #40103115344](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40103115344): **SUCCESS**, 314/314 Node tests, Chromium localhost integration E2E PASS, master 18-day dashboard PASS. All simulated; no external PayPal, AI, public HTTPS callbacks or user identity validation was executed.
