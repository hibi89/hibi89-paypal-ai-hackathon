# Proofline — dual-category default-speed video acceptance (2026-10-29 KST)

**Status: VERIFIED CI SYNTHETIC VIDEO ONLY. Not publicly released; owner-PC footage not reviewed; Devpost not submitted.**

## What was executed

- **Source:** `lead/paypal`, commit `0061d27815ccf61c4c15f42a3aa84f393d9e4db7`.
- **GitHub Actions:** `Offline payment-contract tests`, run [40876399546](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40876399546), **completed SUCCESS**, three jobs successful.
- **Default speed:** `npm run video:record:offline` using `scripts/record_judge_demo.py` default `--pace-ms 12000` (not `--pace-ms 200`).
- **Independent media measurement:** `ffprobe` returned **148.72 seconds** (2:28.72), exceeding 100 seconds and under the three-minute (180s) upper bound.
- **Video file:** private runner-only `paypal-synthetic-review-20261029-125212.webm`, 12,553,481 bytes; `scripts/check_recorded_video.py` reported **LOCAL_VIDEO_INTEGRITY_PASS**, including its SHA-256 manifest.
- **Source separation:** `NO_PRIVATE_CI_PROVIDER_PROOF_CLAIM_PASS`. Browser external calls blocked; CI records **PROVIDER_CALLS=0, PAYMENT_POSTS=0, PUBLIC_UPLOAD=NO**. Historical Gemini/PayPal Sandbox is explicitly attributed to the owner's October 28 local run and not verified remotely by this CI.
- **Categories:** script enters `AI Work`, switches to `Global Services` and checks three synthetic profile cards, then returns to `AI Work` for a common quote/contract demonstration. The manifest gate requires `storyboard_version=OPPORTUNITY_FIRST_V2` and `demonstrated_categories=[ai_work,general_services]`.
- **Other green jobs:** Linux Node regression, actual Chromium UI journey, fast private WebM candidate and Windows first-run recording; all **SUCCESS** for the same commit.

## Reproducibility without unnecessary CI cost

The full-duration GitHub Actions job runs on pull requests or on an explicitly tagged push commit message `[video-full]`. Ordinary development pushes still run the quick unit/browser and Windows checks without re-recording a full-length clip.

## Boundaries and remaining tasks

1. The recorded WebM was **ephemeral in the private CI runner**. No durable public video URL or viewable uploaded artifact is established.
2. The original user PC holds any private historical provider evidence. The CI report **cannot certify** an independent PayPal GET or Gemini response.
3. On the user's computer: `git switch lead/paypal`, `git pull --ff-only`, `npm run video:record:owner`, then `npm run submission:candidate:local`. Review the newest ignored `output/videos/` WebM and manifest, including precise claims and visibility/readability.
4. User approval is required for final public footage, source publication and Devpost submission. No production PayPal, escrow, intermediation partnership or real marketplace liquidity is claimed.
5. No new Sandbox Create/Capture or paid Gemini call is necessary merely to produce another synthetic video.

**Interpretation:** the under-three-minute duration **technical gate is satisfied in CI**. Final submission and owner visual approval remain separately incomplete.
