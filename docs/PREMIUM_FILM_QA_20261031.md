## 2026-10-31 — Owner approved free offline neural voice provisioning

User explicitly accepted the free local Kokoro route. After consulting upstream [thewh1teagle/kokoro-onnx model-files-v1.1](https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.1), we selected the **FP16 English model** (upstream ~164MB, near-FP32 signal correlation 0.999) plus ~28MB English voices instead of 326MB full-precision weights. No paid API or text/video uploads. **The model has NOT been installed on the user's PC by ChatGPT; the user must run the one-time command below.** The installed runtime is isolated to the existing gitignored `.video-venv` Python environment; public model files remain in ignored `output/voice-models` and never GitHub.

**One-time Windows PowerShell provisioning (requires existing clean `paypal-premium-review`, local Python video venv and explicit user approval already given):**

```powershell
git status --porcelain
git -c gc.auto=0 -c maintenance.auto=false pull --ff-only origin design/proofline-premium-film-20261031
npm run video:voice:setup:owner
```

The installer `scripts/install_owner_neural_voice.ps1` downloads public model files from **only upstream GitHub model-files-v1.1** using TLS/HTTPS, verifies full SHA-256 against `f3a290d384fbb27966d462905c71a46cef9e5fd00516b40df32a0b4afe77ac96` (FP16) and `bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d` (voices), refuses existing corrupted assets or overwrite, installs pinned local `kokoro-onnx==0.6.1` + `soundfile==0.13.1` through pip wheels, does not change global Python or original media. Hash references from release-compatible offline deployment reference [JakeTTS](https://socket.dev/pypi/package/jaketts/overview/1.0.10) and upstream artifacts. The hashes are validated against actual downloaded bytes before use. On failed download checksum the temporary file is removed and the command stops.

**Audition BEFORE recording or doing 13 full cue syntheses:**

```powershell
npm run video:voice:neural:owner -- --sample-only --voice af_heart
# Alternative male English sample:
npm run video:voice:neural:owner -- --sample-only --voice am_michael
```

These commands synthesize a *fixed sanitized English Proofline sample*, without private historical evidence, provider calls, accounts or a browser recording. Saved isolated under `output/videos/private-neural-samples/`; owner plays the WAV locally to accept/reject voice. Do **not** claim quality without owner hearing it. No model/runtime calls are made by GitHub CI.

**After voice is accepted and latest exact-HEAD full-length CI passed, create fresh film and merge voice** (new film must match the new source SHA and remain <180s):

```powershell
npm run video:record:premium:owner
npm run video:voice:neural:owner -- --voice af_heart
```

This writes **new private WebM**, does not overwrite the old 118.12s rejected draft, does not regenerate Windows SAPI or call Gemini/PayPal. It reuses the existing bounded mux and checks media duration/2 streams. Source integrity and `NO_PROVIDER_REQUESTS` required. Capture/narration quality still require actual viewing and listening to recorded film. **No public upload, PR merge or Devpost submission without separate approval.**

---
## 2026-10-31 KST — Owner first-playback editorial failures and premium retake design

**Owner feedback on actual Windows narrated recovery (`proofline-premium-narrated-recovered-20261031-023540-aab70e35.webm`, reported 118.12s):**
1. The first hero/value-proposition screen disappears too quickly, with no visible CTA transition; viewer cannot see what takes them into next screen.
2. Middle/review stages move too quickly, sometimes no visible cursor on active controls; feels like invisible synthetic system action, not a human browser workflow.
3. Installed Windows SAPI voice is audibly unacceptable (poor audio quality and robotic delivery). **Do NOT use SAPI draft as submission audio.**

**Code-level causes confirmed:**
- Original premium recorder filled `#marketplace-brief` BEFORE showing the introduction caption/voice, which auto-scrolled away from hero.
- `page.mouse.move(...,steps=14)` sent movement events faster than recording frame interval, and `#confirm.check()` was an actual unfilmed programmatic checkbox action.
- Immediate back-to-back quote/contract/reviewer controls and 6.5s evidence cards outran narration in the final cut.

**Retake changes (premium-only, original data and standard capture untouched):**
- Start at top-of-page hero with **up to 7.8s readable screen** at owner's 6500ms pace, opening voice cue, on-screen `START HERE` guide. Then a **real guided cursor click on `a.hero-cta`**, navigation to marketplace, and only then enter the project brief. The viewer sees exactly what opens the next screen.
- All premium button, dropdown and checkbox actions use actual Playwright pointer or select events. `film_move_to` moves across recorded frames with eased coordinates, and smooth-scroll only when not in view. Targets highlight at click/selection; major versioned quote, approve, delivery, reject and accept UI states hold an additional frame-visible ~1.55s at owner pace.
- The three historical evidence-lens cards remain on-screen at least 9.5s each at owner pace to cover their associated speech; reduced small waits in 250ms CI mode. All source disclosure text and provider-call/payment safeguards remain.
- A real owner full-length premium recording still needs to verify **encoded runtime <180s**, legibility, visible cursor, scroll and real audio synchronization after retake. No quality percentage without human/audio review.

**Voice decision comparison (no downloads, provider calls or payment authorized so far):**

| Method | Estimated cash | Expected voice improvement | Privacy/dependencies | Current status |
|---|---|---|---|---|
| A. **Local Kokoro-82M ONNX** (preferred zero-cash candidate) | $0 | Natural neural English; quality must be auditioned, not guaranteed | One-time model/voice assets ~350MB plus Python dependencies on owner Windows machine; text stays local; CPU inference, no live TTS service | Optional code only, models NOT installed or used |
| B. **OpenAI GPT voice API** | Additional metered API fee (ChatGPT Plus is not API credit) | Controllable English accent/pacing/intonation, likely more cinematic | Sends safe narration script to provider; needs approval for API billing and external transfer; existing Speech endpoint models are marked deprecated for Jan 2027 | Not invoked, not implemented |
| C. Windows legacy SAPI | $0 | Not acceptable after actual owner listening | Local, already generated | Reject for final film |

**Local neural code, no auto-install:** `scripts/render_owner_neural_voice.py` + `scripts/run_private_neural_voice.mjs` and npm `video:voice:neural:owner`. They require a *new* matching source at exact current code SHA and pre-provisioned `output/voice-models/kokoro-v1.0.onnx`, `output/voice-models/voices-v1.0.bin`, and local `kokoro-onnx` + `soundfile` in existing `.video-venv`. No auto-download, no calls to a cloud service; existing original footage and private receipt are read-only. On local execution it generates 24kHz WAV cues, mixes them using `mix_private_voice.py --rate 24000`, then runs bounded `recover_owner_voice_mux.py`; no old SAPI required. Do not run until owner approves model download/dependencies; models/voices are NEVER committed to GitHub.

**Proposed review steps:** Confirm actual owner permission for one-time free local model/runtime installation; after CI green, update owner code, capture new guided premium film and audit runtime, generate local neural voice, listen/sync both full WebM and compare with evidence-lens and provenance. If one free neural voice sample is still unsatisfactory, Stop & Pivot to user-approved cloud provider or manual licensed commercial narration. No merge/publication without explicit user approval.

---

# Proofline — premium film production and PQG-100 gate (2026-10-31 KST)

**State: DRAFT / NOT A FINAL DEMO VIDEO.** This is an offline cinematic editing and reviewer plan, not proof of actual Gemini/PayPal calls. No public upload, submission, source release, external TTS, PayPal CREATE/CAPTURE, or new provider API requests are approved here.

## Production decisions

- Approach A (chosen now): preserve the tested real DOM, accessible controls, synthetic backend and provenance. Layer a cohesive dark product design; capture browser-driven pointer moves, typed text and UI responses in Playwright. It is cheaper, reversible and reduces regression risk.
- Approach B (deferred): rebuild React/component hierarchy and frontend UX. More flexibility but higher functionality, schedule and security regression risk; requires separate scope approval.
- Design source: `web/offline_demo.html`. Original state/control logic, security and original `main` are untouched.
- Optional recording source: `scripts/record_judge_demo.py --premium` / `npm run video:record:premium:owner`. Recording remains private, **silent** WebM. No artificial post-edit camera shake or fabricated payment action.
- Existing `npm run video:record:owner`, `owner:final:local` and default CI capture behavior remain unchanged.

## English narration script (editorial draft; NOT synchronized or voiced)

0. Opening / first opportunity:
> Talent is everywhere. Access to opportunity isn't. What if an AI-powered marketplace helped people find their first project—and kept every important decision in human hands?

1. Discovery / two service categories:
> Meet Proofline. From AI engineering and automation to design, writing and translation, buyers explore two markets through one workflow. These profiles and transactions are fictional examples.

2. Matching:
> Describe the work. The marketplace identifies matching skills and makes limitations visible, so a buyer can compare specialists instead of trusting a black box.

3. Human quote approval:
> A proposal becomes a versioned quote. The buyer chooses the amount and explicitly approves the terms. Changing the quote invalidates the prior approval.

4. Technical integration evidence:
> The local demo tests Gemini and PayPal integration logic through injected fake responses. No Gemini request, PayPal order, capture or payment is made here.

5. Historical attribution:
> Separately, the project owner reported an October twenty-eighth Gemini classification and a PayPal Sandbox approval, capture and verification. That is historical owner-reported evidence—not a transaction reproduced in this film.

6. Independent review:
> A synthetic delivery moves through submission, review, rejection, revision and acceptance. Each decision leaves a local audit trail, while payment status remains separate.

7. Closing:
> Proofline is an opportunity-first marketplace concept. Technology supports the process. People remain responsible for approval, work and trust.

**Editorial requirement:** Narration must be actual speech, not music-only. Background music must remain below narration. No fabricated provider calls or pseudo-live claims. Narration TTS/provider choices require separate cost/privacy review; do not upload a private receipt or secret to a voice service.

## 2026-10-31 evidence-lens and offline narration revisions

**User feedback:** The actual browser walkthrough is substantially improved (owner estimated 85/100 *excluding* the middle evidence cards). The old full-screen presentation list was overcrowded and hard to read, and the WebM had no spoken narration.

**Design comparison:** (A) keep a standalone full-screen evidence presentation with fewer bullets, vs (B) use an in-product translucent **Evidence Lens** with compact visualized proof and preserve the browser underneath. **B chosen:** source-specific short labels in ~700 px right panel, large legible typography, skill tags, three-step Sandbox history, A/B provenance comparison. Text is built with DOM `textContent`, never raw receipts; the standard recorder stays unchanged.

**Code:** `scripts/premium_evidence_overlay.js`, `premium_storyboard_cards()`, and `scripts/record_judge_demo.py --premium`; browser recording now enforces evidence panel visibility and no overflow.

**Narration — no microphone needed:** The premium recorder writes a safe `narration_cues` list with actual recording timestamps into its private manifest. The optional Windows-only `npm run video:voice:owner` synthesizes these cues through an **installed local English System.Speech voice**, assembles PCM WAV with Python stdlib and muxes a new private narrated WebM. Neither the original browser recording nor its manifest is altered. An available FFmpeg with Opus is used, or the command may install pinned free `imageio-ffmpeg==0.6.0` to obtain one if needed. Only tooling is downloaded; the narration, private video and receipt stay on the owner's computer. **Voice quality depends on installed voice**; robotic/unclear synthesis fails PQG sound quality and must be replaced. No voice has been heard or approved as part of GitHub code updates.

### Owner-only commands after pulling the exact latest branch

```powershell
git status --short
git rev-parse HEAD
npm run video:record:premium:owner
npm run video:voice:owner
explorer ".\\output\\videos"
```

Both commands only create fresh private files in ignored `output/videos`. The second selects a source-matched premium WebM with verified hash, without touching previous recordings. It produces `proofline-premium-narrated-*.webm`, local narration WAV, and private report. It does **not** independently prove the encoded media duration or editorial polish; final viewing, timing/synchronization, voice naturalness, frame-by-frame legibility and <180 s checks remain required.

## PQG-100 evaluation — not yet graded

| Dimension | Maximum |
| --- | ---: |
| Frontend visual hierarchy, typography, contrast, accessibility | 25 |
| Natural actual pointer, typing, click and UI response | 20 |
| Stable camera/framing, restrained transitions | 15 |
| English spoken narration, mix, caption timing | 15 |
| First 10-second hook and clear value proposition | 15 |
| Truthful source labels: synthetic vs owner history | 10 |
| **Total** | **100** |

**Pass target >=90/100 only after independently watching the rendered video.** Automatic hard fails: noticeable unmotivated camera shaking; illegible critical text; click/UI response mismatch; absent narration; black screens; leaked owner-private details; misleading fake-vs-real transaction wording; or video duration >=180 seconds.

## Verification plan and acceptance

1. `npm test`, Windows offline suite, Chromium AI Work/Global Services/approval/protocol and default recording must stay green at the **exact commit**.
2. Optional `--premium --pace-ms 250` CI capture checks that guided cursor mode genuinely runs, preserves zero provider/payment calls and writes a private synthetic WebM.
3. Owner machine, clean isolated clone: `npm run video:record:premium:owner`. Review the generated WebM before continuing. This command installs only pinned local free tooling if needed; it does **not** generate narration.
4. Improve storyboard, add voiced English narration after editorial approval and check synchronized full encoded duration, color/contrast and six scoring categories. A successful render or CI test is not sufficient for PQG pass.
5. Explicit separate owner authorizations for PR merging, public YouTube and Devpost. Never reset original videos or private Sandbox evidence.

**Current release status:** implementation in separate Draft PR #29 targeting unmerged Draft PR #28 release preview. No released or owner-approved final film.
