# WORKNOVA — 45-second narration seam recovery (owner review only)

Date: 2026-11-11 KST. Product: **95% provisional / RELEASE HOLD**.

## Trigger and selected audio
- Owner compared original and normalized choices and **selected the original loudness**. Owner observed English narration abruptly stop near 44–45 seconds.
- Current owner ZIP original source: `WORKNOVA_OWNER_SINGLE_SUBMISSION_REVIEW_20261111.zip`, file `VIDEO/01_ORIGINAL_170s.mp4` SHA256 `2cd375dde37c914c62f8c92906f09919943c37da055a7cc1793c11471af74dc6`.
- Independent original FFmpeg audio waveform shows the voice/audio level falls from approximately -22 dBFS before 45s to approximately -34 dBFS at 45s and stays music-bed-only until 75s.
- An earlier private `WORKNOVA_v4q3_PREMIUM_PRIVATE_170s.mp4` preserved in the owner's Library still contains narration across 45–75s; its audio outside that segment correlates strongly with the current owner-original footage.

## Private non-destructive restoration
- Generated **private review candidate** `WORKNOVA_170s_ORIGINAL_SOUND_45s_VOICE_RESTORED_PRIVATE_REVIEW.mp4` SHA256 `d343f76ffed616feb156fc8d96e138a46d6b94d68a363de90a3a449ba72b43b5` in the current ChatGPT working container; not committed to GitHub, published, submitted, or uploaded to permanent Library.
- Original user-selected video untouched. Restored narration from earlier private film into 45–75s with short fades at 44.75–45.25s and 74.75–75.25s. Original PCM source is unmodified outside those ranges **before final AAC re-encode**. H.264 video is copied with `-c:v copy`; no global loudness normalization.
- Also created a 39–81s small preview, Korean **editorial scene-summary** SRT (not transcript or verified translation), JSON QC evidence, Korean instructions and a CRC-verified 5-entry review ZIP `WORKNOVA_45s_VOICE_RESTORATION_OWNER_REVIEW_20261111.zip` (18,672,173 bytes, SHA256 `59735ca78071b541c3530fdce08e23e3d90acdadb6cf00adf76d746ceb74b035`).
- QC: 170.000 s, 1920x1080, 25 fps, 4,250 frames, video H.264 packet stream hash **identical** to owner original, full FFmpeg media decode **PASS**, ZIP CRC and embedded file byte comparisons **PASS**. Audio 45.5s half-second RMS `-34.19 → -17.96 dBFS` (music-only to recovered narration + score). The input original and earlier premium source kept intact.

## Explicit limits / next step
- **User has not yet listened to this new candidate.** Voice continuity, 45–75s narration matching the new actual offline browser footage, English speech semantics, rights, and subjective quality remain **NOT VERIFIED**. In particular, a previous-cut voice track can overlap a later-cut visual scene; review 43–47s and 74–77s, then full video before release.
- Korean SRT is editorial scene explanation, **NOT** word-for-word captions; do not claim accurate transcription or burn into judge film without owner review. No new cloud ASR, paid API, model, public release or sensitive credential use.
- Official YouTube must be public and under 180s, owner rights-cleared, then separately approved Devpost entry before **2026-11-13 05:00 KST**. No official submission, public link or receipt yet. Genuine Gemini↔PayPal same-quote OIDC-integrated live proof remains optional/owner-gated and **NOT VERIFIED**.
- Last fully green app/test baseline before this documentary checkpoint: `d6e7f2e33ef09482c6da2460fd9078ae9b2f11e9` CI Offline MVP smoke SUCCESS and payment-contract tests SUCCESS; Node **1,319/1,319** via prior verified pipeline at `e1ea5abde0af6c0254bc32fdb8007f5374a91566`. This media-only work did not change backend, existing test code or `main`. GitHub review doc records proof text only; video bytes live in temporary conversation artifacts pending owner download.

