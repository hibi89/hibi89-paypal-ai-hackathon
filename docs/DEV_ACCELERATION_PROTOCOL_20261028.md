# PayPal accelerated development loop — 2026-10-28

Single source for development workflow only; product contracts and permission gates remain in AGENTS.md, REQUIREMENTS.md and code. Do not duplicate weekly status across README, STATUS and HANDOFF.

## Evidence-backed bottlenecks (not timed)

1. **Connector file edits and many small CI retries.** The prior read-only receipt feature underwent multiple GitHub commits/CI cycles before its 464/464 successful run; causes were incomplete synthetic payment fixture and a SQLite WAL side-effect. Batch related code/test fixtures, check contracts locally, then make ONE feature commit where possible. GitHub connector is needed here because local git cannot resolve GitHub; this is an environment limitation, not a justification for skipping CI.
2. **Redundant status writing.** The previous D03 outcome was copied across HANDOFF, STATUS and work notes and forced test adjustment. Track daily percent only in data/paypal_daily_progress.json -> generated MASTER_PROGRESS.md; change status/handoff ONLY for major transition, blocker or handoff. This protocol should not be copied to other documents.
3. **Too many owner terminal confirmations.** Owner's real Sandbox walkthrough needed separate Cloudflare tunnel and GET probe authorization, quote and private session authorization, and distinct Gemini/CREATE/Capture confirmation. Optional mvp:fast explicitly combines only two harmless GET-related steps and the private 15-minute session with prior human quote approval. It never merges Gemini, Sandbox CREATE, buyer consent or CAPTURE.

These are observed actions and CI records, **not measured time savings**. Do not report invented stopwatch numbers.

## Faster loop

Specify acceptance -> implement coherent functionality with fixtures -> run narrow local test -> fix -> one feature commit -> existing full GitHub Actions regression + Chromium -> update only the relevant status.

**AI can execute:** pure JS/unit tests in local Node, GitHub Actions full regression, source changes, offline static evidence, synthetic browser tests. **Owner's Windows only:** private existing SQLite proof and any real account/tunnel operation (requires separate explicit consent; never repeat a payment POST).

**One Windows verification command, without accounts or real payments:**

    powershell -NoProfile -ExecutionPolicy Bypass -File .\verify_local.ps1

or `npm run verify:local` (cross-platform), `npm run verify:local -- --core` for minimal checks. The script uses temp logs + summary.json, checks Git SHA, Node, progress, Node regression, injected synthetic MVP, local reviewer health, and optional installed Playwright Chromium. PASS/FAIL/SKIP. It never reads/resets user's private payment SQLite. **Do not** use mvp:quick to run regression.

**Optional new accelerated operator CLI, owner only (new private experiment, not a replay):** `npm run mvp:fast -- --execute --owner-authorized --free-tier-confirmed --sandbox-only --buyer-is-sandbox-personal`. Same existing one-shot SQLite guard and separate provider/financial approvals. The owner's 2026-10-28 successful Sandbox payment **must not be repeated** or cleared to try this feature.

## Next acceptance gates

- D03 owner-observed Gemini->Sandbox buyer->Capture->provider GET complete. No claim of independently hosted proof.
- D04 actual AI-informed quote scope/human review integration while price remains human-set; no model price predictions or new API calls without explicit consent.
- D15-D16 real authenticated judge-accessible demo and regression; synthetic loopback is not production.
- D17-D18 English video under 3 minutes and owner-approved Devpost submission. No automatic deployment, submission, account or billing changes.

Guardrails: immutable one-shot SQLite and no retries after UNKNOWN; no secret copying; external accounts, new data transmission, Live payments and submission require explicit owner authorization; do not auto-merge main or change another lead's branch.
