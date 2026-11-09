# WORKNOVA Step27 — genuine offline Chromium UI inserted into private 170s reviewer film

**KST checkpoint:** 2026-11-09; **publication status:** PRIVATE / NOT OWNER-APPROVED / NOT SUBMITTED.

## Explicit owner approval and transfer boundary

On 2026-11-09 the owner explicitly approved a **temporary GitHub Actions artifact containing the 30-second fictional offline browser UI clip and manifest only**, followed by private download and compositing. This did **not** approve original-film upload, personal information, credentials, PayPal/Gemini calls, YouTube publication, Devpost submission, changing project access, or artifact storage beyond the temporary approved retention.

GitHub `lead/paypal` source commit `d982db015d4f6c16dd780f832881bd5c2372b5a3` has a one-time opt-in guard: the artifact upload action runs **only** for a push on `lead/paypal` whose head commit message contains `[capture-artifact]`. This commit was the sole authorized upload trigger. The CI uploads precisely the synthetic WebM and manifest under the runner temporary folder; no API keys, customer records, original 170s media, model weights, private SQLite, or other files. Subsequent unmarked commits will not upload footage. CI purged runner-local media afterwards.

- Run: [Offline payment-contract tests #42612781601](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/42612781601) — **SUCCESS** (Linux complete test job and Windows first-run job).
- Separate [Offline MVP smoke #42612781411](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/42612781411) — **SUCCESS**.
- One approved Actions artifact: id **13671516170**, `worknova-approved-synthetic-ui-d982db015d4f6c16dd780f832881bd5c2372b5a3`, 2,424,949 bytes, SHA256 `5edc4cfb88cbe5cf10306ea8a079bf79b8dbed99d860af9ab7b52c34501a9cd1`. GitHub expiration **2026-11-10 11:56:46 UTC (20:56:46 KST)**, retention 1 day. Direct deletion action is not available in this connected GitHub toolset; it expires automatically.
- Artifact ZIP CRC PASS; exact members: one `worknova-commerce-real-browser-*.webm` and one matching `*.manifest.json`. Recorded WebM: **30.480 seconds**, VP8 1600×900, SHA256 `a2bb5de121b7e3048374c28c8ee6c4893a4b1d403680e5560a5be79d326937e6`. Synthetic actions: five real local Chromium button clicks + $600 policy probe + revoke; $460 simulated reservations, $40 remaining, zero actual PayPal/Gemini calls, zero external browser requests, no owner-manual-click claim. Provenance manifest matches media digest.

## Source and private composite (strict preservation)

Original owner Library `/WORKNOVA PayPal Hackathon/2026-11-09-agentic-commerce-mvp/WORKNOVA_AGENTIC_FINAL_WITH_APP.zip` SHA256 `35d4c6d053a40ed1e5034de4054628691d039a0e2a63a30480725c7a8c0d3a9c`, CRC PASS, retained **read-only**. Its approved-to-review **public-safe candidate**, not final owner-approved movie, `videos/WORKNOVA_AGENTIC_SAFE_170s_PRIVATE.mp4`, SHA256 `99a440913eb7cac25ab75e9f467300d50c6c6dcc49dd6d8ca77bbc4b5d3f4578`, 1920×1080 H.264/AAC, exactly 170.000s, 23,744,575 bytes, was extracted as a working copy. No original bytes changed.

A local FFmpeg 7.1.5 compositing pass replaced the **45.0–75.0s** editorial reconstruction with the actual automated UI footage (alpha fade ~0.6s each end) and generated a **new private** 1920×1080 170.000s H.264/AAC candidate:

- Local conversation-generated output `WORKNOVA_170s_ACTUAL_BROWSER_PRIVATE_REVIEW_20261109.mp4`: **17,670,557 bytes**, SHA256 `2cd375dde37c914c62f8c92906f09919943c37da055a7cc1793c11471af74dc6`.
- Input and output **encoded AAC audio packet streams match SHA256 `8d171e598353a5452a56d5f3f5baea56993dc8a061ed3d34647fe846fae7f038`**, confirming audio was copied unchanged. Other visual frames were re-encoded for composition; do **not** claim pixel-identical video outside the replacement window.
- Full video+audio `ffmpeg -v error -xerror ... -f null -` **PASS**, `ffprobe` exact codec/resolution/duration **PASS**, `blackdetect=d=0.1` found **no black intervals**, and an actual nine-frame visual contact sheet inspected 43.8/45.4/48/54/62/70/74.7/75.5/168.5 seconds; all frames decoded. A final complete human audio listening/sync sign-off is **NOT** done.
- New private review package `WORKNOVA_STEP27_ACTUAL_UI_PRIVATE_REVIEW_PACKAGE.zip` **20,348,229 bytes**, SHA256 `c0fba3e1f21abbd0e749cf6153f080d54cdfffa57916c8bb5eb0e187deeb658c`, ZIP CRC PASS. It contains the new private MP4, real UI WebM and manifest, nine-frame contact sheet, SHA256 index, QA and release-hold notes. It **does not contain the original source movie**. Package exists only in conversation sandbox; it is **not** uploaded to public GitHub, YouTube, Devpost or the permanent Library.

## Truthful scope and remaining release gates

This is **real Chromium browser rendering of a fully synthetic local app**, not an owner physically clicking the mouse, not actual AI-generated negotiation, not PayPal-issuer virtual cards, not escrow, and not a provider-approved real payment. The footage proves the offline control plane is operable but does not prove external provider calls.

**Pending:** visual final-lock/rights check, full audio listening against newly inserted clip, authentic owner-pinned `af_heart` final voice if still required, English/Korean synchronized SRT, approved public YouTube upload under 180 seconds, Devpost publication and actual receipt. None have been marked complete. The original provider test authorization boundary remains unchanged. Vercel Production project/URL/SHA: N/A (no deployment).

**Next work:** review new private film with owner, keep audio and video originals intact, finish approved narration/captions once timeline is locked, then obtain explicit separate public release approvals. Official deadline 2026-11-13 05:00 KST.
