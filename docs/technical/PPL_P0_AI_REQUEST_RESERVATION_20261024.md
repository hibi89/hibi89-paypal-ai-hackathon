# P0 paid-call risk containment — durable one-shot AI reservation (2026-10-24 KST)

## Problem and chosen architecture
Existing opt-in Gemini quote adapter could perform repeated third-party POSTs on concurrent same-version draft requests. The previous SQL revision CAS happens *after* the potential model call, preventing duplicate writes but not duplicate API charges.

Alternative A: ephemeral process lock/cache (cheap, but unsafe after restart or multiple processes). Alternative B: one persistent SQLite reservation per quote/version plus a hard pilot cap of **1 reservation per SQLite file**, before any third-party request (selected: preserves existing quote/approval/payment code and works across connections). Alternative C: remote distributed queue/D1 quota gate (needed for future deployments, but requires the user's separate account/security approval and real D1 validation).

## Safety contract
- SQLite adds `ai_draft_attempts` with `PRIMARY KEY(quote_id,quote_version)`, status `RESERVED/UNKNOWN/COMMITTED`. All claim checks (owner, version, PROPOSED state, no contracts, no payment attempts, no existing claim and a count cap) run under `BEGIN IMMEDIATE`.
- The quote API requires real third-party consent, trusted session and CSRF, then atomically calls `claimAiDraft` **before** invoking the injected provider. A duplicate/stale/approved/foreign/cap-exceeded request fails without touching the external adapter.
- Successful AI quote revision and mark COMMITTED share the same SQLite transaction. Provider error/invalid response sets UNKNOWN, with no automatic retry. Crash during reservation leaves RESERVED; subsequent calls still fail closed.
- One reservation counts against the cap even on failure. The only existing simple exit for an UNKNOWN local quote version is an explicit *offline mock* revision; the AI pilot budget still remains exhausted. Unbounded paid retries are forbidden.
- Approval while a reservation remains RESERVED and mock revisions during reservation are blocked. Existing payment routes and quote approval behaviour without reservations remain unchanged.
- This is a **single persistent SQLite file pilot cap, not a multi-server/global provider billing ceiling**. Creating new DB files, separate deployments, or external provider usage from other clients is outside this guarantee.
- Real Gemini Free Tier eligibility, charges, real PayPal, production authentication, D1, public URL, video and Devpost **remain NOT_TESTED**. No Gemini/PayPal network calls, billing changes, external deployment or user account access performed.
- This work is security stabilization, **not** D03/D04 completion: D03 0% BLOCKED, D04 80% PARTIAL, D15 20% PARTIAL, D16–D18 0%. Base remaining D15 5h, safety remaining 10h, actual elapsed NOT_MEASURED.

## Evidence and next stage
Tests cover concurrent submits, replay, durable crash reservation, quota, wrong actor/version, provider error sanitization, mock fallback, approval hold, and forged source. Await GitHub Actions after commit and record exact SHA/results. Future work: explicit, separately authorized single real provider probe; genuine Free Tier + Business/Personal Sandbox receipts. Production must use centrally enforced budget and trusted identity; never deploy the local synthetic server as-is.

## Confirmed offline acceptance
- Implemented at SHA `dac161b150bb3486f8b4c0871172e750b6dcd278`; [GitHub Actions #40094382302](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40094382302): Node 278/278 PASS (0 failures), Chromium localhost E2E PASS, MASTER_PROGRESS 18/18 PASS.
- This verifies synthetic fixtures, SQLite and browser localhost only; actual Gemini tokens/charges, PayPal orders, third-party quota and public operation are not verified.
- Every future production environment needs a centrally enforced budget, scoped service identity, explicit user consent, and provider-tier verification. The SQLite one-attempt cap is not a global account quota.
