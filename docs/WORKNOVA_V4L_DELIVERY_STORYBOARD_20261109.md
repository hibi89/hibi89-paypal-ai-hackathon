# WORKNOVA — v4l 75–94s contract / delivery / review story, 2026-11-09 KST

## Verified source, change and design rationale
- Parent v4k private 170s: SHA256 `22a3fea00b7bde0e6f677c08e78107dab596c08f443c77c32fbed412b02e76a8`.
- Immutable original offline synthetic Playwright source (1600×900): SHA256 `4dc5c379c58d0fd64ae5d8b273072638f0cf718cbd646eda0c71afbd6e61d290`.
- Two approaches considered: (A) fresh browser interaction capture: meaningful motion, but new capture owner interaction/extra environment/possible provider and timing risk; (B) original source frame-keyed storyboard, zero provider cost, scene evidence truthful, easy to revert. Choose B only for private design review. User requires **no new narration or captions until final video design approval**.
- Existing film at 75–94s held a contract UI for ~7 seconds and later drifted into unrelated policy/marketplace panels, hiding the actual 5-state audit lifecycle. Replace exactly these 19 seconds (475 frames) with a five-stage editorial replay: CREATED, SUBMITTED, REJECTED, RESUBMITTED, ACCEPTED, each directly grounded in recorded UI frames. This is **not** newly operated browser footage. Source screenshots display synthetic contract v2 $15.00 and payment `NOT_CAPTURED`; acceptance in local SQLite is not PayPal capture.

## Technical result
- New 19s H264 video-only chapter: SHA256 `603cacd52cef79951064613056cbd212ac052834ae4047df196c0cbb96eb0c71`, 475 frames, 1920×1080, 25fps, five editorial crossfaded panels.
- New **170.000s** visual-only private film: SHA256 `6e869be80d3a63e335527b90b18bcdd24237ab660aea258067e0794423e3511c`, **37,527,925 bytes**, 4,250 H264 frames, 1920×1080 25fps and 7,970 original AAC packets. Full FFmpeg AV decode PASS, no black frames in 73–97s around cut, original/new AAC packet MD5 `2959cc9c1f5ee996edaefb3b06a147ea` identical. Fourteen boundary/preview frames inspected.
- Pixel QA: original 0–75s prefix 1,875 decoded-frame hashes matched; separate focused 94–104s original/post 250/250 decoded-frame hashes match; outside-edit targeted frame samples, including 94.2, 96, 100.5, 103.7, 104.2 matched pixel-perfect. A long combined framemd5 run timed out and produced partial output, so **do not claim all 3,775 outside-cut frames full-hash verified**. The partial combined run erroneously suggested differences over 94–104s; standalone focused recheck showed 250/250 equality. Ears-on whole-170-second owner review and word-level captions not performed.
- Local unit tests `python -m unittest discover -s tests -p 'test_worknova_v4l_delivery.py' -v`: 8 PASS, 0 FAIL, 0 SKIP after correcting an import in the test harness. Original v4k video, offline browser source, approved voice and all existing app code are unchanged.

## Safety and reproduction

```
python scripts/worknova_v4l_delivery.py --source PATH_TO_SHA_PINNED_V4K_170S.mp4 --auto-source PATH_TO_SHA_PINNED_ORIGINAL_RECORDING.webm --output NEW_PRIVATE_170S.mp4 --chapter-output NEW_PRIVATE_19S.mp4 --check-only
python scripts/worknova_v4l_delivery.py --source PATH_TO_SHA_PINNED_V4K_170S.mp4 --auto-source PATH_TO_SHA_PINNED_ORIGINAL_RECORDING.webm --output NEW_PRIVATE_170S.mp4 --chapter-output NEW_PRIVATE_19S.mp4
```

Inputs must hash to the verified constants; symlinks/unapproved files/output collisions are rejected. Output files are new and do not overwrite original. No voice, subtitle generation, live PayPal/Gemini API, payments, browser recapture, production or publication. GitHub stores only source/test/proof, not video/credentials/media/model. Persistent Library previous archives remain immutable.

**Release status:** PRIVATE / DESIGN_REVIEW_READY, owner approval and actual complete audio/subtitle review pending; overall product estimate 79/100 unchanged, RELEASE HOLD. No production SHA or public URL verified. Next: owner visually reviews whole film, prioritize only concrete remaining design defects; after explicit final design lock, perform one original Kokoro `af_heart` voice/SRT session and complete release gates separately.
