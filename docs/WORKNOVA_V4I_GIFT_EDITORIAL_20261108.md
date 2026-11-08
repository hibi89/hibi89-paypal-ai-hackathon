# WORKNOVA v4i — verified offline Gift Finder 3-stage editorial pass (2026-11-08 KST)

## Goal/authority
Owner specifically instructed **design first, no further voiceover or subtitles until final film approved**. Preserve original Kokoro af_heart/music/click AAC; never invent human clicks, PayPal payments, real Gemini/agent calls. This is PRIVATE visual-only work, no product app source mutation.

## Evaluated alternatives
- **A: Refilm interactive browser UI:** better real-time motion but depends on an owner-operated local browser, exact visual states and additional human capture; higher effort and no guarantee of correct Gift stage chronology. Deferred.
- **B: Three genuine offline source keyframes plus editorial flow, with no fake actions:** lower cost, reproducible, true to data, adequate for design review. Selected.

## Actual scene change and evidence
- Parent 50s v4h SHA256 `70525df7a240fe8d08bbb02bb4ed8feca8401f93980491b90ba9f94440659a44`.
- Original synthetic (Playwright-driven, **not human**) WorkNova UI WebM SHA256 `4dc5c379c58d0fd64ae5d8b273072638f0cf718cbd646eda0c71afbd6e61d290`; actual local source keyframes at 90.5/96.5/99.5s only. No new browser/API interaction.
- Changed movie time **123–135s only**, Part2 offset 19–31s; three stage storyboards, 4.16s each with 0.24s wipes, 12.0s total. Stage1 genuine fixed-catalog Desk lighting / Practical / **$39.00**, Stage2 genuine owner-supplied local Premium / **$40.00**, Stage3 selection-only / no payment / human review. Corrected initial draft erroneously labeling stage1 Premium/$40; rejected that draft before final. Every screenshot labeled OFFLINE KEYFRAME. Source may not be vendor verified. Static stills are explicitly editorial, not reproduced clicks.
- 50s **visual-only / no audio track** v4i SHA256 `5c421dd6d729869b9278b6f9f7a9a4213fab6c4457b9bb71ab9cbf2e4ab166f2`, 7,418,070 bytes, 1920x1080, H264, 1250 frames.
- Full **170.000s** v4i preview SHA256 `e6697900a1f93acc4860bf72c780c6674e29b1cb78ae49c1966a7749efc2af0f`, 44,833,790 bytes, 1920x1080, 4250 video frames. Whole ffmpeg H264/AAC decode exit0, original AAC packet MD5 `2959cc9c1f5ee996edaefb3b06a147ea` identical (7,970 AAC packets). Existing v4c Part1/bridge/end and all original media unchanged.
- First integration attempt blocked because v4i 50s has no audio stream but old assembler required one. Adjusted new v4i assembler to explicitly expect 0 Part2 audio; **original AAC still copied from v4c**. Retry success, no other re-encode.
- Offline Python contract tests 8/8 PASS (file SHA, data integrity, frame contract, no overwrite, no faked live claim, image shape, video-only segment). 22-sample 170s contact sheet and before/after shots checked. No full subjective ears-on owner review; no independent Production browser verification.

## Reproduce privately (from SHA-matched originals)
```powershell
python scripts/worknova_part2_v4i_design.py --check-plan
python scripts/worknova_part2_v4i_design.py --source "PATH_TO_OWNER_AUTO_WEBM" --v4h "PATH_TO_V4H_PART2_50S.mp4" --output "NEW_V4I_PART2_50S.mp4"
python scripts/worknova_v4i_fullcut.py --v4c "PATH_TO_V4C_170S.mp4" --part2 "NEW_V4I_PART2_50S.mp4" --output "NEW_V4I_170S.mp4"
python -B -m unittest discover -s tests -p "test_worknova_v4i_design.py"
```

## Preservation and release boundary
Entire private 10-item ZIP `WORKNOVA_v4i_PRIVATE_Review_Kit_20261108.zip` 47,605,275 bytes, SHA256 `af7b34f9d290487fe193be35dd61b22911cc87018d3fb4a0942941bdf21e03c1`, ZIP integrity PASS, stored by create-only upload to Library `/WORKNOVA PayPal Hackathon/2026-11-08 Handoff/v4i-design-20261108/`, along with exact 3 source/test files. No media binary/weights/secrets in GitHub. Original v4h Library saved separately, not overwritten.

Remaining film design tasks: owner approval of overall 170s visual identity and pacing; revisit genuine active UI capture if requested. Only **after visual lock** should voice/subtitle/audio generation be performed once. Public/Devpost/provider/payout/production untouched. Whole-project verified completion still **79/100**, RELEASE HOLD. New GitHub CI for commit must be read separately.
