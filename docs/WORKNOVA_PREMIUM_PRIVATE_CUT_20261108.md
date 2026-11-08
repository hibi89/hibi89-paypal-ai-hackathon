## 2026-11-08 KST — owner-preferred WORKNOVA premium design refinement v4b (PRIVATE)

- **Goal:** Keep the approved `WORKNOVA` brand (existing `assets/brand/worknova-logo.svg`, `assets/brand/worknova-hero-16x9.svg`) and owner-liked recovered Kokoro `af_heart` narrator/click styling; improve scene authenticity and legibility without changing any real app behavior.
- **Problem found in v3:** quote block held a frozen screenshot for 12 seconds; Agent A2A/Gift/Churn titles led into adjacent feature footage because earlier source-time offsets were imperfect; static title cards lacked even subtle motion.
- **Implemented, no data overwrite:** generated **new** `WORKNOVA_Premium_Design_Audio_Private_170s_1080p_v4b.mp4` in temporary ChatGPT editor workspace. Added subtle motion on approved original intro/bridge/outro stills; split quote chapter into actual marketplace match, proposal and approval UI shots; recut A2A (source 82.2–89.7s expanded to 11s), Gift Finder (93.2–103.9s expanded to 12s), and focused/re-timed other four agent clips from the same authentic Nov 8 WorkNova UI recording. Retained 14 scenes, full 170s final private film.
- **Concrete verification:** output `1920×1080`, H.264 video / AAC 48 kHz stereo, **170.000s**, **39,781,110 bytes**, SHA256 `abe1b4094f0d11b526a5c467a1b79939c18a45c9f6adab4524ac66d8337c2494`. FFmpeg entire decoded video/audio without errors, full duration probed. v3 and v4b audio stream packet MD5 identical: `2959cc9c1f5ee996edaefb3b06a147ea`; existing approved af_heart Part1 excerpts **preserved**, not regenerated. Audio mean -26.5 dB, sample peak -6.2 dB. Contact sheet `WORKNOVA_Premium_v4b_ContactSheet.jpg` sampled 17 cut points and corrected previously mismatched A2A/Gift labels.
- **Independent limits:** Audiovisual decode + visual sample checks do not prove complete auditory editorial review; original speech not fully transcribed; **Part2 dedicated Kokoro narration still missing** because owner-local model not found. Current stream contains existing Part1 excerpts only, plus ambient music. Caption guide is not a verified verbatim voice transcript. Still a **PRIVATE REFERENCE — NOT FINAL**.
- **Source provenance:** actual WORKNOVA browser source `worknova-automated-two-part-20261108-085904-132859.webm` (SHA256 `4dc5c379c58d0fd64ae5d8b273072638f0cf718cbd646eda0c71afbd6e61d290`). Those clicks are Playwright automated UI, **not operator-verified manual input**; offline synthetic app never performed live PayPal/Gemini actions. Owner-approved legacy narrator source `proofline-premium-narrated-recovered-20261107-233338-c6315d99.webm` kept unchanged. V3 SHA256 `895b83f3689598e1fef29514f772f6cbf80a4ec64baf399b079e0b4a3d28c078` remains rollback.
- **Repository:** `hibi89/hibi89-paypal-ai-hackathon` / `lead/paypal`, no source code modification or new CI claim. The edited video, contact and scripts are local conversation artifacts, not GitHub binaries; user must download to retain. GitHub stores edit decisions and hashes only.
- **Next design and release gates:** preserve approved visual identity; correct Part2 voice with pinned offline `af_heart` if recoverable, otherwise stop instead of swapping in unapproved synthetic TTS; align English/Korean subtitles to actual audio; check spoken legacy brand and all 170s on user speakers; verify actual reviewer access/provider evidence, then obtain separate owner approval for any public YouTube/Devpost actions. 79/100 overall preserved, RELEASE HOLD, Production SHA/URL unverified.


---

# WORKNOVA premium reference video — private 2026-11-08

## Source of truth for visual treatment
- Owner-selected and strongly preferred earlier video: `proofline-premium-narrated-recovered-20261107-233338-c6315d99.webm`, 179.48s. Use **the same natural offline Kokoro af_heart voice and click/cursor pacing as reference**, not an unapproved TTS voice.
- Approved brand: **WORKNOVA**; assets `assets/brand/worknova-logo.svg`, `assets/brand/worknova-hero-16x9.svg`; direction `docs/WORKNOVA_BRAND_AND_VIDEO_CONCEPT.md`.
- Visual palette: midnight navy #06111F, blue #0A1B31, cyan #38BDF8, indigo #6366F1; premium cinematic fintech composition with authentic actual product frames and clearly attributed offline evidence.
- Current updated UI source: owner-recorded `worknova-automated-two-part-20261108-085904-132859.webm`, SHA256 `4dc5c379c58d0fd64ae5d8b273072638f0cf718cbd646eda0c71afbd6e61d290`, verified local owner device manifest says Git SHA `373a0946`, two marketplace categories + five AI skills, **Playwright automated not owner-operated**.

## Private reference v3 — generated, not released
- Render name: `WORKNOVA_Premium_Design_Audio_Private_170s_1080p_v3.mp4`, duration **170.000s**, 1920×1080, H.264 video / AAC stereo 48kHz, 59,223,539 bytes.
- SHA256: `895b83f3689598e1fef29514f772f6cbf80a4ec64baf399b079e0b4a3d28c078`; independently checked against sidecar after rendering.
- Uses GitHub's approved SVG brand images and WorkNova-labelled real browser UI. Original af_heart voice snippets reused **only for appropriate Part 1 chapter sections**; old Proofline intro/outro narration intentionally omitted. No new speech model generation.
- Existing 170s silent reference cut had a broken quote chapter that showed unrelated evidence frames; the new v3 holds the real quote-approved screenshot in its approval chapter, with distinct historical Gemini/PayPal evidence afterwards. Some static approved-quote hold may require shorter editorial retiming.
- Current cursor in WORKNOVA auto recording is **Playwright-generated visual pointer + ripple**, not a verified human input. Never claim manual operator clicks or fresh provider actions.

## Still to do before final
- **Not a release candidate**: Part 2 dedicated Kokoro af_heart narration remains missing because approved pinned local model/voicepack absent; audio reuse from old recording cannot truthfully fabricate new narration. Original narration has not been fully word-level transcribed or independently listened through; owner audio/editorial review required.
- Verify spoken words against new scene order and remove any obsolete Proofline word or unsupported live-service claim; ensure subtitle timings are a true speech transcript, not chapter guide alone.
- Inspect full playback for black frames, frozen proof-card pacing, crop/legibility/cursor-sync, AAC volume, transitions and all five distinct skills. No real PayPal or Gemini calls in the new recorded UI.
- Original WebMs/MP4s and original voice assets preserved; v3 is ephemeral ChatGPT conversation output and must be downloaded before relying on persistent availability.
- No new GitHub main merge, YouTube upload, Devpost submission, production deploy, provider GET/POST or payment was performed. **RELEASE HOLD**.

## Reproduction / proof boundary
- Only this edit specification and state notes are stored in GitHub. No video/audio/media binaries or credentials stored there. Scratch rendering script and 170-second private MP4 reside in temporary conversation artifact storage, not reproducible on a random Git checkout by themselves.
- CI at functional SHA `c75b51f5fac3ecf17a6094d28d81f0c956dc5451` 1203/1203 PASS verified auto capture functionality; that CI does not verify this edited v3 movie. Production SHA/URL remain unverified.
