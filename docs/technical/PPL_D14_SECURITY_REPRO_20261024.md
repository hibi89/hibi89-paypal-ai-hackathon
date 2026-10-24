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
