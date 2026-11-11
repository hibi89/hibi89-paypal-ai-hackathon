# WORKNOVA Step74 — TWO BGM versions + logo and UI transition repairs (owner-private)

**Status: created and machine-verified, not yet owner-approved for public upload.** Date 2026-11-12 KST.

## Why / input preserved
- Owner detected a WORKNOVA logo screen lasting ~0.6s at old 15s, requested at least ~2s.
- Owner identified unnatural UI clicking at 40–47s (specific hard match-to-quote cut ~42.24s) and at 2:39–2:45 (payment/control screen jump near 162.8s).
- Owner asked for *two* competing music variants: original BGM and more innovative BGM.
- Prior approved original video `WORKNOVA_175S_FINAL_OWNER_REVIEW.mp4` SHA256 **`f0be42706ecf153482cdde2cf447562c565b6efe7333ae8a61beeee99dabda1a`**, 17,835,474 bytes and 175.000 seconds, **not overwritten**.

## Implemented media edit
- New logo hold: old 15.00s WORKNOVA intro frame repeated for **40 frames (1.6s)** before resuming the original 15s video, causing **~2.2s legible logo**. Total length becomes **176.600s (2:56.6)** under contest 3-minute limit.
- Match→Quote: original source segment 35–45s reencoded at CRF18 and 25fps, with eased cross-dissolve from authentic screenshot at 41.92s to screenshot at 42.64s during **41.96–42.56s** (new **43.56–44.16s**). No new cursor clicks manufactured.
- Control→Payment: original source segment 159–166s reencoded at CRF18 and 25fps, with eased dissolve of authentic screenshot at 162.48s to screenshot at 163.52s during **162.60–163.40s** (new **164.20–165.00s**). Existing authentic shots and earlier surrounding transitions remain.
- Other H264 segments copied directly at exact keyframes; therefore sampled decoded images outside modified segments match baseline at t+1.6s, but **no full-frame pixel parity claim** across the deliberately reencoded source segments.
- Existing 175s voice/BGM was spliced with an original 1.6s *nonverbal* synthesised brand-sustain cue at 15s. No wholesale loudness normalization; existing owner-original narration and original soundtrack remain, with the existing voice-restoration section now approx 51.6–81.6s. AAC audio was re-encoded.
- The innovative alternative uses a **second original music layer** (procedural atmospheric pad, pulses, synthetic noise hats and plucks), restrained and ducked around original audio. **NOT a clean instrument-only soundtrack replacement**: no vocal stem separation performed. New instrumental layer RMS ~-34.77 dBFS. No borrowed song, samples or third-party audio recordings.

## Machine verification and deliverables
- **Version A: original BGM** `WORKNOVA_176S_ORIGINAL_BGM_LOGO_AND_CLICKS_FIXED_REVIEW.mp4`: **18,409,801 bytes**, SHA256 **`a8a2ae2cbfa76b5e0abba66b6d74bcd75b7e53d5d5b8d30ba5dcad9ebf56f812`**.
- **Version B: innovative new BGM added** `WORKNOVA_176S_INNOVATIVE_BGM_LOGO_AND_CLICKS_FIXED_REVIEW.mp4`: **18,468,137 bytes**, SHA256 **`ede0e01e50ce8af8a7350d79fbb819badc81dd531c0d1ca16e3ea64c33a8ddfc`**.
- Both output films: **176.600 s**, 1920×1080, 25 fps, **4415** H.264 video frames, AAC stereo audio, no subtitle stream, full FFmpeg decode **PASS**. No Korean subtitles deliberately authored or burned into edited frames.
- Owner download-only ZIP `WORKNOVA_176S_TWO_BGM_FINAL_OWNER_COMPARISON_20261112.zip`: **39,315,257 bytes**, SHA256 **`aa54e22d315cc601351e2502318cc1e3a150768f9bd4553a349ccb994e129902`**, 2 movies + 4 short previews + Korean README + visual montage + QC JSON, total 9 files, ZIP integrity 9/9 PASS, embedded films match on-disk originals.
- Previous source and docs SHA `3523b7efb9f8cd90c83541985c55ac49af2feafb` GitHub Actions Smoke #42993084192 and Offline payment-contract #42993084093 both SUCCESS. No changes to application backend/frontend, runtime tests, env or deployment this Step.

## Release boundaries / required owner review
- Film editing and cryptographic integrity PASS are **not subjective quality or media-rights approval**. Owner must watch logo and both click windows in playback and compare voices/music throughout, especially prior 44–45s voice restoration now shifted +1.6s.
- Both film versions retain the same project demo (working offline mock browser flows plus aspirational AI-agent future), not independently proven integrated live Gemini↔PayPal transactions, current global talent onboarding, PayPal partnership or market rank.
- Films and package exist only as downloadable, ephemeral ChatGPT conversation files. Never commit private media/receipts to the public repo without explicit instruction; no Library save requested.
- Select ONE option, adjust Devpost final video duration, verify rights, publish YouTube **Public**, submit official Devpost before **2026-11-13 05:00 KST**, and archive public URL and submission confirmation. YouTube and Devpost NOT DONE at this point.
