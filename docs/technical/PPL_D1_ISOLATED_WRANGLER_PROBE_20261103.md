# PayPal D1 isolated compatibility verification — 2026-11-03 KST

Status: **CANDIDATE, RELEASE HOLD.** This is strictly an isolated **local Wrangler D1 engine** verification until a separately authenticated Cloudflare account is available. Passing this does **not** prove real Cloudflare D1 or public deployment.

## Decision and authorization boundary

* A — continue Node SQLite-shaped synthetic D1 test doubles: zero new dependencies, but fails to prove actual Wrangler migration compatibility.
* B — pinned Wrangler CLI in GitHub-hosted Linux with explicit `--local`, temporary binding config, no API credentials: selected as a narrow step that improves compatibility evidence with no Cloudflare account, resource creation, migrations to a remote DB, or production code changes.
* C — real isolated Cloudflare Free D1 creation and remote migrations: owner approved in conversation, but **blocked** because this session has no connected Cloudflare account/write tool. Must not substitute another provider, use existing database IDs, copy credentials into GitHub, or bypass authorization.

The `d1-local-wrangler` job in `.github/workflows/test.yml` runs only on a push commit message with `[d1-local]`; it uses Wrangler **4.156.0** and Node 22 on Ubuntu, with empty `CLOUDFLARE_API_TOKEN`, local-only state and `--local`. No new Worker project or domain is configured. Any full CI SUCCESS is **offline evidence only**.

## Checks

1. `migrations/d1/` contains exactly four versioned SQL migrations, without the operational `restore_quarantine_private_sessions.sql`, which remains preserved under `scripts/`.
2. The real local Wrangler D1 engine applies migrations 0001–0004 to a disposable temporary database.
3. The local migration ledger reports 4 rows; `sqlite_master` contains 6 security triggers and the private OIDC binding table.
4. Local `PRAGMA integrity_check` reports `ok`. No authentication or payment calls are made.

## Real Cloudflare test after direct account access is available

Official CLI references: https://developers.cloudflare.com/d1/wrangler-commands/ and https://developers.cloudflare.com/d1/reference/migrations/.

Preconditions: Cloudflare Workers Free plan confirmed within DB quota, isolated **new name** and UUID, account sign-in through a supported operator environment (Cloudflare's current Wrangler support lists Windows 11, macOS 13.5+, and supported Linux; Windows 10 is not supported). No existing production database IDs and no token in chat, repo or CI. Prefer authenticated Linux environment or Cloudflare's dashboard, not a new paid host.

Operator-only exact sequence, once access is available:

1. Check plan/quota and existing databases first; do not reuse any existing DB.
2. Create a new isolated database with `wrangler d1 create <unique-throwaway-name>` (remote resource creation; requires operator credentials). Keep returned UUID private.
3. Generate an **untracked** Wrangler configuration that binds only the new database UUID and pins `migrations_dir=migrations/d1`; never point it at an existing Worker/Production binding.
4. First `wrangler d1 migrations list <new-name> --remote --config <isolated-config>`, verify exactly four files. Apply `wrangler d1 migrations apply <new-name> --remote --config <isolated-config>` only to this new UUID. Inspect `d1_migrations`, five required tables, security triggers and `PRAGMA integrity_check`. Export a **synthetic-only** SQL snapshot to a local untracked file. Never upload credentials, private DB rows or secret output to GitHub.
5. Time Travel restoration is destructive **in place**; run only on this new throwaway database after a fresh bookmark and separately scoped approval. Never restore any existing owner DB. Remote migration and restore are **NOT EXECUTED** here.

Cloudflare official current Free limits (2026-10-30): 10 databases/account, 500 MB each, 5 GB total and Time Travel 7 days; account-level availability/actual Free entitlement and quota still require direct verification: https://developers.cloudflare.com/d1/platform/limits/.

Owner's historical real PayPal sandbox evidence, Part1+Part2, `main`, and the legacy locally staged `paypal-mvp` folder must remain untouched. Do not auto-enable PayPal/Gemini, live account logins, public deployment, checkout, or Devpost. No release until separately verified live identity, merchant authority, D1, hosted browser/API, and owner submission approval.
