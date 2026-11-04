# P0 AI-approved quote → PayPal Sandbox payment: ledger proof boundary (2026-10-24 KST)

## Specific risk
The private Sandbox transport and D1-shaped GET reconciler already require order intent CAPTURE, matching payee merchant, reference id, USD amount and a completed nested capture. The **durable SQLite payment ledger** nevertheless accepted missing intent/payee in approved/created order records and allowed a detached capture to mark PAID without independently cross-checking the capture embedded in the fetched order. Thus a weaker or incorrectly wired caller could persist an insufficient proof. No real PayPal call had happened; this is a static-code safety finding, not an observed exploit.

## Alternatives
- Assume transport validation always runs before ledger methods: cheaper but violates defense in depth and makes post-integration wiring brittle. Rejected.
- Verify the same intent/merchant/reference/currency/amount and nested capture at SQLite write boundary, while retaining existing transport and D1 defenses. Selected.
- Rewrite all D1 payment flows or authorize real PayPal orders now: not justified; lacks owner permission/credentials. Rejected.

## Changes and proof
- One `verifiedGetOrderUnit` internal predicate checks strict order ID, CAPTURE intent, allowed state, single purchase unit, quote ID, matching merchant payee, USD amount for all three ledger methods.
- Capture requires order COMPLETED, **exactly one nested COMPLETED capture** matching detached capture id, currency and approved human amount. Persisted create/capture attempts must match the merchant, version, amount and USD currency. A forged browser callback, inconsistent nested ID/status or another merchant cannot mark PAID.
- Existing retries after UNKNOWN still reconcile GET, never issue repeat create/capture POST.
- Integration rehearsal uses injected fake Gemini estimate of **$99.00**, explicit human approval **$15.00**, then the real SQLite API, Sandbox-only transport class with in-memory fetch fixture, buyer approval transition, capture once and fresh GET to PAID. This is a fixture-only API contract rehearsal, **not actual Gemini or PayPal proof**.
- New negative tests exercise missing CAPTURE intent, wrong/missing merchant, wrong reference, missing/foreign/noncompleted nested capture. No third-party HTTP, secrets, cards, public endpoints or cloud deployment.

## Remaining P0 blockers
- D03 actual PayPal Business+Personal buyer linked Sandbox app and OAuth/Orders/GET/capture **0% BLOCKED**.
- D04 Free-tier model access and real generated quote integration **80% PARTIAL**.
- D15 approved hosting/real authentication and D1 **20% PARTIAL** (estimated 5 hours baseline / 10 hours with safety, actual elapsed null).
- D16–D18 not started: actual operations, authorized video and Devpost receipt. Internal target Nov 11; official cutoff Nov 13 05:00 KST.
- Only owner can authorize provider credentials/secret handling, real Sandbox actions, zero-charge AI call or public contest submission.

## CI
Confirmed source SHA `da195e5906574b28d819248d6b0f20199a6f136d`. [GitHub Actions #40100184698](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40100184698) **SUCCESS**: Node **302/302** PASS (4 newly added integration/negative tests), Chromium localhost E2E PASS, 18-day progress CHECK PASS. Documentation-only follow-up commit gets its own CI; simulated and real provider evidence remain strictly separate.
