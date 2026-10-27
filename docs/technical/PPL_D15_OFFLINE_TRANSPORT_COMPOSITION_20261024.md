# PPL-D15 — Internal Sandbox transport composition proof (2026-10-24 KST)

## Status
**OFFLINE/IN-PROCESS ONLY** — the actual `createSandboxTransport` module is now exercised end-to-end with the D1-shaped `createD1SandboxGetReconciler` and a separately injected trusted-session resolver. Every PayPal-shaped response and OAuth token originates from an in-process fixture; **no internet, PayPal credentials, real account, D1 account or public deployment** were used.

This is a development/test harness, not an authorized application server or a working external PayPal integration. No payment-order/capture POST path is exposed by the harness.

## Code and threat boundaries
- `src/offline_sandbox_d1_harness.mjs`: `createOfflineSandboxD1ReadHarness({db,resolveTrustedSession,orders})` instantiates the existing `createSandboxTransport` with **only a closure-owned fake `fetchImpl`**. It accepts no external fetch implementation, base URL, Live override or credentials. Synthetic OAuth POST and synthetic order GET return test responses from memory. Any other path/method—including Orders create/capture payment POST—is rejected.
- Uses a server-supplied `resolveTrustedSession(request)` function and a quote/owner/merchant-scoped D1-shaped SQL repository. The resolver is itself **not** an implemented auth provider: live cookie/CSRF/Origin/reviewer identities and merchant authorization remain separate gates.
- Exposes only `refreshOrder`, `reconcileCapture`, and a sanitized `audit()` counter. It does not return transport handles, synthetic tokens, client secrets or HTTP router functions. `audit().networkRequests===0` and `paymentPostRequests===0` are properties of this deliberately offline harness and are not production evidence.
- The real transport's strict order/payer/capture checks validate synthetic fixtures, and the D1-shaped CAS transitions can mark a **local** create claim APPROVED or **local** capture claim PAID. These fixture-only states must never be described as verified PayPal or real money paid.
- A missing remote order ID yields `REMOTE_ORDER_ID_UNKNOWN_NO_RETRY`; unknown/duplicate records remain fenced in D1. Foreign actor or merchant is rejected **before** synthetic GET. Synthetic order currency, amount, merchant, and capture mismatch are refused without a paid transition.
- Order fixtures are cloned at harness creation to prevent subsequent external mutation of source objects. This does **not** protect untrusted real provider payloads; only an authenticated remote GET over an approved secure transport can supply that provenance.

## Test and failure evidence
- `tests/offline_sandbox_d1_harness.test.mjs`: 13 new tests for internal token/GET exchange (synthetic), approval and completed capture D1 CAS, repeated PAID behavior, missing ID/CREATED/COMPLETED handling, injected server principal checks, mismatches, absent records, invalid versions, immutability of original fixture data and strict no-internet/no-payment-POST audit.
- First CI #40084818417 @ `38c5fc0d7505a66e19f7a3bce89976e660c47f6f`: **230 pass, 2 fail**; the failed assertions compared Node `node:sqlite` null-prototype row objects against plain objects despite matching values. Chromium was skipped because Node tests failed.
- Correction in `tests/offline_sandbox_d1_harness.test.mjs` normalized only the returned test comparison object; **payment domain code and DB predicates were not weakened**.
- [Successful CI #40084869412](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40084869412) @ `b308fad345c810917bd4736bc9d4b24f87cf2b79`: **Node 232/232 PASS, Chromium localhost PASS, 18-day MASTER_PROGRESS CHECK PASS**. No PayPal Sandbox real HTTP call was performed.

## Deployment and provider blockers
1. An approved, tested backend authentication provider must bind a verified principal and merchant to each request. The injected resolver in this harness is test-owned; the browser cannot supply session truth.
2. Real PayPal Sandbox Business+Personal access and authorized credentials, actually observed OAuth and Orders v2 GET/capture/webhook evidence remain **PPL-D03 BLOCKED**. Real authorized free-tier AI provider remains **PPL-D04 PARTIAL**.
3. Production D1 migrations/primary consistency, async resource binding, approval state, reconciler tenant isolation, session/restart behavior, quota monitoring, rollback and CI need Cloudflare Free account approval and separately witnessed tests.
4. Production URL, external reviewer browser, video and Devpost receipt are NOT_TESTED. No real payment, cards, Live, paid plan, new accounts, public deploy or secret changes allowed from the normal `ㄱ` development command.
5. Preserve fallback local reproducibility but do not substitute mocked AI/PayPal functions for the contest's actual PayPal+AI integration requirement.

## Decision / next readiness
Alternative A: keep extending offline synthetic infrastructure. Low deployment risk, but rapidly diminishing competition value until third-party authorization.
Alternative B (preferred once owner approves): prioritize **real PayPal Sandbox and free AI account verification** and real integration evidence; choose hosting only if needed and permitted. A private network-enabled transport must never be connected to a public API merely because mock tests passed.

**D15 remains 20%/100%.** Production implementation (40%), remote automated verification (30%) and production CI/reviewer handoff (10%) are still PENDING. Planning estimates: base remaining **5h**, safe remaining **10h**, actual elapsed **NOT_MEASURED**, external approval wait unknown. Overall 18-day count DONE12/PARTIAL2/BLOCKED1/NOT_STARTED3.

**Next independent offline unit:** implement a production-intent session interface with fail-closed constructor/tenant bindings, hardened OAuth token transport guards and fixture-only integration tests. Any real credential, account access, authenticated PayPal call or deployment requires separate owner approval.
