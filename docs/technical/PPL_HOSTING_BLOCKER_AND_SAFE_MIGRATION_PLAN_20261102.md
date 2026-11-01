# Proofline — Hosting blocker and safe migration plan (2026-11-02 KST)

**Status: DESIGN ONLY. Owner architecture approval required. RELEASE HOLD.** No PayPal/Gemini calls, host provisioning, credential transfer, public deployment, data migration, money movement or Devpost is authorized by this document.

## Inspected baseline and reproduced blockers

Repo: hibi89/hibi89-paypal-ai-hackathon, lead/paypal, source baseline 376006213e86276759b7d5a341fcd3810f17ad72. Keep Part 1 AI Work/Global Services and Part 2 all five innovation skills, existing old owner 118-staged local folder and historical private USD 1.50 Sandbox proof unchanged. The 861/861 clean ZIP Node result only proves offline source; exact new Windows push CI is unverified.

Read-only commands executed in an isolated source ZIP: npm run preflight:hosting (exit 2, 9 blockers), npm run preflight:p0 (exit 2, missing credentials **in this container only**, merchant and free-tier authority unverified), npm run preflight:submission (exit 2, external proof blocked), npm run mvp:two-part:evidence (exit 2 because this container has no owner's private historical SQLite). All are expected HOLD outputs, not runtime regressions. None transmits data or performs provider POST.

Hosting blockers: LOOPBACK_NODE_HTTP; SYNTHETIC_IDENTITY; DISK_SQLITE_LEDGER; DEMO_SUBSCRIPTION_ONLY; PROCESS_LOCAL_LIMIT; MOCK_AI_ONLY; PAYMENT_POST_DISABLED; AUTHORIZATION_REQUIRED; REMOTE_PROOF_REQUIRED. Current src/offline_demo_server.mjs is an intentionally synthetic loopback server. src/sqlite_ledger.mjs, src/subscription_demo_store.mjs and security stores use on-disk Node DatabaseSync. src/demo_rate_limit.mjs uses in-process state. Existing src/d1_claim.mjs, src/d1_recovery.mjs, src/d1_sandbox_get_reconcile.mjs are injection-based D1-shaped offline prototypes, **not** a live Worker/D1 runtime. Private OIDC host is not live IdP proof.

## Architecture alternatives (not approved for implementation)

| Criterion | A — Cloudflare Worker + D1 Free | B — Persistent Node host and durable database |
|---|---|---|
| Product alignment | Existing approved zero-new-cash / Workers+D1 target | Higher persistence/billing risk; would change approved architecture |
| Engineering | Worker HTTP, tenant/OIDC, async D1 migrations, durable session/claim rewrite | Less Node logic rewrite but still full public auth, network and durable store migration |
| Cost | Free D1 limits apply; 5M rows read/day, 100k written/day, 5GB total, 500MB per Free DB | Paid persistent disk violates zero-cash rule; Render Free filesystem is ephemeral and unsuitable for payment state |
| Correctness | Verify primary-consistent read-after-write, atomic D1 idempotency, UNKNOWN recovery | Persist original SQLite on actual durable volume; validate restarts/multi-instance safety |
| Recommendation | **Preferred conditional architecture**, matching owner decisions; approve scope before implementation | Reject free ephemeral Node SQLite, paid host and unapproved Postgres migration |

Cloudflare references: https://developers.cloudflare.com/d1/platform/pricing/ ; https://developers.cloudflare.com/d1/platform/limits/ ; https://developers.cloudflare.com/d1/worker-api/d1-database/ ; https://developers.cloudflare.com/d1/best-practices/read-replication/ . Render references: https://render.com/docs/free ; https://render.com/docs/disks . These are public platform documents, not the owner's account or price eligibility proof.

## Proposed implementation sequence (approval-gated)

1. Inventory the local API/routes/SQLite stores and distinguish mock-only browser endpoints from a production-hosted subset. Protect existing loopback demo by keeping it unchanged and adding a separate fail-closed Worker entrypoint. Never expose synthetic fixed identities publicly.
2. Versioned schema and migration for D1 with disposable databases. Verify quote/version/actor/merchant/amount unique claim, checked transitions and concurrent idempotency. Implement actual async D1 storage adapters, never wrap Node DatabaseSync blindly. Respect Worker query limits and fail closed on database/quotas.
3. Authenticated hosted owner/seller/reviewer identities: pinned issuer/JWKS, OIDC PKCE one-time callback, preprovisioned tenant binding, server-side revocation, Secure HttpOnly cookies, strict Origin/CSRF/CSP. No unauthorized self-registration and no browser-provided verified flag. Keep separate ledger boundaries for Part 1 and Part 2.
4. First-primary D1 sessions for any read-after-write claim/approval, use compare-and-swap and durable UNKNOWN on ambiguous provider outcomes. Public GET/refresh must never initiate PayPal Orders/Capture or Gemini. Store transaction references hashed or redacted, never real secrets in GitHub.
5. Reproduce all five Part 2 skills plus Part 1 quotes, human approval, seller/reviewer milestones and audit with injected offline transports. Browser/API contract negatives: cross-tenant, expired grants, revoked sessions, double clicks, stale write, replay, bad webhooks, over-budget, failure recovery and data durability.
6. Only after **separate explicit owner approval**: authorize exact Cloudflare account/project, secrets handling, real IdP, real PayPal Business/Personal merchant/buyer account rights, Gemini model and eligible Free Tier, external HTTPS and reviewer access. Prove public domain TLS/browser/HTTP/D1 after actual deployment. Do not repeat an ambiguous historical payment POST; provider GET-first and distinct new approval for each money action.
7. Only when authentic scope is actually verified: owner-approved English video shorter than 3 minutes (target 2:45) and Devpost source/license/public video/submission. Source evidence must clearly distinguish offline simulated A2A and real Gemini/PayPal.

## Acceptance, rollback and status

Before any external activation: existing 861 offline Node tests stay green, Windows CI conclusion actually observed on exact SHA, new D1 concurrency/migration/restore tests pass, synthetic identity never exposed, no auto-payment on GET, all cross-tenant and forged claims denied, no cost beyond validated Free budgets, and a tested rollback/backup exists. GitHub Actions green alone is not real service success; real browser/API/cookie/console/network and host status remain separate acceptance gates.

Rollback reference is source baseline 376006213e86276759b7d5a341fcd3810f17ad72. No main update, force-push, new project/domain/account, production secrets or payment API calls. Prior 12–23 hour estimate assumed hosting compatibility and ready external approvals; that assumption is false. Real migration effort and revised remaining hours are **unmeasured**, to be re-estimated after owner-approved target and compatibility inventory. Offline engineering subjective 99%/1% is not release or Devpost completion. **RELEASE HOLD**.