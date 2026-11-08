# WORKNOVA v4k — Part 1 visual readability and historical evidence correction (2026-11-09 KST)

**Goal:** Improve an existing 170-second premium WORKNOVA film without performing any new payment, AI model call, voice generation, subtitle work, UI changes, publication or Production deployment. The owner explicitly defers narration/subtitles until final visual design approval.

## Two alternatives and decision

1. **Re-film original browser interactions:** potential additional authentic motion but requires owner browser and risks extra provider/interaction consent, higher time and capture cost.
2. **SHA-verified editorial crops:** no provider cost or new clicks; reframe only the archived offline Playwright demonstration, preserving 170-second timing, original AAC and rollback. **Selected** as the safe, maintainable focused design pass.

## Source, edit and evidence

- Original private v4j 170s: SHA256 `c0ae70b7ebf6cfee08b49f108e405631198aa1cdf0307b41a86bf116a6fc296e`.
- Original video 43–45s unexpectedly showed a Gemini evidence card before returning to quote UI; replace that 2s with an explicitly marked recap of **earlier recorded fictional matching** from the original video at 33s, accurate output-side source seek.
- New Part1 edited range **43–75s / 800 frames**. 45–62s: three readable studio-reframed actual quote UI crops (quote V2 approved $15, estimated $80, synthetic project scope and unchecked consent interface). 62–75s: three historical Gemini/PayPal/provenance panels, clearly distinguished from fresh calls. Separate former Sandbox **$1.50** reported test from **$15** mock quote. Transitions are editorial crossfades, not genuine browser events.
- Intermediate 30s chapter: SHA256 `f6b1a264cff3f14f05c02f9cdaae1b2958e8ec49cbc186f7923937bdd1acb738`.
- Preferred corrected 32s chapter: SHA256 `0c35f7b0a2f7e720582b92fb7f5a3dce6f7d2dc1a5969506d9d0cb40afa5937d`.
- **Final private v4k whole 170s**: SHA256 `22a3fea00b7bde0e6f677c08e78107dab596c08f443c77c32fbed412b02e76a8`, 45,511,632 bytes, 1920×1080 25fps, H.264 4,250 decoded frames, AAC stereo.

## Validation

- Exact source and chapter SHA pins and no-overwrite guard in source; synthetic/nonpublic captions embedded in editorial **graphics only**; no actual spoken narration or subtitle track generated.
- Whole video+audio FFmpeg decode PASS and `ffprobe -count_frames` 4,250 decoded frames. AAC packet MD5 **identical** to prior approved original: `2959cc9c1f5ee996edaefb3b06a147ea`.
- `framemd5` decoded pixel equality **0 mismatches for every one of 3,450 frames outside the edited 43–75s range**: 0–43s 1,075, 75–170s 2,375. Although separately remuxed MP4 H.264 packet-level hashes differ after the splice, decoded pixels are identical; do not claim compressed packet hash parity.
- Earlier first intro attempt sampled an approval UI instead of matching due fast input-seek behavior; corrected via output-side seek at 33.0s and visually inspected. Earlier test first failed because output collision was checked after source hash; check order changed so existing output fails early. Final **11/11 offline unit tests PASS**.
- Film is technically validated for private visual design review. Owner has **not given final subjective visual approval**, actual Kokoro Part2 voice+real voice-aligned EN/KO subtitles are deferred, full ears-on subjective QA not performed. No fresh PayPal/Gemini call, public upload, Devpost submission or Production validation. Overall product completion estimate remains **79/100, RELEASE HOLD**.

## Reproduce

Run `scripts/worknova_v4k_part1.py` against SHA-pinned source v4j to make the 30s chapter, then `scripts/worknova_v4k_corrected.py` against the original v4j and exact new chapter to create separate 32s and 170s results. See private package README for full commands. Do not overwrite original sources or send model files, receipts, payment credentials or large video binaries to GitHub.

## Next steps

Owner reviews v4k visually. If issues remain, fix visual-only with prior original sources. When owner explicitly approves video design, run one owner-approved offline `Kokoro af_heart` narration + actual cue-aligned bilingual SRT, full listening and privacy/editorial inspection. Separately require approval for PayPal/provider interactions, real-money actions, new deployment and YouTube/Devpost public release.
