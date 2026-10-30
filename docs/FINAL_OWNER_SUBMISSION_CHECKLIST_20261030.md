# Proofline — Final owner review and release checklist (2026-10-30 KST)

**STATUS: PRIVATE PREPARATION / NOT RELEASED / NOT SUBMITTED.**
No source merge, public upload, account action or Devpost submission is authorized by this document.

## Current verified engineering baseline — Draft PR #28 exact SHA

- **Source:** [Draft PR #28](https://github.com/hibi89/hibi89-paypal-ai-hackathon/pull/28), `release/paypal-main-qa-preview-20261030@771ba6f4fb61b86af1530df51b2acda8fac9013b` -> unchanged `main` (owner approval required). Two-parent main+QA history; exact program/tests/scripts identical to QA `f6da705bb62577688b18f3a5dd1b30f3cf7a140f`, with original main-only `docs/ROLE_COORDINATION.md` preserved, plus release-preview docs.
- **Exact-source CI:** [Actions #41073098696](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/41073098696) **3/3 COMPLETED SUCCESS**, 643/643 Node, Chromium AI Work/Global Services/mobile + injected-fake protocol, Windows owner review, independently ffprobe-tested synthetic WebM **165.84 seconds**. This validates the synthetic candidate, not owner PC editorial approval or authentic third-party calls.
- **Historic real provider evidence:** 2026-10-28 owner-reported Gemini skill-classification and one PayPal Sandbox USD 1.50 buyer-authorized CREATE / CAPTURE / authenticated GET on the original computer. The private SQLite is NOT in CI and has not been independently attested by judges. **Do not repeat the capture, publish secrets, or assert fresh Gemini/PayPal contact.**
- **Public release state:** `main` still older; PR28 is DRAFT/UNMERGED, root MIT LICENSE exists only on preview until approved main update. Prior PR #7/#16 and overlapping QA #23–26 must **not** be merged separately; PR27 remains QA history reference. No public YouTube/Devpost receipts or Production URL exist.
- **Official [Rules](https://paypalaihackathon.devpost.com/rules):** Run/build from complete public GitHub repo OR hosted demo; real PayPal developer Sandbox + meaningful AI integration and working prototype; root visible open-source license, complete English write-up and public YouTube **under 3 minutes**. Hosting itself is not mandatory, but a simulated-only API trace is **not** fresh third-party evidence.

## 1. Source and release approval (OWNER-GATED; NONE COMPLETED)

- [ ] Owner reviews consolidated **[Draft PR #28](https://github.com/hibi89/hibi89-paypal-ai-hackathon/pull/28)** as the single `main` release route; [QA PR #27](https://github.com/hibi89/hibi89-paypal-ai-hackathon/pull/27) is its test-proven history, not a second required public release. Never merge overlapping older drafts separately.
- [x] GitHub exact-SHA technical CI for `771ba6f4fb61b86af1530df51b2acda8fac9013b`: [3/3 SUCCESS](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/41073098696), 643 Node, Chromium, Windows and ffprobe 165.84s. **Does not authorize public release or certify the owner's private final video.**
- [ ] Owner explicitly decides whether to merge **PR #28** to public `main`; merging underlying PR #27 into `lead/paypal` is a separate choice and is **not needed** to publish already integrated PR28 source. Do not auto-merge.
- [ ] Verify the root MIT LICENSE and README in **PR28**, then once the owner approves release confirm GitHub's public default-branch About section detects the license and that a clean clone of approved `main` runs. **PR #16 alone is obsolete; do not merge it.**
- [ ] Confirm the final public reviewer README, Devpost source URL and video all refer to the **same version** and remain accurate about fake-vs-historical PayPal/Gemini evidence.

## 2. One-command safe owner PC review and optional recording

From an **existing Windows clone**, first inspect uncommitted files; do not reset the owner's working tree, private SQLite or earlier recordings:

```powershell
git status --short
git fetch origin
# If this latest review branch is not yet present locally:
git switch --track origin/release/paypal-main-qa-preview-20261030
git rev-parse HEAD
npm run owner:final:local
# If the private recording is missing/stale, this is an EXPLICIT opt-in:
npm run owner:final:local -- --record-if-missing
```

If the branch exists locally, use `git switch release/paypal-main-qa-preview-20261030` and `git pull --ff-only` rather than tracking it again. If a source branch has later changed, verify the new SHA and review the affected CI before regarding it as the submitted candidate.

- `npm run owner:final:local` runs the existing **localhost synthetic/SQLite/fake API reproduction**, creates ignored release-readiness reports, checks the private recorded video + source SHA + optional system `ffprobe` encoded duration, and inspects the **existing historical SQLite receipt read-only if present**. It never initiates recording by default, uploads content or calls Gemini/PayPal.
- A default result requesting a missing/stale video is an expected **review action required**, not permission to submit. It may exit with code 2. The optional `--record-if-missing` is a separate, deliberate choice; it records at most once only when safe prerequisites pass. It can download pinned free video tooling, so review that dependency first. No payment endpoints, CAPTURE retries, public uploads or video releases occur.
- If it indicates `INDEPENDENT_MEDIA_DURATION_CHECK_NEEDED`, use a trusted installed `ffprobe` and rerun the local candidate check. Do not use wall-clock or a video hash as substitute for encoded-media duration. The Playwright ffmpeg helper alone is not evidence that `ffprobe` exists on Windows.
- The status `PRIVATE_TECHNICAL_PACKET_READY_OWNER_REVIEW_REQUIRED` means **technical/local packet only**: not exact GitHub CI proof, not personal visual/privacy approval, not a real provider-attested judge checkout, and not Devpost permission.
- Review the ignored `output/submission/owner_review_brief.json`, `submission_candidate_status.json`, `output/videos/*.webm` and their manifests locally. **Never upload private receipts, keys or owner SQLite**.
- `npm run judge:reproduce`, `npm run judge:evidence`, `npm run freeze:check`, `npm run submission:candidate:local` and `npm run preflight:reviewer` remain available for individual diagnoses, but the default fastpath covers the owner-local sequence. `freeze:check` **always blocks automatic release** even when technical evidence passes.

### Optional separate remote verification (NOT part of the owner fastpath)

Only after new explicit owner approval, the isolated `npm run owner:sandbox:get:optional` allows **at most one read-only GET of an existing historic Sandbox order** after OAuth, with interactive consent. Default mode is inert. It never issues Orders CREATE/CAPTURE or Gemini requests. Remote rechecking is not required to run the synthetic local review; failure is not a reason to replay payments.

## 3. Video editorial approval (NOT YET DONE)
- [ ] Confirm `output/submission/submission_candidate_status.json` reports `videoSourceMatch: MATCHED_CLEAN_SOURCE`, `privateVideoDuration.status: ENCODED_MEDIA_UNDER_THREE_MINUTES`, `technicalVideoReady: true`, and `ownerReviewReady: true` on a clean, up-to-date Git checkout. Never edit recorded manifests manually.
- [ ] Watch the **newest owner-PC WebM**, not an older CI synthetic file. Confirm both categories, explicit human quote approval, contract/delivery/reviewer interactions and the four-source Evidence Map appear.
- [ ] Check all provider proof cards distinguish **owner-reported historical Gemini/PayPal Sandbox** from current offline mock; never claim fresh GET, paid live checkout, real userbase or PayPal marketplace partnership.
- [ ] Inspect the actual **encoded** media duration under 180 seconds, independently checked by the candidate's `ffprobe` result or a separately trusted media inspector. If unavailable, the duration is unverified. Local wall-clock elapsed time and SHA-256 alone do not verify media length.
- [ ] Visually check English caption readability and absence of account IDs, order/capture IDs, private SQLite, buyer details, keys, tunnel hostnames and credentials.
- [ ] Owner explicitly approves the exact edited video. A prior CI PASS is not public-upload permission.

## 4. Final public handoff (MANUAL; OWNER APPROVAL REQUIRED)
- [ ] Confirm official English Devpost title, description, truthful provenance, tools, source link and instructions at [the working entry draft](DEVPOST_ENTRY_AND_VIDEO_COPY_EN_20261029.md).
- [ ] Verify judges can run or interact with the **publicly accessible functional build**, including clear complete setup instructions. The localhost demo is synthetic; document that limitation rather than presenting it as a live-provider session.
- [ ] Only after owner authorization: publish the approved **<3-minute** video on **public YouTube** and insert its actual link.
- [ ] Only after separate owner authorization: complete Devpost required fields and submit; preserve the **actual submission receipt/link**.
- [ ] Do not claim submission, PayPal partnership or independent production provider evidence until it exists.

**Official deadline:** 2026-11-12 12:00 PM PST = **2026-11-13 05:00 KST**.
Official rules: https://paypalaihackathon.devpost.com/rules .
The rules permit repository-based setup instead of public hosting, require a functioning demonstrable app, a **public open-source repo with visible license**, an **English submission**, and a **public YouTube video under three minutes**. A standalone static mockup is insufficient.

## Current blockers to 100% submission
1. Exact PR28 HEAD GitHub Actions **3/3 SUCCESS verified**; owner-PC clean source/video review and merge decision still required. `freeze:check` is a non-release safety gate.
2. Current owner-PC video recording, actual encoded-duration/visual/privacy review.
3. Public source/release license/working judge entry decision.
4. Public YouTube link and actual Devpost receipt.

No other standalone SOVIA, DBVORA, RAG_STUDIO, HAE, LA or AutoML integration is required for this contest product.
