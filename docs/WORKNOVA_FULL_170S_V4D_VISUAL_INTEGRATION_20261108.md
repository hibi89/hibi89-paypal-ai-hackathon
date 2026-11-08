# WORKNOVA full 170s visual-only integration v4d — 2026-11-08 KST

**Scope:** The approved WORKNOVA v4c 170s source and its Kokoro af_heart Part1/click/ambience AAC remain intact. Insert only the separately verified Part2 v4d visual chapter (104–154s). This is an **offline synthetic video, private review only**. No new voice, payment, provider API, production or public upload.

## Exact media evidence
- Input v4c: SHA256 `96941f892dc91f4c7508b2d70fdec67ba93acb2738a71b997e781c6dd198d7a8`, 170s / 4250 frames
- Input Part2 v4d 50s: SHA256 `4ebfa2497d979e4ac0a7e74de3fb8fd266d6318fa87d8b17bf5c955e90afa3b7`, 1250 frames
- Result whole film: SHA256 `d74482b77770259a5cf18f4cd81a6e4b15264ce401431ef65d3e21530dbaebdb`, 45,576,653 bytes, 170.000s, 1920×1080, 4250 H264 frames, AAC 48k stereo
- Original/new AAC packet MD5: `2959cc9c1f5ee996edaefb3b06a147ea` **identical**
- FFmpeg whole 170s video+audio decode error-free (independent check), 12 scene/boundary frame audit PASS; no complete owner ears-on listening or narrated transcript QA
- Reproduction check independently created byte-identical SHA via script. Python unit tests: 14/14 PASS locally, including 4 new safety tests. GitHub CI for this new commit is separate; do not inherit older CI claims.

## Reproduce without quality-loss
```powershell
python scripts/worknova_v4d_fullcut.py --v4c "PATH_TO_v4c.mp4" --part2 "PATH_TO_v4d_50s.mp4" --output "NEW_PRIVATE_170s.mp4"
```
The script hashes both inputs, checks streams and frames, cuts 2600/1250/400 video packets, concatenates without re-encoding, and copies v4c's AAC. **Use output-side `-ss 154`** for the final segment: input-side seek previously generated 150 instead of 400 packets despite MP4 header claims. No overwritten output is allowed.

## Unfinished gates
Five actual new Part2 Kokoro FP16 `af_heart` cues need the owner-local pinned model & voicepack. The film's Part2 currently has visual-only narration plan, not the finished voice. Later integrate actual WAV with `scripts/worknova_private_voice_mux.py` **only after allowlisting the new exact full-film SHA and confirming the existing v4b/v4c time windows remain identical**. Do not feed this new master into the old SHA-pinned mux blindly. Generate voice-aligned bilingual captions, inspect/listen all 170s, verify legitimate public judging access/provider evidence and obtain owner approval before release. Historical PayPal Sandbox evidence is separately qualified; no new external activity occurred.

Sources and v3/v4b/v4c remain unchanged; no media binaries, model weights or secrets in GitHub. Full video exists as private ChatGPT conversation artifact only, **not yet in Library**. Product completeness remains 79/100, RELEASE HOLD.
