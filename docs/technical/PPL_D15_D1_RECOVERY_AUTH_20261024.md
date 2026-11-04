# D15 — Authenticated D1 claim inspection and stale-recovery fence

**Date:** 2026-10-24 KST. **Environment:** Node 22 + local SQLite simulation of D1 prepare/bind/run/first; not actual Cloudflare D1, PayPal, AI or deployment.

## Design and invariants

- `src/d1_recovery.mjs` exports `createD1RecoveryBoundary({db,resolveSession,authorizeRecovery})`. A backend must supply its own trusted `resolveSession(request)` implementation. Merely providing an HTTP header, JSON field, role name or caller-supplied principal is never proof of identity.
- `inspect(...)` is SELECT-only. It joins the existing D1 candidate `quotes` and `payment_attempts`, checks owner/merchant, quote/version/approval snapshot and operation. Missing rows and cross-tenant rows both return `ATTEMPT_NOT_FOUND`, without exposing existence of a foreign payment.
- Even a local DB row in state APPROVED or PAID returns `LOCAL_DB_METADATA_NOT_REMOTE_PROVIDER_PROOF`, `verifiedPayPalGet=false` and `allowProviderPost=false`. **This reader has no real provider GET.** Repeated GET/F5 cannot result in a payment call or mutate payment state.
- `recoverStale(...)` is a **backend-only** maintenance method. In addition to the trusted identity resolver, it requires an injected `authorizeRecovery` callback to explicitly approve the internal maintenance context. This must never be wired directly to an untrusted HTTP POST.
- The bounded UPDATE changes only a matching authorized `IN_FLIGHT` claim **at least five minutes old** to `UNKNOWN`, using SQL conditions and `meta.changes`. A duplicate/replayed recovery has 0 changes. APPROVED/PAID cannot be downgraded.
- A stale UNKNOWN state **remains occupied** under the existing `claimD1OperationOnce` constraint, preventing blind second payment POST. Real resumed operation must use separately implemented, authenticated PayPal GET-first reconciliation.
- Use a **first-primary D1 Session** (or equivalent documented read-after-write consistency mechanism) in an eventual edge implementation; the local shim does not prove remote replication consistency.

## Alternatives assessed

| Alternative | Benefit | Risk | Decision |
|---|---|---|---|
| GET endpoint directly returns/updates payment ledger | Simpler API | F5/read side effects, unauthenticated enumeration, accidental duplicate/paid assertions | Reject |
| Split **read-only tenant-bound inspection** and **privileged, age-gated recovery worker** | No mutation on GET, no forged recovery on public request, explicit UNKNOWN no retry | Additional identity/session implementation required | Implemented as offline internal prototype |

## Test evidence
- `tests/d1_recovery.test.mjs`: 11 cases covering read-only inspection, repeated refresh, resolver rejection, cross-tenant 404 equivalence, invalid inputs, missing maintenance permission, fresh claim fence, aged UNKNOWN exactly once after reopen, APPROVED/PAID preservation, unauthorized recovery rejection, malformed D1 result rejection.
- [GitHub Actions #40082429683](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40082429683) at `949eb8b25645d29f43e22669bf757c15e347ce49`: Node **204/204 PASS**, Chromium local E2E PASS, full 18-day progress dashboard PASS.
- Previous D1 candidate schema and claim fence in [D15 D1 claim design](PPL_D15_D1_CLAIM_FENCE_20261024.md). All tests use synthetic owner/merchant/order; no secrets or payment activity.

## Unresolved release dependencies

1. **Real identity:** secure, verified owner/reviewer sessions, HTTP-only Secure SameSite cookies, server-side merchant binding, CSRF/Origin protections and tenancy tests on a real Worker. `resolveSession` callback alone is a contract, **not authentication**.
2. **Real sandbox:** business/personal test accounts and authenticated PayPal GET, order/capture currency/merchant/amount/version validation, safe status updates; never allow browser-supplied “verified” as PayPal proof. D03 remains BLOCKED.
3. **Real AI:** authenticated approved free-tier AI model, no mock substitution. D04 remains PARTIAL.
4. **Real D1:** approved Free account and project, migrated contract/webhook/subscription schemas, read-replica/session tests, conflict/timeout/load and rollback evidence.
5. **Real deployment:** approved public URL and production HTTP/API/browser/session/restart and free tier checks. Not attempted.

## Handoff

D15 **20% PARTIAL** unchanged. Requirements/design is the only day checklist item accepted (20%). Implementation 40%, real automated deployment verification 30%, production CI/handoff 10% remain PENDING. Remaining planning allowance **5h base / 10h safe** and actual elapsed **NOT_MEASURED**; external approval/account wait unknown.

Next: prepare trusted PayPal Sandbox GET verification + D1 write-transition interface behind private authenticated service; seek explicit owner approval for any external account, credential handling, Cloudflare project or public deployment. Keep existing localhost demonstrator unchanged.

Official D1 documentation: https://developers.cloudflare.com/d1/worker-api/d1-database/ and https://developers.cloudflare.com/d1/worker-api/prepared-statements/.
