# WORKNOVA — unattended local browser recording (PRIVATE)
2026-11-08 KST. This is a synthetic **automated** Playwright walkthrough, not owner-operated footage.

## Official rule
PayPal AI Hackathon requires a project video under 3 minutes showing the real functioning project. The published rules do **not** require an entrant to physically click during capture. Final entry also requires executable demo access and a public open-source repository; YouTube publication still needs separate owner approval. Official source: https://paypalaihackathon.devpost.com/rules

## Design choices
A. Manual owner-operated browser capture: accurately records human pointer input, but requires repeated manual actions and may omit a crucial path.
B. **Chosen: deterministic automated Chromium capture:** reuses the repository's already-tested two-part Playwright journey; checks both service categories and all five AI Lab skills. Faster, repeatable, no manual click. This is clearly labelled automated synthetic footage and is not real PayPal/Gemini integration evidence.
C. Existing recording re-edit: cheap, but older Proofline pixels and stale UI may remain.

## Windows — one-click, no physical clicking in Chrome
Update the clean `lead/paypal` checkout with `git pull --ff-only origin lead/paypal`, then from the repo root:

```bat
npm run worknova:video:capture:auto:check
npm run worknova:video:capture:auto
```

Or double-click `scripts\WORKNOVA-Film-Auto.cmd`. The app is launched on 127.0.0.1, Chromium tests real UI behavior programmatically and saves a brand-corrected **new** WebM plus `.manifest.json` under ignored `output\videos\`. It does not use the missing Kokoro model, nor does it install/download anything. Keep existing `worknova-owner-clicks-part1-*.webm` and all original sources unchanged.

Output: `worknova-automated-two-part-*.webm` and corresponding `.manifest.json`. This is a private source clip, NOT final 170s editorial output. Source SHA, actual CI, video playback/technical metadata, brand frames, audio and English subtitle timing must be verified before release. A Playwright click is **not** a human click, even if the app's human-approval UI is exercised.

## Security / execution bounds
- Browser requests are restricted to the ephemeral loopback demo. Block nonlocal requests; reject payment order/capture POST paths; no provider secrets, credentials, public upload or PayPal/Gemini calls.
- Must have a clean source tree (except locally ignored caches); Git source identity is captured. Existing user data, contract DB, old WebMs and model files are not overwritten.
- If requirements are absent or automated selectors fail, stop and report. No guessed success, no silent live fallback. Automated visual output must be **independently reviewed**.
- Real Sandbox/AI integration functionality, external Production browser, public YouTube/Devpost and final film **remain release gated**.
