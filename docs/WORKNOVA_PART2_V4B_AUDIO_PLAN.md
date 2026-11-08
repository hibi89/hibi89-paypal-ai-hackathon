# WORKNOVA — Part 2 v4b audio sync pass (private, 2026-11-08 KST)

## Baseline and decision
- Owner-approved WorkNova visual and original Kokoro ONNX FP16 `af_heart` sonic identity stay frozen. Original v4b video `abe1b4094f0d11b526a5c467a1b79939c18a45c9f6adab4524ac66d8337c2494`, 170s, v3 and original narrated WebM are immutable references held in private Library.
- Compared **A: shift old five cues** vs **B: scene-map rewrite plus concise script and validated mux**. A is fast but old long lines and incorrect scene bounds can bleed into adjacent shots. B is more accurate and costs no external API; B selected. No new voice audio can be claimed without owner's pinned model/voicepack.
- Actual v4b manifest scenes (seconds): Delegate 104–112, A2A 112–123, Gift 123–135, Churn 135–144, Invoice 144–154. New speech cue in/out are 104.40–111.60, 112.45–122.50, 123.45–134.50, 135.35–143.50, 144.45–153.50. Each has safety head/tail padding.
- The new bilingual SRT is a **scripted draft**, **not speech-verified**; refine timings from actual recorded audio and inspect display after voice generation.

## Correctness and blockers
- Old `worknova_part2_neural.py` aligned Delegate to 108.35 instead of 104, A2A to 116.35 instead of 112 etc. v4b + old WAV would be misleading. New cues enforce scene containment and report `cue_plan_id` plus reference cut hash.
- The private voice mux checks new cue timing/plan and **exact v4b input SHA** before mixing. Its bed ducking must evaluate per frame (`eval=frame`) between 104 and 154s; the former 108–152 treatment did not match current scene windows. Use a different cut only after the cue plan and hash guard are updated.
- Visual still under review: sampled v4b Churn (138s) showed Invoice-like source footage rather than the intended retention shot. Use owner's existing synthetic source around 101.6–105.8s as a possible recut, verify pixel/scene labeling before a new render, and keep v4b intact.
- In current ChatGPT environment, approved local pinned `kokoro-v1.0.fp16.onnx` and `voices-v1.0.bin` were **not provided**, so no actual Part2 neural speech synthesized; never substitute OS/eSpeak or cloud TTS without owner approval.

## Owner-local gated sequence
1. Confirm clean `lead/paypal` source and no credentials in filmed UI. `npm run worknova:video:voice:check-cues` (no network); then `npm run worknova:video:voice:check-model` (hash-only).
2. Only after local pinned files pass, run `npm run worknova:video:voice:part2`. If any scene voice runs too long, stop and shorten that scene's written cue; do not increase voice rate to force a fit.
3. Use `npm run worknova:video:voice:mux -- --video <exact v4b mp4> --part2-wav <new wav> --check-only`, then remove `--check-only` for a **new** private output. No source overwrite.
4. Re-time subtitles from the actual voice, inspect/fully listen all 170s, confirm all five authentic offline UI scenes, visual transitions, safe evidence labels. Never claim Playwright interactions are human clicks.

**Release:** 79/100 previous verified weighted completion, no new external provider checks, production or payment; YouTube/Devpost/public release HOLD. Existing functional CI at `c75b51f5` 1203/1203 applies to code before this audio change, not to a new synthesis/render.
