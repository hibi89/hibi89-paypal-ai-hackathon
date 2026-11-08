# WORKNOVA v4o — 104s/154s Single-frame flash correction (2026-11-09 KST)

## Confirmed inputs and scope

- Parent private v4n movie SHA256 `b4e2676bc8fdb12ff5b6b9378a82fe2fde7fda2def6170ee3d57c07429c2e62b`, 29,869,894 bytes, 170.000s H264 1920×1080 25fps and approved original AAC. Previous Library v4n v2 backup remains unchanged.
- User preference: film visual design before one future original af_heart + subtitle pass. No TTS, SRT, upload, model/payment/production operations.
- Evidence: sampled exact decoded frames at video frame 2600/3850 (104.00/154.00 seconds) revealed an all-black top panel (image region pixel mean 0), while adjacent 104.04/154.04 frame contains genuine offline UI. Footer survived, so earlier whole-frame blackdetect had missed these cases.

## Alternatives and selected fix

- Full 170s reencode: simpler FFmpeg pipeline but changes every compressed video packet, more time/storage/quality drift. Not selected.
- Two keyframe-aligned 104–114s and 154–161s video segment reencodes: reuses immediate next existing recorded UI frame in each 0.04s slot, leaves 3825/4250 compressed packets byte-for-byte identical and copied AAC. Selected. No fake browser events or changed state.

## Execution, failures and pivot

- A direct `-ss` input seek on this inherited concatenated MP4 skipped some video packets at 114/161s; correctly aborted on frame-count mismatch. Output seek at 161s likewise lost the tail. No damaged candidate adopted.
- Next filter attempt with `select` + `tpad` lost one frame (249 instead of 250); aborted. Changed to a deterministic `trim`+`concat` filter duplicating the existing **second** authentic source frame within each affected segment.
- Successful procedure: **one sequential FFmpeg segment mux** at existing IDRs 104/114/154/161s yielded exact counts 2600,250,1000,175,225; `libx264` CRF18 for the 250+175 editing windows only; copy all else; concat and copy original AAC. No payment/AI/provider request.

## Test evidence

- Final private v4o movie: **SHA256 `219b9e21eba9aa77b473f6cfdcc28e7f7afd36d978e7cf37d970f63094856985`**, 25,494,944 bytes, 170.000s / 4250 H264 frames; full AV decoder exit 0.
- Compressed H264 packet SHA256 equality with v4n **3825/3825 outside edited windows** (0–104s, 114–154s, 161–170s); 425 video packets are reencoded in precisely two GOP-aligned windows. This is packet identity, not exhaustive decoded-pixel equivalence.
- Original AAC stream packet MD5 `2959cc9c1f5ee996edaefb3b06a147ea` remains unchanged, original recorded narration/clicks intact. No new voice/SRT.
- Exact frame at 104.00s central UI mean from **0 → 47.05**, at 154.00s from **0 → 25.81** (OpenCV BGR mean of x140:1770,y120:900). Same-frame before/after contact proof: `QA/WORKNOVA_v4o_2Seams_BeforeAfter.jpg`.
- Focused Python offline contract tests: `python -m unittest discover -s tests -p 'test_worknova_v4o_seam_fix.py' -v` **15 PASS / 0 FAIL**. CI at feature SHA must be checked separately.
- Full subjective user visual approval, Windows playback, new CSS browser-pixel review, live PayPal/Gemini, public Production deployment: **NOT VERIFIED**, so v4o `PRIVATE_DESIGN_REVIEW`, `RELEASE HOLD`, whole-product previously estimated **79% unchanged**.

## Restore/reproduce

Source video in this ZIP: `FILM/WORKNOVA_v4o_170s_PRIVATE.mp4`. For reproducing v4o from original source, obtain SHA-verified **v4n** from earlier Library backup, then run:

```bash
python -m unittest discover -s tests -p 'test_worknova_v4o_seam_fix.py' -v
python scripts/worknova_v4o_seam_fix.py --check-plan
python scripts/worknova_v4o_seam_fix.py --source /path/to/WORKNOVA_v4n_170s_PRIVATE.mp4 --output /new/path/WORKNOVA_v4o_PRIVATE.mp4
```

Inputs are SHA-pinned and outputs refuse overwrites; the ZIP contains the v4o **output**, not a duplicate v4n source. Reproduction requires preserved v4n original. Source/test/proof checked into GitHub, large media only in Library.

## Exact-SHA postflight after GitHub push

- Feature code commit `67b5cf8338bac47469b385215965085e0c08ae0b` author/committer `hibi89`, source/test/proof blobs matched locally validated files.
- GitHub Actions Offline MVP smoke [#42512943612](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/42512943612) **SUCCESS** and Offline payment-contract tests [#42512943667](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/42512943667) **SUCCESS** at exact code SHA; test job SUCCESS, Windows first-run SUCCESS, two optional jobs SKIPPED.
- Full decoded 94–160s Part2 sweep, 1,650 frames: zero central UI frames with mean brightness below 1 in x140:1770, y120:900; this is a focused blank-panel check, not full 170s subjective review.
- Preferred persistent Library ZIP physically re-materialized and SHA256 `8190001d93b22516c25c20aa8fe9c8762d2f2b7c8029c26e2d8a2b45d0f21684` verified, 7 entries CRC PASS, six inner SHA256 manifests match. Standalone unpacked Python tests 15 PASS. v4n source, prior approved af_heart voice and old Library kits not modified.
