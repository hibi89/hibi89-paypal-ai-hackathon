# Proofline — Final owner review and release checklist (2026-10-30 KST)

**STATUS: PRIVATE PREPARATION / NOT RELEASED / NOT SUBMITTED.**
No source merge, public upload, account action or Devpost submission is authorized by this document.

## Current verified engineering baseline (updated 2026-10-30 KST)

- **One contest application:** offline synthetic Proofline marketplace with AI Work and Global Services; shared versioned quote, explicit human approval, contract, delivery/reviewer workflow, audit and pure fake PayPal Orders/Capture planning. Neither the demo nor CI charges buyers or calls external Gemini/PayPal APIs.
- **Last fully green independent CI:** [#41002555640](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/41002555640) at older source `5c07333`: **613/613 Node PASS**, three Chromium synthetic paths, Windows owner recording job PASS, and synthetic default-speed WebM **157.16 seconds** via independent `ffprobe`. **This does not verify all later changes.**
- **Current unmerged integration candidate:** [draft PR #25](https://github.com/hibi89/hibi89-paypal-ai-hackathon/pull/25), source `d1e76e3`, targets `lead/paypal`. Its three-job [CI #41017095517](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/41017095517) was **QUEUED at last check, NOT PASS**.
- **Additional private video safety patch:** [stacked draft PR #26](https://github.com/hibi89/hibi89-paypal-ai-hackathon/pull/26) adds manifest-path/symlink/bounds checks, six Python regressions, and Linux/Windows CI test hooks. A manual Python execution of matching source and tests passed **6/6**, but full GitHub CI on this final source has **not passed**.
- **Default main/LICENSE landing:** [draft PR #16](https://github.com/hibi89/hibi89-paypal-ai-hackathon/pull/16) is still unmerged; do not use a pre-release main README as proof that the latest source has been published.
- **Historical 2026-10-28 real provider activity:** owner-reported private Gemini + PayPal Sandbox USD1.50 CREATE, distinct buyer APPROVE, CAPTURE, GET. No independent current authenticated provider attestation, no new API/payment request, no production payments.

## 1. Source and release approval (OWNER-GATED; NONE COMPLETED)

- [ ] Review exact final candidate source at **[PR #25](https://github.com/hibi89/hibi89-paypal-ai-hackathon/pull/25)** and additional hardening **[PR #26](https://github.com/hibi89/hibi89-paypal-ai-hackathon/pull/26)**. They overlap with older draft PR #23/#24; **never merge overlapping copies of the same QA changes**.
- [ ] Confirm **one** actual chosen source SHA and full Linux Node + Chromium, Windows recorder and under-180s encoded video CI PASS at that exact SHA. A green status on older commit is insufficient.
- [ ] Separately approve whether to merge that source into `lead/paypal` and whether to release public source on `main`; do not auto-merge.
- [ ] Review MIT root LICENSE and [staged main landing PR #16](https://github.com/hibi89/hibi89-paypal-ai-hackathon/pull/16). **Synchronize its final source link to the exact validated release SHA** before merging; PR #16 alone adds no application implementation to `main`.
- [ ] Confirm the final public reviewer README, Devpost source URL and video all refer to the **same version** and remain accurate about fake-vs-historical PayPal/Gemini evidence.

## 2. One-command safe owner PC review and optional recording

From an **existing Windows clone**, first inspect uncommitted files; do not reset the owner's working tree, private SQLite or earlier recordings:

```powershell
git status --short
git fetch origin
# If this latest review branch is not yet present locally:
git switch --track origin/work/paypal-video-integrity-hardening-20261030
git rev-parse HEAD
npm run owner:final:local
# If the private recording is missing/stale, this is an EXPLICIT opt-in:
npm run owner:final:local -- --record-if-missing
```

If the branch exists locally, use `git switch work/paypal-video-integrity-hardening-20261030` and `git pull --ff-only` rather than tracking it again. If a source branch has later changed, verify the new SHA and review the affected CI before regarding it as the submitted candidate.

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
1. Exact **final QA HEAD** GitHub Actions green, `npm run judge:reproduce` and `npm run freeze:check` output reviewed; owner review/merge decision.
2. Current owner-PC video recording, actual encoded-duration/visual/privacy review.
3. Public source/release license/working judge entry decision.
4. Public YouTube link and actual Devpost receipt.

No other standalone SOVIA, DBVORA, RAG_STUDIO, HAE, LA or AutoML integration is required for this contest product.
