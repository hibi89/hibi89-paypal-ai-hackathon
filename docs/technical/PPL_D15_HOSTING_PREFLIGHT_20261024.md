# PPL-D15 — Hosting feasibility and release gates (2026-10-24 KST)

**This is a static, offline preflight, not a deployment.** Prior reference source: `9ce792a56ea9575238199232c537302a2bf14c99`, `lead/paypal`. No account, Worker, D1 database, DNS, remote credentials, publicly visible URL, or Vercel project was created.

## Two approaches / decision
| Attribute | A. Local reviewer reproduction | B. Cloudflare Workers Free + D1 Free |
|---|---|---|
| Incremental cost | 0 | 0 **only if** actual account, usage and plan remain within verified Free limits |
| Delivery time | Short: existing `npm run demo` | Longer: rewrite storage/session/router and configure account securely |
| Performance | Local one-process, not internet | Edge API, distributed isolates, D1 async DB access; CPU cap requires benchmarking |
| Maintenance/security | Simple, but cannot satisfy public entry/real-API requirements | Persistent D1, real identity, per-request authorizations, cost and rollback monitoring |
| Judging gap | Real Sandbox+AI still missing | Real Sandbox+AI still missing until independently authorized and verified |

**Recommendation:** preserve A as an honest offline fallback; design B behind explicit approval, without lifting D03/D04 access gates. Do not silently narrow the contest requirements.

## Verified actual source blockers (static)
Run `npm run preflight:hosting`: prints JSON `DEPLOYMENT_BLOCKED`, exits 2 by design.
- `src/offline_demo_server.mjs`: Node `server.listen`, exact 127.0.0.1 Host/socket checking, synthetic owner/reviewer cookie.
- `src/sqlite_ledger.mjs`: local `DatabaseSync(filename)` and synchronous `BEGIN IMMEDIATE` writes. Its semantic contracts (CAS, unique event keys, idempotency) must be deliberately recreated; do not simply drop this file into a Worker.
- `src/subscription_demo_store.mjs`: another local SQLite file and synthetic billing state, not real PayPal Subscriptions.
- `src/demo_rate_limit.mjs`: process memory counters; not distributed or identity-aware.
- `src/quote_draft.mjs`: `OFFLINE_MOCK`, not actual AI.
- `src/quote_api.mjs`: `/orders` returns `PAYMENT_GATE_NOT_READY` 503; do not publicly relabel as integration success.

`src/hosting_preflight.mjs` and `tests/hosting_preflight.test.mjs` exercise fail-closed blocker detection. Their passing tests do not prove Cloudflare deployment, real payment or external access.

## Cloudflare published Free tier (reference, not user account verification)
- Workers Free: 100,000 requests/day, 10ms CPU/request, 128MB memory, 50 subrequests per request. Free cap resets at 00:00 UTC and can produce 1027 errors. Choose **fail closed**, never bypass authorization to serve requests.
- D1 Free: 5 million rows read/day, 100,000 rows written/day, 5GB total stored. Free read/write cap failures must fail closed with no automatic pay-as-you-go upgrade.
- Static assets: publicly served files are not a safe home for secrets. Cloudflare static assets can be uploaded with a Worker.
- Even where Cloudflare advertises Node compatibility, some APIs are stubs: `node:sqlite` is listed as a **non-functional stub**, while D1 uses async `env.DB.prepare(...).bind(...).run()`. Local filesystem state is not D1 persistence.
- Confirm current account plan, registration region, billing prompts, resource quotas, and actual permissible API models **after authorization**, not based on docs alone.

Sources (checked 2026-10-24):
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/
- https://developers.cloudflare.com/d1/worker-api/d1-database/
- https://developers.cloudflare.com/workers/static-assets/

## B production migration — explicit sequential gates
1. **Authorization/cost:** owner approves choice of existing Cloudflare account or creation; verify truly Free, no payment/card, domain or paid add-on. Establish CI signing identity and repo permissions.
2. **Storage contract:** D1 migrations with unique merchant+quote+version+operation constraints, duplicate event ids and capture fence. Positive/negative CAS; two concurrent clients; UNKNOWN outcome requires GET-first and no duplicate POST.
3. **Auth/security:** dedicated verified owner/reviewer sessions (HTTP-only Secure SameSite cookies), CSRF/Origin, tenant separation and trusted merchant association. Current synthetic token must never be reused publicly.
4. **Real provider:** privately configured PayPal Sandbox Business/Personal OAuth + Orders v2, signed webhook verification and real (free-authorized) AI. No Live endpoints or public credentials.
5. **Budget/policy:** per-account quotas, provider retry 0 for ambiguous POST, clear fail-closed limits, no chargeable overage; monitor Cloudflare/D1 use.
6. **Release:** staging-first deployment only after owner approval; no unauthenticated write actions; check public HTTP/static assets, API, browser console/network, session boundaries, persisted restart, incident rollback; verify GitHub SHA equals deployed version.
7. **Judge reproducibility:** publish actual working instructions and clearly separate mock features from verified real functionality. Produce actual recording/receipt only when observed.

## Failures/rollback/recovery
- During preflight: unexpected source file -> `SOURCE_NOT_VERIFIED` and exit 2. No destructive operations.
- If public deployment is approved later: immutable migration snapshots, rollback-compatible SQL, production secret rotation, runbook and synthetic data backups first.
- If Worker CPU / D1 daily limits fail: return explicit unavailable status, halt mutating operations, do not bypass/pay to recover.
- If real PayPal POST state is uncertain: persist UNKNOWN and reconcile by authenticated GET, never blind re-POST.

## Acceptance and remaining work
D15 actual scope requires externally served URL, user authentication, API, D1 persistence, browser and recovery evidence under an approved Free account. Until then this milestone is PARTIAL or BLOCKED; local preflight tests cannot satisfy the implementation/prod-E2E criteria. D03 real Sandbox and D04 real AI stay distinct external blockers.
