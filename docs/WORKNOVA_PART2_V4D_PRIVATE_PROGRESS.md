# WORKNOVA — private Part 2 v4d + offline voice pipeline (2026-11-08 KST)

## Source, decisions, reproducibility
- Owner-approved WORKNOVA midnight-navy/cyan/indigo identity, favorite original Kokoro ONNX FP16 af_heart voice and click style, 170s under-three-minute target. Preserve original sources and no alternative OS/cloud voice.
- Library original `WORKNOVA_Handoff_20261108.zip` SHA256 `b9b2bdeafeaed5ab9c06a4432e3d12f38c1ab8beeab99b44102d5cd76fb0987a`, v3, v4b, original recovered 179.48s WebM and v4c remain unmodified.
- Exact 170s v4c parent `WORKNOVA_Premium_Design_Audio_Private_170s_1080p_v4c.mp4` SHA256 `96941f892dc91f4c7508b2d70fdec67ba93acb2738a71b997e781c6dd198d7a8`.
- Two options considered: full 170s re-encode (container exceeded 180-second limit, incomplete output discarded) vs independent 50s Part2 patch preview (completed, no parent overwrite). Selected the latter while full-length final and neural speech remain blocked. No lower-resolution replacement.

## New 50s private preview — not a full final film
- `WORKNOVA_Part2_50s_Visual_v4d_PRIVATE.mp4`, 50.000 seconds corresponding to film 104–154s; 1920×1080/25fps/1,250 H264 frames, AAC 48k stereo, **9,391,246 bytes**; SHA256 **`4ebfa2497d979e4ac0a7e74de3fb8fd266d6318fa87d8b17bf5c955e90afa3b7`**.
- FFprobe and whole-file FFmpeg decode PASS, 15 distributed frames inspected. A2A from verified UI 113–119s was slowed to 11s so Gift UI does not enter; right-side card shows fictional offer $345 → counter $290 → counter $299 → accept $299, clearly `NOT PAID`. Churn is isolated from adjacent Gift UI in a branded crop with fictional 20% retention ceiling/no subscription change. Invoice adds an editorial review-first panel in unused whitespace. Delegate/Gift retain the existing source.
- `scripts/worknova_part2_v4d_private_editor.py --check-plan`; render with `python scripts/worknova_part2_v4d_private_editor.py --source PATH_TO_VERIFIED_V4C.mp4 --output NEW_PART2_v4d.mp4`. Only the exact parent v4c SHA passes; refuses existing outputs. Optional Pillow, FFmpeg/ffprobe and a local TTF font are required. This creates **50s preview only**. No binary in GitHub.
- Actual Part2 narration is absent; preview audio is only re-encoded existing ambience. No fully heard/word-level subtitle claim.

## Voice recovery and synchronization
- `python scripts/worknova_voice_locator.py --root PATH_TO_OWNER_LOCAL_WORKNOVA_PROJECT` is bounded and read-only. It checks for original `kokoro-v1.0.fp16.onnx` and `voices-v1.0.bin` in the same folder with pinned SHA256, never downloads/copies/uploads, skips symlinks. In this environment only 15 scratch directories were scanned, model **NOT FOUND**; owner Windows location is unverified.
- Existing `scripts/worknova_part2_neural.py` must synthesize real five-scene pinned `af_heart` WAV and JSON locally. Then `python scripts/worknova_subtitles_from_voice.py --wav PATH --check-only` verifies 170s PCM16 mono 24k, WAV SHA, strict report/voice/plan/source hashes, cue text/order and actual spoken lengths. `--wav PATH --output NEW_FILE.srt` emits non-overwriting bilingual cue-level SRT based on actual render durations, not word-level ASR. No external provider request.
- Local test: `python -m unittest discover -s tests -p test_worknova_part2_editor_pipeline.py -v`: **5 PASS / 0 FAIL / 0 SKIP**. Synthetic WAV fixtures exercise guards only, not real model inference. Scripts compiled; FFmpeg full Part2 preview decode PASS. GitHub Actions for this commit must be verified separately.

## Boundaries and next
- UI is local offline Playwright synthetic footage; automated clicks are not human-operated. No PayPal/Gemini API requests, payment, production deployment, public YouTube, Devpost, or main merge.
- Missing: confirmed pinned owner Windows voicepack and local model, five newly rendered Part2 cues, true cue-level subtitle output from them, reviewed full 170s master, owner full ears-on/pixel privacy QA, independent real provider/public judge verification and explicit publication approval. Overall prior product estimate **79/100 unchanged; RELEASE HOLD**.

## 2026-11-08 KST — independent v4d audiovisual static-hold QA addendum

- Audio/visual **full decode PASS** and `blackdetect=d=0.1:pix_th=0.08` reported no black frames in the 50-second v4d preview.
- `freezedetect=n=-45dB:d=3` identified near-static chapter holds around film-relative Part2 offsets 0.2–7.8, 8–19, 31.2–39.76 and 40.2–49.8 seconds, among others. These are extended fixed UI states, **not necessarily decoder freezes**; they remain an editorial pacing risk and must not be reported as fluid visual interactions.
- A separate 50-second optical 2% microzoom experiment did not materially reduce freeze detection and was **not selected** as the new preferred film. Keep hash-pinned v4d preview and v4c 170-second parent; instead improve actual UI transitions/active browser footage when building final 170s.
- Private review kit `WORKNOVA_Part2_v4d_PRIVATE_Review_Kit_20261108.zip` contains v4d clip, 15-frame contact sheet, scripts, regression test, README and manifest; ZIP 8,581,729 bytes, integrity `testzip()=None`, SHA256 `237b57f03738455c534661f3f4ef06feb64e1643e4695b54c5eaf4d7f79eef27`. Downloadable from this chat, **not Library or GitHub media**.
- Latest code commit `4e755707db4f8c5e53fe3325e131f430e8e1ff4c` actual GitHub Actions offline smoke #42434094802 and offline payment-contract tests #42434094803 both **SUCCESS** at this SHA; local Python pipeline tests 5/5 PASS. No new model-backed neural speech, 170s final re-render, full ears-on review, Vercel production validation, PayPal/Gemini call or publication. **79/100 unchanged, RELEASE HOLD**.
