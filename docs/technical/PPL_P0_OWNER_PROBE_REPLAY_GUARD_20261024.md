# P0 Owner One-shot Persistent Gate — 2026-10-24

## Finding
Prior one-shot scripts emitted at most one POST per invocation but could be run twice independently. A network timeout or uncertain Free Tier might cause unintended repeated usage. Independent Sandbox / Gemini one-shot probes also do not complete the real PayPal and AI quote integration.

## Resolution
- After owner flags, Free Tier declaration, private credentials and injected fetch are checked, the owner CLI uses a per-provider O_CREAT|O_EXCL exclusive 0600 claim with fsync in the owner's home directory, outside the public repo.
- Claims are separate for Sandbox OAuth and synthetic Gemini generation, and persist after successes, failures or process termination. A duplicate returns PROBE_ALREADY_CLAIMED_NO_RETRY and networkCalls 0. Missing permission, dry-run or credentials do not reserve.
- Symlinked claim directories, unknown providers and write failures are refused with sanitized PROBE_RESERVATION_UNAVAILABLE; the operator script does not support state-dir CLI/env overrides.
- This local attempt gate is not a provider-billing guarantee: multiple computers/accounts or other provider clients are outside its scope.

## Owner verification chain (later, with separate permission)
1. Confirm a PayPal Sandbox REST app and distinct Business seller + Personal buyer in owner's dashboard, and Gemini project/model has genuinely eligible Free Tier. Keep keys local and never publish them.
2. Obtain separately scoped owner approval for each single Sandbox OAuth or Free-tier Gemini synthetic text probe. No credential or provider call is performed by this GitHub change.
3. Interpret sanitized OAuth success or generated-text success as a narrow observation, NOT actual Orders/capture/buyer workflow, real quote integration, zero billing, deployment or Devpost proof.
4. The private claim is intentionally left consumed after unknown outcomes. Audit the account dashboard before any owner-authorized manual change; never bypass the guard automatically.

## Tests and progress
Six new fixture regression tests cover claim persistence, dual-provider separation, duplicate/ambiguous request freeze, dry-run and incomplete consent, symlink fail-closed, and sanitized errors.
CI pending. D03=0% BLOCKED, D04=80% PARTIAL, D15=20% PARTIAL (base 5h / safe 10h / actual elapsed null), D16–D18=0%. No real provider calls or public deploy.

## Verified remote regression results
- Source commit `d8cfacd9a7f99201c00298fe9709f46bc54714d1`; [GitHub Actions #40099182100](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40099182100) **SUCCESS**: Node 298/298 pass, Chromium localhost E2E pass, 18-day progress validator pass.
- All new provider-response tests use injected synthetic fetch; real remote requests and provider free/billing entitlements are still unverified. CI only supports narrow per-user-home atomic reservation.
