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
This writes a new 24kHz/170-second WAV with five scene-aligned voice cues at
104.40-153.50 seconds for the exact v4b reference cut (SHA256 `abe1b409...`).
It includes a pinned scene-plan ID and reference SHA in the sidecar. The mux
rejects all but the exact SHA-verified v4b or v4c cut (which has identical scene
bounds) rather than silently shifting voice; retime the
five cues explicitly when editing a new version. Never claim draft subtitles
are an independently verified speech transcript.
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


## Private editorial voice mux (after model-backed Part 2 narration)

The program checks the new 170s WAV against its SHA256/voice/cue manifest and
checks an existing 170s 1080p H.264 review MP4. It adds the five Part 2 voice
scenes without changing any original video pixel, keeping video stream copy.
The mixed MP4 is a **new, private review candidate only**, never publication ready.

Example after obtaining the current 170s review cut and freshly generated WAV:

  npm run worknova:video:voice:mux -- --video "path/to/WORKNOVA_Private_Review_Cut_170s_1080p.mp4" --part2-wav "path/to/worknova-part2-kokoro-af-heart-XXXX.wav"

Before muxing, add --check-only to validate inputs without writing. The
matching WAV-side JSON is mandatory. Actual inference is only performed by
the owner's pinned local model tool; the sidecar alone is not independent
third-party attestation of that model. The resulting film still may display
old Proofline screen pixels until fresh in-app capture replaces those shots.
It is not a final 2-part release or a substitute for actual operator clicks,
privacy review, audio listening, or owner-approved YouTube/Devpost.


## Windows one-click sequence

From a clean and updated WORKNOVA repository, double-click:

  scripts/WORKNOVA-Film-Owner.cmd

It preflights the existing local Python video environment, verifies the
WORKNOVA source and pinned Kokoro files, then runs owner-controlled Part1
screen capture, Part2 screen capture and Part2 narration. The human operator
must perform actual browser mouse clicks and press Enter after each browser
shoot. Only a fresh WebM/WAV/JSON set under gitignored output/videos is made;
the command explicitly does NOT auto-mix, authorize a PayPal payment,
open an external provider session, publish, or submit to Devpost.
