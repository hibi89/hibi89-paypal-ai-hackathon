# WORKNOVA Step10 — Judge evidence/PayPal-Gemini provenance audit (2026-11-09 KST)

## Real evidence vs synthetic

| Evidence surface | Actual proof | Not proven |
| --- | --- | --- |
| Public local WORKNOVA browser Part1/Part2 | Linux/Windows and real offline Chromium tests, two categories and five Part2 features, full judge 8-step PASS | Live network-connected AI; enrolled real sellers or real customer purchases |
| Synthetic MVP orchestration | Injected fake Gemini and PayPal transports, fake buyer approval, one fake CREATE, fake Capture and injected GET; disposable SQLite claims | Actual PayPal Sandbox API activity in this command, Live money, real payment |
| Part2 offline SQLite lab | Five deterministic local modules, scoped mandates, no real providers or payment permission | Actual remotely executed Gemini A2A |
| Historical PayPal Sandbox + Gemini activity (2026-10-28) | User-shared private Windows run reported Gemini classification and PayPal Sandbox $1.50 buyer approval, capture and fresh provider GET; separate owner-local SQLite inspector can recheck the existing *local* records safely | Independent current provider verification by GitHub CI, judge-accessible authenticated hosted service, free-tier eligibility |
| Final submission | Public MIT GitHub repository and English Devpost draft/reviewer reproduction route | Owner-locked video, public YouTube URL, actual Devpost submission/receipt |

No new PayPal OAuth, Orders GET, CREATE, Capture, Gemini call, account action, source deployment or sharing of owner's SQLite was performed. `npm run mvp:step2:safe` remains an optional, delayed owner-local read-only status command, not permission to retry.

## Functional defect found and fixed

The previous `npm run judge:evidence` output was incorrectly labeled `Proofline` in its structured `project` and generated Markdown title even though the current browser, submission and review source are `WORKNOVA`. It also did not independently guard its exported Markdown renderer against modified external-provider and publication assertions.

The feature changes in `scripts/build_judge_evidence_report.mjs`:
- WORKNOVA identity in JSON/Markdown/temporary execution directory, with exact current public `lead/paypal` reviewer source URL, plus an explicit `reviewerSourceVerifiedLiveByThisCommand:false` (this local code does not browse GitHub).
- The renderer now checks the exact five evidence source/type/status rows and blocks a caller from turning an owner historical report into an independent provider attestation or inventing provider calls, money capture, approved publication, public video or submission.
- Expanded `tests/judge_evidence_report.test.mjs` with malformed/falsified release, provider and source-row negatives; `tests/worknova_brand_surface.test.mjs` checks evidence generator brand. No payment/provider/secret/DB module was modified.

## Test, correction, and no-repeat record

- Initial feature `d0a442bb50c2e132ab11bd4eca58214ccccc91d2`: [Offline MVP smoke #42525501919](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/42525501919) **FAILURE**. Exact log showed `SyntaxError: Unexpected identifier 'git'` because code-formatting backticks in a JavaScript template literal were unescaped. It was a new source syntax defect, **not** a PayPal/Gemini provider incident. Corrected with one targeted follow-up, no force-push.
- **Final verified source feature:** `5caf5d1ff17b92c614a75a86d5fe004828bc49f2`. [Offline MVP smoke #42525566450](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/42525566450) **SUCCESS**; [Offline payment-contract #42525566401](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/42525566401) **SUCCESS**. Linux **Node 1,225 PASS / 0 FAIL / 0 SKIP** including the new fail-closed test; Windows first-run SUCCESS; actual offline Chromium, portable reviewer, `JUDGE_ONE_COMMAND_TWO_PART_PASS` 8/8, local auto-capture provenance SUCCESS; 8 Python synthetic ZIP tests PASS; optional Wrangler and default-speed synthetic video SKIPPED.
- This establishes real code correctness for tested **offline** classes, **not** independent remote PayPal/Gemini or official release. No owner-private SQLite bytes were available to CI and no actual receipts were uploaded.

## Release and owner intervention

- `main@5243295f17cbc770fef35f9a6c0b905a1506e78e` left unchanged, latest WORKNOVA still publicly available at `lead/paypal`. Default-main promotion is optional; stale Draft PR #30 must not be merged without owner approval and refreshed SHA.
- Original private v4o 170s Library ZIP, audio/voice/SRT and user local databases remain untouched. Source and docs only; no media in GitHub.
- Actual remaining owner-only gates: watch/lock final video, one final approved audio/SRT pass, approve a public YouTube upload and English Devpost entry, obtain genuine receipts; optionally inspect historical local status once only if it materially changes the judge claim. **No owner step now.**
- Internal progress estimate **79/100 unchanged**. Work here removes an actual reviewer-identity defect and prevents falsified evidence rendering, but does not satisfy an external provider or submission gate.
