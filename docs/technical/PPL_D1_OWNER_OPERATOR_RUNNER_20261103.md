# PayPal — Isolated remote Cloudflare D1 owner runner (2026-11-03 KST)

**RELEASE HOLD / user-operated only / no account actions executed by ChatGPT.**

This provides a bounded path from verified local Wrangler D1 (4 migrations, 6 guards, 13 real local checks, GitHub full CI success at `16a64dfb`) to **one genuinely new, isolated Free Cloudflare D1 database**. Existing production databases, private payment receipts and all Part1/Part2 runtime sources remain untouched. The ChatGPT connector cannot operate the user's Cloudflare account; these are **prepared operator commands, not observed remote results**.

## Design tradeoff

| Choice | Cost/risk | Quality | Decision |
|---|---|---|---|
| Manual Dashboard copy/paste | 0 in confirmed Free quota; mistarget/skip risk | Real remote D1 but easy to select wrong UUID | Secondary |
| Scripted **two-stage owner-only** create then migrate | 0 in confirmed Free quota; validates identity and empty DB before any migration | Real remote SQL proof with fail-closed guards | **Selected** |
| GitHub CI with account token | Auth secret/permission changes required, potential token leakage | Automatable but violates current zero-secret CI boundary | Not used |

## Preconditions

1. **Owner:** confirm your Cloudflare Workers plan is **Free** and there is a free D1 slot (Free supports 10 DB/account, 500 MB per DB; over quota must STOP). This script checks inventory size, **not the plan's billing metadata**.
2. On a supported, trusted **Linux / macOS / Windows 11** shell with Node 22+ and a private existing Wrangler login, use a clean GitHub `lead/paypal` checkout at the verified SHA. Do not paste tokens/passwords here or upload `.env`.
3. No shared/real user data; separate approval needed before any destructive Time Travel restore, deletion, Worker publication, IdP integration, PayPal or Gemini calls.

## Commands

First, no network or credentials required:

```sh
node scripts/owner_cloudflare_d1_isolated.mjs
```

Only when signed in to an owner-operated Cloudflare account and Free plan manually confirmed, the owner executes the **explicit create** command:

```sh
node scripts/owner_cloudflare_d1_isolated.mjs --create-isolated --free-confirmed
```

The command generates an unpredictable `proofline-d1-isolated-<16 hex>` name; checks existing D1 inventory below 10 and creates exactly one new DB. It reports the **new database name and UUID**, but does not migrate it. Record these locally, not in ChatGPT or GitHub. **Do not repeat create after a timeout or ambiguous failure**: first inspect Cloudflare Dashboard for the newly created DB.

Only after confirming the newly created database ID, the owner executes a distinct **explicit apply** command:

```sh
node scripts/owner_cloudflare_d1_isolated.mjs --apply-isolated <NEW_NAME> <NEW_UUID> --free-confirmed
```

The script compares both name and UUID against the authenticated Cloudflare account inventory, requires exactly four reviewed migration files, rejects any DB with existing user tables, previews unapplied migrations, applies once, and checks migration history (4 rows), security guards (6) and `PRAGMA quick_check=ok`. No HTTP Worker, PayPal, IdP, Gemini, YouTube or Devpost action. A failed/ambiguous apply is **not retried automatically** and requires owner inspection. Source only is validated in GitHub CI; these external operations are not claimed as performed.

**Backup/restore caveat:** Wrangler takes a migration backup (Cloudflare's official D1 migrations behavior); the Free Time Travel window is 7 days. The owner must separately approve any in-place Time Travel restore — the script never invokes restore or delete. The remote account's current pricing/free rights and data state still need validation outside this chat.

References: https://developers.cloudflare.com/d1/wrangler-commands/ ; https://developers.cloudflare.com/d1/reference/migrations/ ; https://developers.cloudflare.com/d1/platform/limits/ ; https://developers.cloudflare.com/d1/reference/time-travel/

Next gate after actual D1 proof: real IdP/PKCE, merchant/platform permissions and deployed Worker/browser/auth checks, all separately authorized.

## 2026-11-03 migration path hardening

Official Wrangler migration discovery resolves `migrations_dir` relative to **the Wrangler config file**, not the shell's working directory. The initial owner runner wrote its config into the OS temporary directory and incorrectly supplied `migrations/d1` as a relative directory. That could prevent any real remote apply. Corrected code generates a randomly named, owner-only ephemeral `.owner-d1-isolated-*.json` **beside the repository's `migrations/d1` directory**; it is gitignored, created exclusively with restrictive permission and deleted in a `finally` block. A dedicated GitHub Actions test exercises this exact config creation route with the real Wrangler **--local** engine and verifies four migrations applied. A successful local result is not remote Cloudflare proof. No existing DB, payment or customer data was accessed.
