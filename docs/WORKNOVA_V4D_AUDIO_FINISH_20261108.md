# WORKNOVA v4d 170s — local Part2 voice finish gate (2026-11-08 KST)

## Exact source and scope

- SHA-pinned full 170s **visual-only** film `d74482b77770259a5cf18f4cd81a6e4b15264ce401431ef65d3e21530dbaebdb` assembled from v4c + v4d Part2, approved WorkNova brand and original AAC unchanged.
- New audio **not yet generated**. Old v4b/v4c and the owner-approved `af_heart` source remain immutable. This work does not alter the app, payment code, provider access, data or production.
- An existing audio mux previously allowed only v4b and v4c. Add the exact verified v4d SHA because the Part2 scene boundaries (104–154s) were deliberately preserved, and retain strict original model/voice provenance, cue plan, window, payment, and no-publish guards.
- A new local workflow `scripts/worknova_v4d_offline_voice_finish.py` will preflight the exact video and owner-local hash-pinned Kokoro ONNX FP16 model/voicepack. Only explicit `--render` creates NEW private 170s WAV + manifest, cue-duration bilingual EN/KO SRT, and FFmpeg audio-mixed MP4. Without --render, it creates no file.

## One-time offline owner Windows execution (after obtaining local pinned model directory)

```powershell
python scripts/worknova_voice_locator.py --root ".."
python scripts/worknova_v4d_offline_voice_finish.py --video "PATH_TO_VERIFIED_V4D_170S.mp4" --model-dir "FOLDER_WITH_PINNED_MODEL_AND_VOICEPACK" --check-only
python scripts/worknova_v4d_offline_voice_finish.py --video "PATH_TO_VERIFIED_V4D_170S.mp4" --model-dir "FOLDER_WITH_PINNED_MODEL_AND_VOICEPACK" --render
```

The user-local original model or WAV may only be read, never copied/uploaded. The local script creates uniquely named files in the Git-ignored `output/videos/` directory; if an intermediate step fails it does not delete already completed private voice outputs or overwrite any original. Avoid posting model weights, private metadata, credentials, WAV or media to GitHub. Run only on the owner-authorized offline local checkout.

## Current factual verification

- Matching v4c, v4d 50s, and full v4d 170s SHA256 independently checked in ChatGPT scratch. Old AAC stream bitstream preserved in full v4d film.
- Local Python WorkNova suite **19/19 PASS** after adding 5 new safe negative/preflight cases (incorrect SHA, missing video, symlink, no writes by default); no actual neural speech produced. FFmpeg `amix` filter syntax tested using local *silence* only, with short temporary test output deleted. This is NOT a Kokoro inference test or actual narration.
- Existing full v4d visual-only movie 170.000s / 4,250 frames / H264 1920x1080, full FFmpeg decode previously PASS. Real subtitle-to-voice alignment, entire owner listening and public submission are still missing.
- No external Gemini/PayPal requests, payment, paid services or publication; previous tested completion **79%**, RELEASE HOLD.
- CI on this new source SHA must be independently checked. Production/Vercel URL/SHA NOT VERIFIED.

## Alternate if model not found

Do not replace the owner-approved `af_heart` with robotic TTS or counterfeit neural audio. Stop the voice stage and preserve all existing outputs. Use the verified 170s visual-only reference for editor review until the original local Kokoro model and voicepack can be located. Publication still requires full owner editorial review and explicit release approval.
