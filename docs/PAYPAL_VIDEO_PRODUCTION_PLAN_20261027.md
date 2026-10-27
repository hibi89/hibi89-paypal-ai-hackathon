# PayPal AI Hackathon — Video Production Plan (Owner decision, 2026-10-27 KST)

**State: PLAN_ONLY / NOT_FILMED / NOT_PUBLISHED / NOT_SUBMITTED.** This is a production brief, not video proof. It changes neither the working product scope nor PayPal/AI permissions, progress ledger, production deployment or contest submission.

## 1. Separate the two video deliverables

| Deliverable | Contest status | Length / channel | Current approach |
| --- | --- | --- | --- |
| A. Judging demo video | **Required** by current [REQUIREMENTS](../REQUIREMENTS.md), with official entry conditions to recheck before upload | Public YouTube, **under 3 minutes**; internal target around 2:30–2:40 | Actual running product, truthful end-to-end PayPal Sandbox + AI proof; dashboard/UI first, English captions/narration as appropriate |
| B. Devpost/PayPal community introduction request in Cassie's 2026-10-27 registered-participant email | **Optional, explicitly does not affect judging** | **30–60 seconds** via email-linked form | Consider only after demo is made; reuse real UI recordings and motion/caption assets, **no face shown** preferred by owner |

**Important difference:** the optional email explicitly suggests filming horizontally with **face centered** and asks applicants to describe what they are building, tool impressions (what worked/didn't), and lessons so far. A face-free dashboard/motion piece is the **owner's preferred proposal, not a confirmed accepted substitute** for that request. Check current form/organizer conditions before spending effort or uploading. If face-only footage is mandatory, **skip optional B**; do not ask owner to reveal their face. Email video is opt-in and may be shared in reports/social media; no release without owner approval.

**Deadline:** official contest deadline currently recorded as **2026-11-13 05:00 KST** (internal completion target **2026-11-11**) in REQUIREMENTS. Optional B has no independently verified deadline. Do not confuse the email's sidebar 'Nov 12 — PayPal AI Hackathon' listing with a separate video deadline.

## 2. Reuse prior dashboard/video practice; don't assume a source file exists

Owner recalls a dashboard-video practice session several weeks earlier. Reuse its **technique and any editable footage/assets that are actually recovered and rights-cleared**, not an imagined editable source. Prior course/notes discussed HTML motion-graphic slides followed by screen recording, or React/Remotion to render MP4. The exact prior video project/source and output are **NOT_YET_LOCATED**. When production begins, locate originals first; a flattened recording is not an editable layer project.

### Implementation choices (choose near production)

| Method | Cost | Time/complexity | Quality & reuse | Recommendation |
| --- | --- | --- | --- | --- |
| **A. Real dashboard/browser capture + lightweight HTML/CSS motion/title cards and English captions** | Aim for zero new paid spend with available tools | Lower; fewer dependencies, manual capture/edit of verified flow | Real interaction prioritized; simple to update footage when UI changes | **Default** for mandatory demo and optional 30–60 sec cut |
| **B. React + Remotion programmatic MP4 assembly** | Potentially zero new paid spend for local tools; verify version/license/environment before deciding | More setup/rendering and dependency burden | Excellent consistent motion, timed typography, repeatable exports | Choose only if reuse or richer animations clearly outweigh effort |

Use short feature-proof cuts, kinetic subtitles and clean UI zooms as **candidate styles**; do not claim these are confirmed 2026 trends. At production time, quickly review contemporary examples and actual usage/licensing for music, fonts, assets and export tools. Never divert P0 integration engineering to video polish.

## 3. Priority and storyboard, A — required judging video

**Hard prerequisite:** capture only *real tested* UI and authorized PayPal Sandbox workflow, with evidence of actual Gemini-assisted reasoning. The approved seller/quote/version/amount, virtual Sandbox buyer approval, final captured state and provider GET reconciliation are the narrative backbone. If a stage is only simulated or missing, label it explicitly and do not imply proven payment or deployed capability.

**Proposed 2:35 sequence** (adjust to what is demonstrably working):
1. **0:00–0:15 — Problem / one-screen product hook:** global AI-services marketplace, transparent business workflow.
2. **0:15–0:45 — AI service request / matching / quote:** real model invocation and synthetic seller-profile labels; no invented pricing confidence.
3. **0:45–1:25 — Explicit human approval → PayPal Sandbox checkout:** buyer approval + genuine GET/capture evidence and payment-status distinction. Never show secrets, IDs/tokens or personal account details.
4. **1:25–1:55 — Audit/operations:** demonstrate only the implemented SOVIA-style audit trail and DBVORA-style DB visibility; if unintegrated, describe as roadmap and **do not show as functioning**.
5. **1:55–2:15 — Privacy-safe sponsor BI:** demonstrate only real authorized aggregate/seed-labeled analytics, never unapproved PayPal private data, unfounded market totals or invented adoption.
6. **2:15–2:35 — Safety, reproducibility, next vision:** human gate, idempotency, fail-closed, public MIT repo, accurate current limitations.

The existing [earlier judging storyboard](VIDEO_STORYBOARD_EN.md) contains a 2:40 draft with several **PLACEHOLDER / mock** scenes. The new 5-pillar vision is conditional on actual integration evidence and does not erase the minimum functional PayPal+AI checkout requirement or scope freeze.

## 4. Optional 30–60 second edit, B — only after A

- **0–5 sec:** visual hook from real dashboard (face-free preferred).
- **5–20 sec:** what is being built, AI recommendation/matching plus PayPal payment flow.
- **20–40 sec:** visually evidence-backed tool first impressions — one thing that clicked and one thing that did not, no promotional misrepresentation.
- **40–55 sec:** concrete learning/experience so far, data/audit/BI as proved.
- **55–60 sec:** project identification and clean closing.

Use English subtitles and dashboard/motion graphics; narration could be synthetic/voice-over only if form rules and media usage rights permit. Make an **independent** export suited to the optional form; merely trimming the official demo cannot substitute for the email's three talking points. Since optional B doesn't affect judging, **cancel it if it threatens official deadline, privacy or core QA**.

## 5. Source / verification / release gates

- [ ] Actual authorized PayPal Sandbox purchase/approval/capture/GET and actual AI integration demonstrably shown; mocks identified as mocks, separate from completed proof.
- [ ] Reviewer can reproduce public/source build; public 3-minute-under YouTube link and final Devpost Submitted receipt obtained **with explicit owner approval**.
- [ ] Prior editable dashboard-video source/rights located, or fresh motion assets created without pretending a prior project was found.
- [ ] Screen captures from tested version; English captions, on-screen text, optional voice, music/assets checked for license; readable on mobile; no fake metrics or acceptance claims.
- [ ] No OAuth credentials, merchant/customer PII, private DB, tokens, browser profile, email, personal face or other account identifiers leaked.
- [ ] Captions/transcript and 1080p 16:9 framing checked; scene duration and full playback checked (if feasible).
- [ ] Optional B form's facial-framing/no-face acceptance checked separately; if not permitted, skip optional submission.
- [ ] Owner approves publication to YouTube/form/social media; optional publicity consent is separate from hackathon judging entry.

**Next action:** continue existing P0 real Sandbox + AI integrated application work. Only after footage-worthy validation choose method A/B and produce **required demo first**. Optional clip remains NOT_STARTED and nonblocking. No change to `data/paypal_daily_progress.json` or any D03/D04/D15 completion percentage from this document.

**Repo:** `hibi89/hibi89-paypal-ai-hackathon` · branch `lead/paypal`. Last planning edit: **2026-10-27 KST**.
