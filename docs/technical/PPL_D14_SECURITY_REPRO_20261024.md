# PPL-D14: loopback abuse guard + submission reproducibility (2026-10-24)

## Alternatives assessed before modification

| Design | Response to malicious traffic | New cost | Maintenance | Decision |
|---|---|---|---|---|
| A. Fixed-window limiter in existing loopback Node server | Controls accidental local request bursts, process-scoped only | $0 | Low; no package or provider dependencies | **Chosen for D14 offline acceptance** |
| B. Cloudflare Worker/D1 durable distributed limits | Better multi-instance/public abuse protection with real identity | Potential Free tier limits; live deployment and account needed | Higher, introduces credentials/deployment | **D15-only after external approval** |

## Boundaries and implementation

- `src/demo_rate_limit.mjs` independently counts up to 360 GET/HEAD and 60 other requests in each 60-second window. Does not trust `X-Forwarded-For` and caps one 127.0.0.1 process, not accounts or public clients.
- `src/offline_demo_server.mjs` checks socket and exact Host first, then throttles before reading the body or touching SQLite. Returns 429 JSON, `Retry-After`, no-store and nosniff.
- Quoted headers/JSON cannot elevate actor/merchant/reviewer roles. Existing CSRF, Origin, body-size and monetary fail-closed guards remain intact.
- `tests/demo_rate_limit.test.mjs` covers bucket independence, window resets, clock errors; `tests/offline_demo_server.test.mjs` exercises 60 rejected HTTP POSTs followed by 429 and read-only GET; `tests/public_secret_scan.test.mjs` heuristically scans tracked text without printing any potential secret.
- `docs/JUDGE_REPRODUCTION_EN.md` and `docs/VIDEO_STORYBOARD_EN.md` are drafts; the latter has explicit real-Sandbox and real-AI placeholders.
- **Pending:** owner selection of root LICENSE. This is not silently replaced by a guessed legal grant.
- **Not proven:** leak-free repository by comprehensive secret/security tooling, external hosting security, real AI, real Sandbox, payment authentication, D1 rate controls, public browser access or submission.

## Scope gates

Node tests and actual GitHub Actions outcome must be recorded separately. This D14 local guard does **not** convert any D03/D04 external blocker to verified status; real payment API POST remains disabled. Production rate limiting needs a replacement, not reuse of this synthetic single-process limiter.

## Execution evidence and observed correction
- GitHub Actions [40079004250](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40079004250): progress-check PASS, Node 178/179 PASS, 1 FAIL due to old hard-coded D14 0%-only test; browser step not run. This was **not** a regression in limiter behavior.
- GitHub Actions [40079069519](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40079069519) at `624c5ff49a7061c58aebfcf67219bfd9ecfab2d6`: Node **179/179 PASS**, master progress **18 dates PASS**, actual local Chromium browser **PASS**. Includes `public_secret_scan` signature test passing across Git-tracked text. This is a heuristic only.
- D14 60/100 by unchanged milestone weights (20 design + 30 tested + 10 CI; 40 IMPLEMENTATION remains pending final public LICENSE approval). Remaining planned 2h basic/4h safe; actual work duration NOT_MEASURED; legal/third-party waiting UNKNOWN.

### Browser flake root cause / definitive latest gate
- [40079230840](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40079230840): Node 179/179, dashboard PASS, but Chromium FAIL at first draft because the test dispatched two submit events immediately after asynchronous refresh click; `runOnce` legitimately ignored the submissions while busy. **Not a payment or data integrity bug.**
- Fix: `tests/browser_offline_e2e.py` now waits for `Read-only GET completed` before dispatching the draft. No application or payment logic change for this fix.
- [40079303005](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40079303005), SHA `55c0c50a89e094f07e6bc2dec3cb608062aee733`: Node **179/179**, dashboard **18 PASS**, Chromium browser **PASS**. Final D14 **60% PARTIAL**; 40% implementation criterion remains pending owner-approved root LICENSE. External verification remains NOT_TESTED.
