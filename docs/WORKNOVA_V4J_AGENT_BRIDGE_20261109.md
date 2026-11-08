# WORKNOVA v4j — 10-second Agent Economy bridge visual improvement (2026-11-09 KST)

## Decision and alternatives
- Owner explicitly deferred **all new voice/subtitle work until final video-design approval**. This change is video-only.
- Option A: trim the old static 94–104s transition. Faster, but distorts the 170s timing and corresponding existing AAC cues.
- **Chosen Option B:** preserve 10-second duration, original WORKNOVA cyan/navy brand image and existing AAC, show five short crossfaded editorial cards (Delegate, Negotiate, Discover, Retain, Resolve). No provider calls or new footage. Cards are **editorial summaries of OFFLINE synthetic UI**, not live agent/browser actions.

## Original source and new artifacts
- Exact v4i 170s film SHA256: `e6697900a1f93acc4860bf72c780c6674e29b1cb78ae49c1966a7749efc2af0f` (unchanged).
- Exact original owner-supplied Part2 bridge PNG SHA256: `8859ff303dc44d276c6bbd05a37a3c8514476114bef755525715a2131a79ad50`.
- New 94–104s 250-frame H264 **video-only** bridge SHA256: `9c923fc0e8026845ef8414cc77b36ff0fbcf34e03c6442224ad58ae595d14067`.
- New private full 170s film SHA256: `c0ae70b7ebf6cfee08b49f108e405631198aa1cdf0307b41a86bf116a6fc296e` (45,489,097 bytes). 1920×1080 H264/AAC, 25fps, 4250 frames; full FFmpeg audio+video decode exit 0.
- AAC packet MD5 old/new: `2959cc9c1f5ee996edaefb3b06a147ea`, exact bitstream equality. Original voice/click/music untouched.
- Seven sampled RGB frames outside bridge at 2, 50, 90, 105.2, 126, 160, 168s had **0 mean absolute pixel difference**; 15-point contact-sheet visually inspected across boundaries and five new feature title beats.
- 8 new focused Python safety unit tests PASS / 0 FAIL / 0 SKIP locally. ZIP extraction and rerun of the *corrected portable test layout* also 8/8 PASS. The initial ZIP contained a test path mismatch; retained as historical v1, replaced by a separately named v2 kit.

## Reproduction and constraints
```powershell
python scripts/worknova_v4j_bridge.py --check-plan
python scripts/worknova_v4j_bridge.py --brand-bridge 'PRIVATE_BRAND/brand_part2_bridge.png' --source 'PRIVATE_V4I_170s.mp4' --bridge-output 'NEW_10s.mp4' --full-output 'NEW_170s.mp4'
python -m unittest -v tests/test_worknova_v4j_bridge.py
```
Both input SHA256s are pinned, 94–104s is frame-exact, only output-specific new filenames may be used; sources are never overwritten. Requires Python 3, Pillow, FFmpeg/ffprobe, a local TrueType font. Original brand image is supplied privately in the v2 ZIP/Library and NOT GitHub.

## Gates / nonclaims
- No new TTS, new speech, captions, real PayPal/Gemini requests, payments, deployment or public upload. Actual provider evidence and production are separate from this visual QA.
- Owner has **not yet watched/approved all 170s**. Release HOLD, project-wide prior verified score **79/100 unchanged**.
- Private copy persisted in Library `/WORKNOVA PayPal Hackathon/2026-11-08 Handoff/v4j-design-20261109/` as `WORKNOVA_v4j_PRIVATE_Review_Kit_20261109_v2.zip` (8 files; SHA256 `8363d52dacad53cf7b95f7b46c3e8834943bb1058a389b03e5b573699f536e6a`). Earlier original v4i/v4h/v4c untouched.

## Next
Review if five cards and pacing are visually final; improve other *verified* static sections only if actually necessary. After explicit visual lock, perform **one** owner-approved Kokoro FP16 `af_heart` synthesis/subtitle pass, full AV audit, and separately authorized submission checks.
