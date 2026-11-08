# WORKNOVA — Submission Step 3 portable reviewer integrity and identity (2026-11-09 KST)

## Owner-intervention rule
**Owner instruction:** Continue all independent verification, coding, build and draft tasks without requiring the owner to run local commands now. Batch actual unavoidable owner-only actions at the final gate. Do not ask for the original private PayPal SQLite status until all remaining independent steps are complete. Never use owner data, paid billing, PayPal CREATE/CAPTURE, Gemini calls, production/publication or account/permission changes without separate approval.

## Problem verified against lead/paypal (starting SHA `970baad7da3f271f27e738c0b1f35bf6d0ed9b70`)
- The real Part1 and Part2 HTML surfaces had already been branded WORKNOVA and covered by `tests/worknova_brand_surface.test.mjs`.
- **Real reviewer-facing defect:** `scripts/pack_offline_reviewer.py` still produced a `proofline-offline-reviewer.zip` with root directory, package name and inner README labelled Proofline, despite the new accepted WORKNOVA brand.
- `README.md` presented "PayPal Global Services Marketplace"/"Proofline" at the very top and instructed the deprecated ZIP filename.
- `docs/JUDGE_REPRODUCTION_EN.md` asserted `Final video | NOT_FILMED` despite the verified **private WORKNOVA v4o 170s** candidate. Opposite error (claiming public video or independent PayPal proof) must also be avoided.
- `docs/DEVPOST_FINAL_REVIEW_PACKET_EN_20261105.md` is an **unpublished** source used by a safety-checked field builder. Preserve its mandatory owner-approval and historical provider evidence phrases.

## Options compared and selection
- A: Documentation-only rebrand: minimal changes but leaves real ZIP filename, extracted directory and npm package name outdated. Reject: reviewers see conflicting branding.
- B: **Selected:** change the portable bundle presentation name and documentation, update its existing extract-and-boot tests and brand contract. This does **not** touch the browser logic, SQLite, PayPal/Gemini adapters, data, voice, subtitle or any external service.
- Compatibility: old `proofline-offline-reviewer.zip` paths were internal developer metadata and can remain in old historical artifacts; old branches and original ZIP files are NOT overwritten. The environment names `PROOFLINE_REVIEWER_ROOT` used by existing synthetic test harnesses are intentionally kept as internal compatibility knobs; tests supply the newly named WORKNOVA folder value.

## Implementation and proof boundaries
- New bundle name: `output/submission/worknova-offline-reviewer.zip`, extracted root `worknova-offline-reviewer/`, npm name `worknova-offline-reviewer`, `REVIEWER_README.md` headed WORKNOVA.
- Fresh Python ZIP test validates SHA-256 manifest and no-overwrite behavior, then checks the visible brand and preserved "synthetic only / no real provider calls" disclosures.
- Full fresh-extract Chromium Part1+Part2 test remains the acceptance gate under `tests/browser_portable_zip_e2e.py`; both tests use temporary directories, no owner files or provider requests.
- Updated README / reviewer guide truthfully label v4o private 170s visual candidate, not user-approved or uploaded. No audio/subtitles generated or approved. English Devpost draft remains NOT PUBLISHED with existing safeguard contracts.
- Additional Node brand assertion protects future regressions. At report creation code/test exact-SHA CI is pending; record completed outcomes only after GitHub checks.
- Prior step2 `npm run mvp:step2:safe` remains available for one batched owner-local check at final gate, but is **NOT** a prerequisite to offline reviewer ZIP or documentation checks.

## Remaining independent / gated tasks
1. Verify new exact-SHA Linux Node/Python/Chromium and Windows packaging tests; preserve existing v4o private film and ref.
2. Prepare brand-consistent reviewer README/Devpost input and inspect release preview differences under existing main. No `main` update or public release without owner approval.
3. Gather owner-only actions *once at end*: private evidence status check, final 170s visual approval, final output/audio approval, `main` release approval, YouTube publication and Devpost submission. If final design approval is needed to generate final voice/SRT, stop only that dependent part and continue all independent tasks.
4. Whole product previous estimate **79/100**, release HOLD. This engineering fix does not independently increase product-release score.

## Exact source SHA CI and release boundary — 2026-11-09 KST

- Feature `934189e5a6da777d7e16b4a9ee24ef4c3f224ebe`: [Offline MVP smoke #42516644286](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/42516644286) **completed SUCCESS**; [Offline payment-contract tests #42516644309](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/42516644309) **completed SUCCESS**. Linux `test` and Windows first-run jobs successful, optional Wrangler D1 and default-speed video jobs skipped.
- Fresh extracted `worknova-offline-reviewer/` bundle booted actual local Part1 and Part2 Chromium offline browser journeys in CI; the bundle is **not uploaded or public media**. Old package name remains a historical compatibility reference in old branches; new code uses WORKNOVA name. Owner visual lock is not granted and no new narration/subtitle generated.
- Read-only postflight GitHub compare: public `main@5243295f` vs working lead feature `934189e5a6da777d7e16b4a9ee24ef4c3f224ebe` **diverged** (ahead 97, behind 208; 117 compare-reported paths), old Draft PR #30 remains head `00616ee6` and not a current release candidate. Compare filenames reveal no newly added `.env`, SQLite DB, mp4/WebM, or secret-key file paths; this **is not a full content secret scan**. No merge, new branch, public upload, Production changes or user-local actions were performed.
- Owner instructions prioritized: delay personal evidence check `npm run mvp:step2:safe` until final batch; continue independent tasks. No user is needed for this verified reviewer ZIP fix. Final product baseline 79%, release HOLD.
