# WORKNOVA v4p6 — private faster-scroll design review (2026-11-09 KST)

The v4p6 film and sources are not published and not an approved Devpost release.

- Original source: `WORKNOVA_v4o_170s_PRIVATE.mp4`, SHA256 `219b9e21eba9aa77b473f6cfdcc28e7f7afd36d978e7cf37d970f63094856985` (kept in prior private Library backup).
- New private film: `FILM/WORKNOVA_v4p6_PRIVATE_170s.mp4`, SHA256 `a8cb8b4c811672972d68f362dd45e74a471577f62a1945cd4b499c103dcb897d`.
- Exact run: `python scripts/worknova_v4p6_editor.py --source PATH_TO_ORIGINAL_v4o.mp4 --brand PRIVATE_BRAND/brand_open.png --output NEW_v4p6.mp4`.
- Preview: `PREVIEW/WORKNOVA_v4p6_FAST_SCROLL_PREVIEW_22s.mp4`.
- Opening 0-22s reconstructed from verified offline film frames and original WORKNOVA brand PNG. The scroll itself is a **2.40-second editorial pan** over two real offline source stills (3× previous 7.20-second scroll). **Not a new real browser scroll, click, or provider call.**
- Unchanged H.264 packets 22-170s: exactly **3700 / 3700** match v4o. Original AAC audio packet MD5 unchanged: `2959cc9c1f5ee996edaefb3b06a147ea`.
- Duration 170.000s; 4250 frames, 1920×1080 H264 + AAC. Full FFmpeg decoder PASS and the source-pinning 7 unit tests PASS. No narration/subtitle regeneration; owner visual approval pending.
- `CONCEPT/WORKNOVA_Future_Control_Center_CONCEPT.png` is **not part of the video** and is labeled illustrative-only, not a deployed or live-payments dashboard.
- BGM decision: preserve the existing audio bed for now. After final locked visuals and original af_heart render, independently review mix/ducking and rights; no new music has been inserted.
- No local SQLite, tokens, user data, PayPal/Gemini, live payment, public YouTube or Devpost operations.

This ZIP intentionally does not duplicate the prior v4o original film. Keep the original separate.
## GitHub source tracking

Source editor: `scripts/worknova_v4p6_editor.py`; 7 offline tests: `tests/test_worknova_v4p6_editor.py`; final audio hash allowlist: `scripts/worknova_v4d_offline_voice_finish.py` and `scripts/worknova_private_voice_mux.py`. Private MP4, brand PNG, and concept mock are Library-only. New voice, SRT and visual owner approval remain pending. No public deployment or release.
