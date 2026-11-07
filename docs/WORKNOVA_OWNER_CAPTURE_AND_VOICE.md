# WORKNOVA — private owner browser capture and Part 2 voice

This is a private production toolchain, NOT a final film or public submission.
The owner's existing 170-second review MP4 and original recordings remain unchanged.

Approach A (chosen): launch the REAL localhost WORKNOVA product in visible Chromium.
Only the OWNER moves the mouse and performs clicks, producing event-counted WebM.
Approach B (previous): deterministic Playwright browser clicks test the exact same
real UI but must be labeled synthetic. Do not misrepresent programmatic clicks
as owner-operated. Both paths block payment and provider network.

Owner Windows, clean and current lead/paypal checkout with existing .video-venv:
  git switch lead/paypal
  git pull --ff-only
  npm run worknova:video:capture:check
  npm run worknova:video:voice:check-cues
  npm run worknova:video:voice:check-model

Record Part 1 (fictional matching / human quote review / local contract):
  npm run worknova:video:capture:part1
Record Part 2 (manually click Delegate, A2A, Gift, Churn, Invoice):
  npm run worknova:video:capture:part2
Each script opens the real WORKNOVA browser. Use fictional data only, move and
click with the real mouse, then focus the terminal and press Enter. Both
recordings and SHA256 sidecars are written as NEW files under gitignored
output/videos/. No existing file is overwritten.

Generate five new offline neural narration scenes with approved Kokoro FP16 af_heart:
  npm run worknova:video:voice:part2
Source model/voicepack in output/voice-models/ must pass pinned hashes, else STOP.
This writes a new 24kHz/170-second WAV with voice at 108.35-152.00 seconds
aligned with the PRIOR 170s PRIVATE REVIEW CUT ONLY, plus SHA256 report.
New footage requires final retiming and editor mix. No robotic eSpeak fallback,
model download, new provider calls, PayPal Capture, new cost or cloud upload.

Technical limitations: this script verifies local pointerdown events, not the
identity of the operator. The existing WORKNOVA browser is offline/synthetic,
not a real PayPal or Gemini transaction. The tool is not a final-video approval
or YouTube/Devpost action. Production hosting and owner film review are not done.
Original Proofline media, SQLite state, cookies, authenticated APIs and history
are preserved. After real owner capture and voice output, re-edit 165-175s,
verify all sound, subtitles, privacy and screenshots, and get explicit approval
before publishing or merging release PRs.
