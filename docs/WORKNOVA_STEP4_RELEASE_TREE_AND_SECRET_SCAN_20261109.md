# WORKNOVA Step4 — Public release read-only source tree and credentials scan (2026-11-09 KST)

## Grounded branch trees
- Checked `main@5243295f17cbc770fef35f9a6c0b905a1506e78e`: **514 Git blobs**.
- Checked `lead/paypal@6c064de96e2e8e880668ddf04f61b4400922e048`: **584 Git blobs / 5,253,483 Git-reported bytes**; recursive tree `truncated=false`.
- Exact Git tree path/blob SHA comparison (not ahead/behind commits): **1 main-only path `docs/ROLE_COORDINATION.md`**; **71 lead-only paths**, **20 same-path changed blob SHAs**; no unauthorized main update. This is more precise than prior Git compare's 117 merge-base changed paths.
- No tracked filename with `.env` (except documented safe `.env.example` if present), `.sqlite`, `.db`, private key extensions, mp4/WebM/WAV or ZIP in lead tree. This is filename-only, not a secret content guarantee.

## Alternatives and implementation
A. Manually inspect 584 files in chat: expensive, unrepeatable, hard to regression test.
B. **Selected:** no-network tracked source scan in CI using `git ls-files -z --cached`, checking path traversal/symlink/size/binary and high-confidence credential signatures plus explicitly named secret literal assignments. Scans Git-tracked files including docs, source, tests, fixtures; never prints matched values, only file path and classification. New `scripts/release_source_safety.mjs`, `tests/release_source_safety.test.mjs`, `npm run preflight:release:source` and CI step in existing Linux offline workflow.

## Scope and limits
- Detects PEM private keys, GitHub/Google/AWS/Stripe/npm/Slack tokens, long bearer credentials, named provider secret string literals; allows obvious synthetic fake fixture tokens. Flagged path/classification never authorizes publication or overrides private human review.
- Does **not** inspect historical Git commits, GitHub Actions secrets, owner private Windows files, actual account billing, third-party current access, business/personal data semantics, or guarantee detection of every possible secret string. False positives require code/data review, never suppress unverified real credentials.
- Tests construct disposable fake token shapes in temporary directories; no real credentials. The script takes no CLI flags, performs no network, no provider requests, no deployment, no payment, no tracked file mutations, and returns exit code 2 on failure.
- Isolated Node safety tests locally 8/8 PASS before GitHub commit. Full-branch 584 tracked-file content scan must run under exact GitHub SHA CI and report separate result: **pending at this pre-commit checkpoint**.
- Existing public `main` and stale Draft PR #30 unchanged. Never auto-merge, force push, create branch, deploy, publish YouTube or submit Devpost without user approval.
- Owner actions are batched at final gate per explicit instruction. Existing private v4o 170s video and original approved af_heart remain unchanged. Full product previously estimated **79%**; no automatic increase without observed completion.

## Next
After exact-SHA scan, reconcile findings without echoing secret content. If zero high-confidence findings, mark only `CI_TRACKED_SOURCE_HIGH_CONFIDENCE_SCAN_PASS` (NOT a comprehensive audit). Continue safe release-preview scope/security review and Devpost English evidence alignment before requesting batched owner action.

## First CI failure and bounded correction

- Initial scan at feature `d5f1dae04364706d0b24f355021c219455f804e2`: existing GitHub Actions **Offline MVP smoke SUCCESS** but `test` workflow failed at the new scan after the ordinary Node tests completed. Real output was `RELEASE_SOURCE_SCAN_BLOCKED` with **3 test-only paths**, code `HARD_CODED_API_SECRET_LITERAL` in `tests/owner_mvp_flow.test.mjs`, `tests/owner_step2_evidence_cli.test.mjs` and `tests/p0_provider_readiness.test.mjs`. The values were deliberately fake PRIVATE_/NEVER_ fixtures, not verified real credentials. The scanner did not echo values.
- Minimal improvement: skip those *two clearly labelled fixture prefixes only within `tests/`*, while keeping the same names **blocked under `src/`** and retaining private-key/token high-confidence patterns unconditionally. Added regression asserting both branches. Local isolated updated scanner tests **9/9 PASS**. Retry exactly one improved candidate; any second unchanged root-cause failure triggers stop-and-pivot, not repeated blind reruns. Do not claim full-tree content scan PASS before second exact-SHA CI.
