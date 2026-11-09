# WORKNOVA Agentic Commerce Control Plane — private submission-review MVP

## Purpose and source truth (2026-11-09)

WORKNOVA is a two-category freelancing and global-services marketplace with a five-agent offline innovation lab. This independent Node/SQLite UI implements a **fully runnable and resettable synthetic end-to-end story** of the three originally proposed payments innovations: (1) constrained AI budget delegation instead of a genuine virtual card; (2) AI buyer/seller negotiation with a typed, bounded deterministic policy; (3) synthetic CI/delivery evidence moving a contract to human settlement REVIEW instead of a genuine escrow release. A second software-license A2A negotiation demonstrates delegated commerce after the job. It neither implements nor claims a real PayPal card, escrow, Capture, Payout, real LLM execution or GitHub API check.

## Run (Node.js 22.5+)

```sh
npm run demo:commerce
# Local Node.js prints http://127.0.0.1:PORT — open only on your own machine
```

No package install, keys, third-party network calls, personal data, or database seed required. The server binds to `127.0.0.1`, creates an isolated temporary SQLite file, provides GET `/api/state` and strict origin + CSRF protected POST `/api/action`. All requests stay on loopback. The database is deleted when the server closes. The demo DOES NOT use identity verification, merchant onboarding or real payment authority. Do not use in Production.

Click steps in order or `RUN ENTIRE OFFLINE JOURNEY`:

1. Delegate fictional $500 total, $300 per trade, 15-minute expiration, category/merchant allowlist and revoke rights. This is a local policy record, NOT a PayPal-issued virtual card or real delegated account.
2. Bounded fake seller asks $360 and buyer AI counters $300. Offline agreement reserves **$300 in the local POLICY**, no real funds.
3. Hypothetical GitHub PR #42 fixture has tests and security checks success; app marks `READY_FOR_HUMAN_SETTLEMENT_REVIEW`. It is NOT a GitHub API result or PayPal escrow/Payout.
4. Software vendor asks $200, buyer agent counters $160, local policy reserves another $160.
5. Show $460 total POLICY reservation, $40 unspent POLICY budget and `HUMAN_PROVIDER_AUTH_REQUIRED`. Real PayPal/Gemini requests remain 0, actual payments 0.

Use `TEST $600 BLOCK` to demonstrate fail-closed policy, `REVOKE MANDATE` to stop further actions, and `RESET` to start fresh. Replayed calls never double reserve the same action.

## Architecture: two choices considered

A) Static video-only visualization: cheapest, but doesn't satisfy judges' functional demo requirement. B) A separate safe runnable Node/SQLite state machine and frontend, leaving existing PayPal/AI contracts intact and preserving previous movie/marketplace: implemented. Real PayPal virtual cards or escrow functionality must not be assumed or invented. If official provider access later becomes available and the operator separately approves it, existing hardened PayPal Sandbox adapters can be integrated with verified merchant/session and policy checks.

## Truthful tools list for judges

- Implemented in **this** feature: Node.js 22.5+, core JavaScript, `node:sqlite`, local HTTP/HTML/CSS, bounded deterministic A2A agreements, mandate/expiry/revoke/amount gates, idempotent event records, synthetic PR/CI fixture, human finance gate.
- Already present in the main WORKNOVA repo: PayPal Sandbox Orders/OAuth adapter, owner-reported private historical provider evidence; Gemini adapters and separately gated A2A pilots, Part1 market matching, five Part2 modules, Playwright/Chromium and GitHub Actions.
- NOT demonstrated as live in this feature: PayPal Sandbox Orders API requests, PayPal virtual card API, real funds/escrow/payout, actual merchant or customer, Gemini calls, real GitHub PR check or Production deployment.

## Exact private film proof

- Created two **unsubmitted** 170.000s 1920×1080 films from existing 170s v4r backups. Redesigned 45–75s into 30s of source-grounded synthetic UI/editorial stills plus separate technology stack chapters; 0–45s and 75–170s H264 packets retained byte-for-byte (**3500/3500**).
- Private named challenger cut retains owner-requested American Express competitor mention from v4r; do NOT publicly submit without right-to-use clearance (contest bans unlicensed third-party trademarks).
- Submission-safe alternative omits competitor brand, but still requires full owner video/music/content approval, final verified voice/subtitle mix and public YouTube upload.
- 30s editorial chapter reuses HTML/CSS rendered by Chromium with **simulated state injection** due local network access restriction in this environment. It is not actual interaction footage. Functional HTTP/CSRF engine was separately tested by Node.
- Prior voice was cut from 45–75s as it narrates the old footage; the source-original hopeful synthesized instrumental score plays there. Outside the chapter the prior v4r audio remains in the mix (though whole output is reencoded AAC). Final owner-approved narrator cues and bilingual subtitles are still pending. Never claim owner approval.
- No PayPal/Gemini HTTP calls, YouTube, Devpost submission, Production access, database release or sponsor partnership through this build.

## Test and video checks

`node --experimental-sqlite --test tests/worknova_agentic_commerce_mvp.test.mjs`

Focused tests: 9/9 PASS on this generation environment, Node.js 22.16.0. Source video editing check: ffprobe 170.000s/4250 frames, full decode for both, 3500 exact outside-cut video packet hashes, 0 provider calls. Chromium served-browser navigation from the tool environment was blocked by administrator policy twice, so a real browser click E2E remains NOT VERIFIED here; HTML was rendered statically by Chromium for film frames. Source CI after GitHub commit is recorded separately.
