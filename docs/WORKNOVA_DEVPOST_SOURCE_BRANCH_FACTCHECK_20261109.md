# WORKNOVA Step7 — Devpost reviewer branch/source truth audit (2026-11-09 KST)

## Verified exact public branch facts

- Public GitHub repository: `hibi89/hibi89-paypal-ai-hackathon` (MIT root license on `main`, also present on `lead/paypal`).
- Default `main@5243295f17cbc770fef35f9a6c0b905a1506e78e`: README still starts with **PayPal Global Services Marketplace** and the judge section says **Proofline**. Its `web/innovation_dashboard.html` document title remains **Proofline — Agentic Innovation Lab**; its `web/offline_demo.html` title is **PayPal Global Services Marketplace — Offline Demo**. Main was previously published via merged PR #28 and contains a runnable older offline prototype; it is **NOT** the current WORKNOVA visual source.
- Prior lead `3e3be57503ada19849f73a7d4cfa17056e152168` showed new WORKNOVA brand in README and both offline HTML titles, but the English Devpost form builder incorrectly instructed `git switch main` and emitted the `/tree/main` URL. Reviewers following it would see older branding.
- Feature fix `7e3a7198780315b270b88728e1319460f381917f`: Devpost source, generated form's `sourceRepositoryUrl`, project README quickstart, reviewer guide and generated private packet point to public `lead/paypal`; old `main` is labeled a separate historical source/license release. No branch merge, deployment or explicit source-release approval was claimed.
- The review branch is publicly reachable but **no live sandbox credentials or real provider-integrated browser session** is provided there. All latest browser demos are labeled `OFFLINE_MOCK`.

## Alternatives and chosen action

| Option | Quality/impact | Owner consent/safety | Decision |
| --- | --- | --- | --- |
| A. Merge current divergent lead into main now | Would align default-branded checkout but requires preserving both divergent histories and exact release review | **Current owner approval absent; not allowed** | HOLD |
| B. Point working draft/reviewer checkout to existing public lead | Aligns current WORKNOVA name, verified working offline UI, source and video without modifying main | No new credentials, public hosting, payment or owner-local task | **SELECTED** |

## Changed working code and observable result

- `docs/DEVPOST_FINAL_REVIEW_PACKET_EN_20261105.md`: explicitly distinguishes current WORKNOVA public lead source from earlier public Proofline main source, maintains English reproducibility instructions and truthfully states no live-provider judge flow, public video or submission.
- `scripts/build_devpost_form_fields.mjs`: source URL now targets `/tree/lead/paypal`; emits `reviewSourceBranch='lead/paypal'`, `previousDefaultMainSourceUrl`, `currentWorknovaMainReleased=false`, `sourceBranchesLiveRechecked=false`. Strict parsing rejects older `git switch main`, altered Proofline-main provenance and premature release claims. This is a **local, unpublished draft parser**, not a live branch monitor.
- `README.md`, `docs/JUDGE_REPRODUCTION_EN.md`: instruct latest WORKNOVA reviewers to `git switch lead/paypal`, with explicit main-history and publication boundary.
- `scripts/prepare_submission_candidate.mjs`: private, ignored submission packet lists current WORKNOVA reviewer source first, legacy main second; no YouTube or Devpost upload. `tests/devpost_form_draft.test.mjs` and `tests/submission_candidate_local.test.mjs` assert current source, historical source and fail-closed status.
- **Functional proof (exact SHA `7e3a7198780315b270b88728e1319460f381917f`):** GitHub Actions [Offline MVP smoke #42521974381](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/42521974381) **SUCCESS**, [Offline payment-contract tests #42521974331](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/42521974331) **SUCCESS**. Linux Node **1224/1224 PASS, 0 FAIL/0 SKIP**, Windows first-run SUCCESS, Chromium local review and one-command **8/8** PASS, auto-capture offline provenance PASS; two optional CI jobs SKIPPED. The exact results verify local/synthetic code and draft guards, **not** PayPal/Gemini provider availability, Production or submission.
- [Official Devpost rules](https://paypalaihackathon.devpost.com/rules): public repository with visible license, runnable demo or complete reproduction instructions, under-three-minute public YouTube, English materials, PayPal sandbox plus AI. Official deadline Nov 12 2026 noon PST / Nov 13 05:00 KST. The current private 170s v4o is not owner-locked or public YouTube; user submission receipt absent.

## Remaining release gates

1. Owner-private read-only provider receipt check only if necessary; no replay of already-captured PayPal transaction.
2. Owner visually locks current v4o; one final original af_heart voice/subtitle pass after approval, preserve original.
3. Separate owner authorization and exact tested merge preview for latest WORKNOVA -> public main; never assume stale PR #30 is usable or force push.
4. Owner-approved public YouTube under 180 sec and English Devpost entry plus genuine confirmation receipt before official deadline.

Status: **PRIVATE_DRAFT_ALIGNED_TO_PUBLIC_LEAD, RELEASE HOLD**. Previous whole-product estimate **79/100 unchanged**. No secrets/raw media/customer info included in this public document.
