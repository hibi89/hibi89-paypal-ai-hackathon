# WORKNOVA v4n visual-only Part 2 transition refinement — 2026-11-09 03:22 KST

## Decision / why
- Target is existing private **v4m** 170-second film, verified exact SHA256 `061448ab2ff9c2b97bf8b69fa581f38de90c5820a849d4f6f1987672b1c99f1b`.
- Inspected five functional modules at 104–160s: scoped Delegate, synthetic Buyer/Seller A2A, offline Gift Finder, Churn Saver, Invoice/Dispute. Gift Finder 123–135s had title ghosting during two 0.24s alpha crossfades because different stage text was superimposed; the rest of the film was not altered.
- Two choices: (A) new browser recording/rebuild all five modules, risk to existing evidence and owner interactions; (B) **reuse three already recorded offline keyframes from v4m**, 0.24-second left wipe and splice only 123–134s at the source's verified 134s H264 keyframe. **B selected**; no new fictional clicking, account or provider run, no new narration or subtitles.
- Original 134–135s Stage 3 frame is already the same recorded editorial keyframe; its existing downstream frame bytes are preserved. Source frame times 124.2, 128.2, 132.2 seconds. Each is historical offline source, not newly operated UI.

## Verified output
- Film: `WORKNOVA_v4n_170s_PRIVATE.mp4`, SHA256 `b4e2676bc8fdb12ff5b6b9378a82fe2fde7fda2def6170ee3d57c07429c2e62b`, 29,869,894 bytes, 170.000s, 1920×1080, H264 25fps (4,250 video frames); AAC 7,970 audio packets, original bitstream MD5 `2959cc9c1f5ee996edaefb3b06a147ea` exactly preserved; full FFmpeg A/V decode PASS; FFmpeg `blackdetect=d=0.2:pix_th=0.06:pic_th=0.97` no qualifying >0.2s black interval. Visual check: edited transitions and boundaries at 123/127/131/134/135s, plus five agents and close at 169s sampled.
- 11-second video-only chapter `WORKNOVA_v4n_11s_GiftWipe.mp4`, SHA256 `d974b7229325eac853f640328a58cb4f89cdf0b86b3906fd2f558aaf6505092a`, 275 frames.
- **Exact stream packet SHA256 evidence:** 3,075/3,075 outside edit frames before 123s identical video packet payloads, and 900/900 after 134s identical; 275/275 within edit deliberately differ. Also prefix *decoded* frame MD5 equality confirmed for **2,956/2,956 frames** before a long combined framemd5 comparison timed out (a separate remaining 119 prefix frames not exhaustively decoded); packet parity covers these at compressed payload level. The latter is not a claim of independently reverified 4,250 frame decoded parity.
- Python new offline safety unit tests: 8 PASS / 0 FAIL / 0 SKIP. Checks source SHA pinning, no overwrite, symlink and output collisions, timeline, exact historic audio hash, and no payment/model/subtitle code.

## Failure / stop and pivot
- Initial 123–135s edit splice failed because `-i source -ss 135 -c copy` skipped back to next 144s keyframe and returned only 650/875 target frames (video decoder GOP boundary). Investigated actual source packet keys at 124/134/144; edited 123–134 instead, second render PASS with 4250 exact frames. Do **not** repeat the failed 135s stream-copy attempt.
- One long full-film decoded framemd5 compare timed out (v4m 4,250 hash lines completed; v4n 2,956 lines). Pivoted to fast full compressed-packet SHA256 comparison; **3,975/3,975 original outside-edit video packets identical**. Do not misstate as full outside-cut decoded parity. Visual samples and whole decode independently pass.

## Security, preservation, next
- No new PayPal/Gemini API, recording, payment, account, live provider claim, commercial release, Vercel deployment, new neural speech, EN/KO subtitles or external user data. All existing v4m, v4l, approved original af_heart and click AAC are immutable.
- Production/UI browser: NOT TESTED here. This is **PRIVATE DESIGN REVIEW** pending full owner visual inspection, not final approval. Whole-product previously verified estimate remains 79/100; RELEASE HOLD. Post GitHub source/test/proof only; large media/ZIP to private Library.
- Next: owner reviews full 170s v4n; on concrete issues only, refine specific scenes. After explicit visual lock: ONE approved original neural voice + EN/KO SRT pass, full ears-on and publication/security gates. Public YouTube/Devpost requires separate owner consent.
