# WORKNOVA — v4c Churn Saver corrected scene, private edition (2026-11-08 KST)

## Immutable sources and verified new output
- Source Library ZIP: `/WORKNOVA PayPal Hackathon/2026-11-08 Handoff/WORKNOVA_Handoff_20261108.zip`, 27 entries, SHA256 `b9b2bdeafeaed5ab9c06a4432e3d12f38c1ab8beeab99b44102d5cd76fb0987a`.
- Original private **v4b**: `01_CURRENT_PRIVATE_PREVIEW/WORKNOVA_Premium_Design_Audio_Private_170s_1080p_v4b.mp4` SHA256 `abe1b4094f0d11b526a5c467a1b79939c18a45c9f6adab4524ac66d8337c2494`.
- Original **automated Playwright** UI (not human clicking): `04_WORKNOVA_AUTO_RECORDING/worknova-automated-two-part-20261108-085904-132859.webm` SHA256 `4dc5c379c58d0fd64ae5d8b273072638f0cf718cbd646eda0c71afbd6e61d290`.
- New **v4c** private cut: `WORKNOVA_Premium_Design_Audio_Private_170s_1080p_v4c.mp4` SHA256 `96941f892dc91f4c7508b2d70fdec67ba93acb2738a71b997e781c6dd198d7a8`, **39,744,015 bytes**. 170.000s, 1920x1080, 25fps/4,250 H.264 frames, AAC stereo 48kHz; FFmpeg whole-file decode PASS.
- Existing v4b AAC packet MD5 `2959cc9c1f5ee996edaefb3b06a147ea` identical in new v4c. No voice audio generated; all original media untouched, no provider calls, no publication. This v4c binary is a temporary private output/download, not pushed into GitHub.

## Visual defect and targeted change
At 138s, the v4b `04 / RETAIN / CHURN SAVER` title displayed the Invoice/Dispute interface. Original automated source footage has the correct fictional retention-proposal form/status between 101.5 and 105.6s; at 102–105s it shows a 20% fictional policy discount and explicitly says no real PayPal subscription changes. Replace **only** film 135–144s with that UI, stretched from 4.1s source to 9.0s and reframed with the existing navy/cyan WorkNova brand. All other film frames and audio kept.

## Reproduction (FFmpeg offline, no payment/provider actions)
1. Extract source v4b MP4 and automated source WebM from verified Library ZIP into a separate scratch directory. Never write into ZIP or overwrite original inputs.
2. Produce isolated 9s H264 patch from source WebM using `-ss 101.5`, `trim=duration=4.1,setpts=(9/4.1)*(PTS-STARTPTS),fps=25`, crop `1280:720:320:155`, scale 1600x900 and pad to 1920x1080; add approved chapter header/footer and fictional demo disclosure; video-only, H264 high, 25 fps, CRF 19.
3. **Important:** extract before with `ffmpeg -i v4b.mp4 -frames:v 3375 -map 0:v:0 -an -c:v copy before.mp4`. An initial `-t 135` copy emitted **3,377** frames and 135.08s because of B-frame reorder, adding 2 unexpected frames to first v4c attempt. Do not repeat it. Extract after with `ffmpeg -ss 144 -i v4b.mp4 -t 26 -map 0:v:0 -an -c:v copy after.mp4` (650 frames).
4. Concatenate before (3,375 frames), patch (225) and after (650) via FFmpeg concat demuxer with stream copy, then mux original v4b AAC using `-map 0:v:0 -map 1:a:0 -c copy -t 170`. No entire movie re-encode required. The audited final has **exactly 4,250** video frames and **170.000s** video and audio, and matches hashes above.
5. Check `ffprobe` streams, 4,250 frames, full decode exit0, audio packet MD5 equality and key frames at scenes 135/144. Inspect multiple frames including 135.2/138/140/143.8/144.2 and save new private manifest/preview. Never mark this as ears-on reviewed without actually listening.

## Audio and truth gates
- Reuse the same source script's v4b-aligned five cue windows for v4c: 104–112, 112–123, 123–135, 135–144, 144–154s. The only change is Churn **pixels**, not scene times.
- `scripts/worknova_private_voice_mux.py` accepts exact v4b or v4c hash, original pinned Kokoro af_heart cue metadata, and **new WAV only**. The original owner-approved Kokoro FP16 files were not supplied to this chat; no authentic new Part2 voice yet.
- Draft bilingual SRT remains **unverified** speech timing. Full subjective visual/audio/security QA and owner approval required before any release. No model download, cloud inference, PayPal/Gemini request, YouTube/Devpost upload or production change.
