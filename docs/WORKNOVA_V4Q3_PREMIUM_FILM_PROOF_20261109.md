# WORKNOVA v4q3 — premium film / original procedural BGM / illustrated control plane

**Status:** PRIVATE_VISUAL_AND_AUDIO_REVIEW; NOT OWNER-APPROVED; NOT YOUTUBE; NOT DEVPOST; NOT A DEPLOYED DASHBOARD.

## Why this edit
The owner requested BGM and a visual presentation persuasive enough to match the in-house backend. Two creative directions were evaluated: (A) decorative neon/3D AI spectacle and (B) premium fintech product-led editorial graphics that specifically foreground versioned quotes, bounded agent scopes, evidence auditing, explicit human approval and PayPal Sandbox boundaries. **B was chosen.** This is not a redesign of the deployable web frontend and contains no fabricated traction metrics.

## What changed
The exact parent private v4p6 movie SHA256 is `a8cb8b4c811672972d68f362dd45e74a471577f62a1945cd4b499c103dcb897d`, 170.000 seconds, 1920×1080 H.264 25fps + AAC.

- **00:00–00:10:** New cinematic WORKNOVA typography, two-market/five-agent identity, and explicit human payment boundary. Final 0.5 seconds dissolve into the authentic first source frame at 10.00 seconds; original v4p6 faster scroll then remains.
- **00:10–02:41 (10–161s):** Original H.264 packets retained exactly, **3,775/3,775 SHA256 packet hashes equal**, preserving all actual offline synthetic marketplace and five agent walkthrough frames, including Part1 quote/contract and Part2 controls.
- **02:41–02:50:** New labelled **FUTURE VISION / CONCEPT UI** dashboard, animating Work → Match → Versioned Quote → Human Review → PayPal Sandbox. A branded outro follows. The dashboard is a static editorial concept with animation, **not built/deployed as an interactive production web dashboard**.
- **Audio:** New **original deterministic synthesizer score** (96bpm, no third-party samples), mixed quietly into prior complete 170s audio using FFmpeg `amix` and latency-compensated limiter. Original source WAV/AAC untouched. Output **must reencode AAC**; it does **not** have bit-identical audio packets. No new TTS, no payment, no provider call, no external copyrighted music download. Original recorded speech is retained in the mix, but owner listening/voice/score and SRT alignment remain unverified.

## Verifiable results
- Private full movie: `WORKNOVA_v4q3_PREMIUM_PRIVATE_170s.mp4`, SHA256 `82fdd313a6b7e49c96706ad529d130a757f2a5bfd886f8698657040488c8c046`, **24,839,110 bytes**, 170.000 seconds, **4,250 frames**, full FFmpeg A/V decode PASS. Expected Devpost under-180-second length met by this *private* candidate.
- Original procedural score WAV SHA256 `f1c9f076762d642a8eee667aa09179254bdd05ac4da864cd90d5bfea9d7b2cf7`, 24 kHz, stereo, 170 seconds, mixed at volume 0.20 with output limiter lookahead latency compensation. Overall prior mix original mean -26.5 dBFS, preliminary original score mix mean approx -25.2 dBFS and output peak approx -5.4 dBFS (not a listening or LUFS guarantee).
- Correlation of decoded mono original audio to output at zero lag (new music necessarily changes signal): 10–75s **0.958**, 75–154s **0.927**, 154–161s **0.876**. This supports that old audio is still present, not that speech is always easy to hear. No claim that final neural voice/SRT is ready.
- Offline Python lightweight source contract tests **8 PASS**; original film media and actual final cut verified separately by local `qa/check_premium_movie.py`. CI/Windows execution needs independent verification for the newly committed source SHA.
- Separate review-only 22s open/close teaser is NOT a true contiguous cut or public video.

## Source and reproduction
Only the **code/test/proof** are committed to GitHub: `scripts/worknova_v4q_premium_editor.py` plus `tests/test_worknova_v4q_premium_editor.py` and this document. The **full private film, source v4p6 film, score WAV, screenshots, review kit and optional concept art** are Library-only. Recreate *using an exact SHA-matched already-owned local parent* with local FFmpeg, Python NumPy, Pillow and an appropriate Inter/Arial font (no network required):

```powershell
python scripts/worknova_v4q_premium_editor.py --check-plan
python scripts/worknova_v4q_premium_editor.py --source "PATH_TO_PRIVATE_V4P6_170S.mp4" --work-dir "output/private-v4q-new-empty-folder"
```

The generated work folder must be new/empty; no original overwrite, no automatic external upload. No model weights, credentials, private DB, or third-party sampled music have been committed. The owner may reject this entire design and revert to preserved v4p6 without cost.

## Claims and final gate
The two service categories, five bounded agent demonstrations, versioned quotes, human acceptance, SQLite evidence, and historically owner-reported PayPal Sandbox/Gemini test are real **within their respective stated source/evidence boundaries**. The visual flow is a strategic *future concept*, not proof of real model-driven browser agents, real customer acquisition, production payments, a partnership with PayPal, or measured business uplift. **No owner visual lock**, independent public judge validation of the new design, provider calls, live deploy, YouTube publication or Devpost submission. Original Kokoro `af_heart` and final bilingual subtitle timing are still gated until visual approval. The product-wide prior weighted completion estimate remains **79% unchanged** pending those owner/external release gates.
