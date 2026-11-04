# Read-only Cloudflare Worker runtime proof — 2026-11-03 KST

**Status: LOCAL WORKER CANDIDATE, RELEASE HOLD. No public deployment, real IdP, PayPal or Gemini.**

## Technical decision

A — embed a new HTTP API directly in the existing loopback Node application. Cheapest to code, but its Node SQLite, synthetic users and local network assumptions cannot serve a safe public Worker; high security and maintenance risk.

B — add a separately gated Cloudflare ES-module `fetch(request,env)` entrypoint reusing the already-reviewed, read-only D1 inspection and private cookie resolver. Selected: minimal code and operational surface, zero new storage, no provider dependencies. It is never activated without the exact `PRIVATE_READ_ONLY_OPT_IN` and `PRIVATE_READ_ORIGIN` variables and a real `DB.withSession` binding. Even activated, sessions must be previously provisioned by a trusted IdP and matched to an active issuer/subject generation. No public sign-up, quote editing, order claim, capture, checkout or AI transport.

C — expose the full Part1+Part2 synthetic app in a live public Worker. Not approved: fake buyer/seller identities and Node-local state would misrepresent readiness and create privilege risks.

## Implemented

- `src/worker_private_read_runtime.mjs`: Worker-compatible ESM `export default {fetch}`; fail-closed 503 unless exact opt-in, HTTPS origin and a primary D1 binding are available. Reuses `createPrivateWorkerReadHandler` for exact-host, GET-only `/__private/attempt/status`, SHA-256 server session verification with D1 preprovisioned binding and strict security headers; no new payment code.
- `tests/worker_private_read_runtime.test.mjs`: default-off, invalid environment, denied methods/paths, failed D1 and confidentiality checks; Linux and Windows.
- `scripts/probe_private_worker_runtime_local.mjs`: GitHub Actions LOCAL ONLY; seeds an ephemeral D1 with fictional owner/merchant/quote/session hash, launches **actual Cloudflare workerd via Wrangler 4.156.0 dev with 127.0.0.1 HTTPS**, then checks authenticated GET, anonymous 401, cross-site 403, POST 405, cross-origin 403, No-Store and no CORS; destroys the fixture and stops workerd. It never uses `--remote`, an account ID, a real user token, PayPal or Gemini.
- The actual workerd job is tagged `[d1-local]` in `.github/workflows/test.yml` alongside existing migration SQL and guard checks. No persistent/deployable `wrangler.json` is checked into the repository. `.wrangler-private-read-ci-*.json` is ignored.

## Validation boundary

A passing Github CI demonstrates the local worker runtime, **not a public Cloudflare host or authenticated real external identity**. Real Worker deploy, production origin, D1 account, merchant permissions, reliable live OIDC login, buyer/seller UI and official submission are independently unverified, unauthorized until approved and remain RELEASE HOLD.

References: https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/ ; https://developers.cloudflare.com/workers/wrangler/commands/workers/ ; https://developers.cloudflare.com/workers/local-development/local-data/
