# WORKNOVA v4m — 170-second offline visual QA (2026-11-09 KST)

## Scope and editorial choice
- Two options assessed: (A) replace Part 1 10–43s actual browser footage with synthetic slide montage (risk: loses original cursor evidence and timing); (B) keep actual offline Playwright UI movement and add a compact premium footer only at **12–43s** (chosen: smaller edit, preserves the click/scroll story, zero API cost).
- Exact five beats in existing footage: 12–18s VISION; 18–24s EVIDENCE; 24–31s AI WORK; 31–36s GLOBAL SERVICES; 36–43s QUOTE / human approval. New footer uses recorded UI states and states **SYNTHETIC / NO PAYMENTS**. Not a new browser capture, transaction, LLM, or human approval.
- Pixel changes are confined *by filter intent* to footer y>=988 of 31-second 1920×1080 source, but H264 recompression changes encoded pixels elsewhere in that 31s chapter; do not claim inside-chapter pixel equality. Old 170s v4l source is immutable.

## Provenance and verifications
- Pinned source v4l SHA256 `6e869be80d3a63e335527b90b18bcdd24237ab660aea258067e0794423e3511c`.
- Preferred v4m SHA256 `061448ab2ff9c2b97bf8b69fa581f38de90c5820a849d4f6f1987672b1c99f1b`, size **30,262,589 bytes**, 170.000s, 1920×1080 25fps **4250 video frames**.
- Isolated 31s video-only chapter SHA256 `744972a3b93f525cb83816c8cf3feea29211ed1bf34181cb1533de1207974773`, 775 frames.
- FFmpeg full video decoder and blackdetect complete: no spans matching threshold >=0.20 seconds (pix_th 0.06/pic_th 0.97). Source/new AAC copy MD5 is `2959cc9c1f5ee996edaefb3b06a147ea`, unchanged from v4l; **no new voice**.
- Entire untouched 0–12s prefix decoded YUV420 frame stream MD5 `3ab313d9a0925d02edcdc1d9e7731dba` equal source/new; entire 43–170s suffix decoded YUV420 MD5 `a5f973f7ceaaca0a7ba7b2a8b8066210` equal source/new. This is stronger than samples, but applies only outside edit interval.
- 12-frame storyboard QA contact and individual frame 19s inspected. Initial footer text overlap rejected; shortened disclaimer. Initial 97% opaque footer produced ghosting; final uses fully opaque band. Only third candidate hash above is recommended.
- `python -m unittest discover -s DIR -p 'test_worknova_v4m_discovery.py' -v` **7 PASS / 0 FAIL**. Test only source guards, stage windows, no overwrite, provenance; rendered media separately tested as above. No complete subjective 170s audio/visual owner approval; no live PayPal or Gemini verification; no public judge access.

## Reproduce safely
```
python scripts/worknova_v4m_discovery.py --source PINNED_V4L_170S.mp4 --chapter NEW_31S.mp4 --output NEW_170S.mp4 --check-only
python scripts/worknova_v4m_discovery.py --source PINNED_V4L_170S.mp4 --chapter NEW_31S.mp4 --output NEW_170S.mp4
```

Fonts resolve from Linux DejaVu or Windows Arial; Windows replay remains **UNVERIFIED**, though updated portable source reproduced identical SHA256 on Linux. No source overwrite, symlinks, unpinned inputs, external payment/provider requests, narration or SRT. All media private; previous owner-liked voice remains backed up in old Library. New video candidate awaits human visual lock. Whole product retained previous estimate **79/100**, public release HOLD. Video-only change is not a Vercel Production deploy.

## Exact-SHA GitHub and Library postflight
- Feature commit `b1dae1549aca81452f5f8e2b290f4d07c931ad0a` remote source/test/proof blob identities matched local tested contents.
- GitHub Actions Offline MVP smoke `#42507825117` SUCCESS; Offline payment-contract tests `#42507825115` SUCCESS; optional two jobs SKIPPED, not PASS.
- Preferred Library v2 backup physically materialized as 34,254,129B, SHA256 `6ffdcded487c03482f289ee3e7fd5a6d188cca2f29ee3bc4a0514e684d5339e9`, 8-entry ZIP CRC PASS and inner film SHA equal. Earlier v1 and v4l are preserved.
