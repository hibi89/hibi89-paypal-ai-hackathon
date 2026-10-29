# Proofline — Final owner review and release checklist (2026-10-30 KST)

**STATUS: PRIVATE PREPARATION / NOT RELEASED / NOT SUBMITTED.**
No source merge, public upload, account action or Devpost submission is authorized by this document.

## Current verified engineering baseline
- Working contest product: **one** synthetic marketplace, **AI Work** and **Global Services**, shared quote, human approval, contract, delivery and audit flow.
- Tested source: `work/paypal-final-qa-20261030@020d7cccd67fcc91804ff563a5703953946953fe`.
- [Actions #40904439915](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40904439915): Linux Node **572/572 PASS**, both synthetic Chromium category journeys PASS, Windows video task PASS, synthetic full-speed WebM **154.08 seconds** measured via `ffprobe`; all three jobs SUCCESS.
- That CI recording is private, temporary and **not** the owner's final video; it contains **zero real Gemini/PayPal calls or payment POSTs**.
- 2026-10-28 Gemini classification and PayPal Sandbox buyer-approved CREATE/CAPTURE/GET remain **owner-reported private local observations**, not newly re-executed/independently verified in CI.
- Later [CI #40905971285](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40905971285) on pre-P5 source `77b3469` completed **575/575 Node PASS**, AI Work and Global Services Chromium PASS, Windows recorder PASS and private synthetic WebM **153.96 seconds** via independent ffprobe. Never confuse that with an owner-approved public video.
- **P5 source/video lock:** newly generated recording manifests store the exact Git SHA and whether tracked source was clean. `submission:candidate:local` compares that evidence with the current checked-out SHA and both tracked Git states; only `MATCHED_CLEAN_SOURCE` can be marked `ownerReviewReady`. Older videos lacking a source SHA or videos from another checkout are **not** automatically review-ready. A fresh owner-PC recording from the final chosen checkout is required.
- P5 source-lock changes and tests must pass their **own** exact-head CI before release; do not treat earlier green runs as testing newer commits.

## 1. Owner source decision (NOT YET APPROVED)
- [ ] Review [draft QA PR #23](https://github.com/hibi89/hibi89-paypal-ai-hackathon/pull/23); confirm the exact UI and approval-consent changes, tests and provenance text.
- [ ] Decide whether/when to merge the QA branch to `lead/paypal`. Do **not** interpret the currently tested `lead/paypal` as containing unmerged QA improvements.
- [ ] Review [draft main/LICENSE PR #16](https://github.com/hibi89/hibi89-paypal-ai-hackathon/pull/16) and the public default-page README. A merge of PR #16 **alone** does not publish all application changes from `lead/paypal`.
- [ ] After separately authorized release, verify the actual public repository entry point, a **visible/detectable root open-source LICENSE**, and that the exact branch/commit provided to judges runs the same application shown in the video. Keep `main` and release operations owner-controlled.
- [ ] Make the final README/Devpost source URL agree with the **released** branch, not merely the current local checkout.

## 2. Safe local QA and owner-only recording
On the **owner's Windows computer** in the existing cloned repository, inspect local uncommitted changes before switching. If the new QA branch is not present locally:

```powershell
git fetch origin
git switch --track origin/work/paypal-final-qa-20261030
git rev-parse HEAD
npm run preflight:reviewer
npm run judge:reproduce
npm run judge:evidence
npm run video:record:owner
npm run submission:candidate:local
```

If the QA branch already exists locally, use `git switch work/paypal-final-qa-20261030` and `git pull --ff-only` instead of `git switch --track`. **Never force-reset a local branch**, overwrite private SQLite files, or replay a previous Sandbox CREATE/CAPTURE just to make footage.

- `npm run preflight:reviewer`: safe local synthetic reviewer readiness only.
- `npm run judge:reproduce`: replays **both categories through the real localhost HTTP handler** and the existing full orchestration using explicitly fake Gemini/PayPal responses. Saves `output/submission/judge_reproduction_receipt.json` (gitignored). Proves neither public deployment nor external payment; historical 2026-10-28 proof remains owner-reported.
- `npm run judge:evidence`: injected fake providers only; **not** live Gemini or PayPal.
- `npm run video:record:owner`: creates ignored private English-captioned synthetic WebM; may install pinned free Playwright/ffmpeg tooling; reads any prior owner evidence in a local **read-only** and allowlisted way.
- `npm run submission:candidate:local`: writes only gitignored `output/submission/`. It records the actual Git commit/branch, `videoSourceMatch`, and **independent encoded duration if free `ffprobe` is installed**. An old/mismatched video must be re-recorded. Do not interpret a successful command or `ownerReviewReady: true` as public-release authorization.
- Check `privateVideoDuration.status: ENCODED_MEDIA_UNDER_THREE_MINUTES` and `technicalVideoReady: true`. If `ffprobe` is unavailable, duration stays **NOT VERIFIED**; install a trusted free ffprobe binary or independently measure the actual WebM before considering it final. Do not use wall-clock elapsed time as a substitute.
- No command above uploads a video, submits Devpost, charges a card, invokes live provider payments or merges Git branches.

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
1. P5 provenance-lock exact-HEAD regression CI and owner review/merge decision.
2. Current owner-PC video recording, actual encoded-duration/visual/privacy review.
3. Public source/release license/working judge entry decision.
4. Public YouTube link and actual Devpost receipt.

No other standalone SOVIA, DBVORA, RAG_STUDIO, HAE, LA or AutoML integration is required for this contest product.
