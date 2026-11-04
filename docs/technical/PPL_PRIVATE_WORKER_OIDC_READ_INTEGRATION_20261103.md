# 2026-11-03 — Private Worker OIDC authentication + D1 read integration

**RELEASE HOLD. No live deployment, IdP or payment provider calls.**

Two designs were evaluated. Replacing the existing deployed/default read-only Worker entrypoint would accidentally expose login flows when misconfigured, so it was rejected. The selected design adds `createPrivateWorkerIdentityReadRouter` as an **internal, non-default-exported factory** explicitly disabled unless `enabled === true` with injected D1, pinned RS256 authority, HTTPS origin and opt-in PKCE coordinator. No signed assertion, tenant role or public user can set these dependencies. The existing `src/worker_private_read_runtime.mjs` remains unchanged and READ ONLY.

The integrated handler accepts only `POST /api/auth/oidc/start`, `GET /api/auth/oidc/callback`, `POST /api/auth/oidc/logout` and `GET /__private/attempt/status`. All remaining routes, including PayPal orders and capture, return 404. Existing component checks enforce first-primary D1, state/PKCE, one-time D1 challenge reservation, pinned issuer+audience+RS256, preprovisioned identity binding, HttpOnly session cookies and atomic revocation. The logout adds strict method, same-origin Origin and Fetch-Metadata gates and clears the session cookie. All responses keep no-store and no CORS.

Tests added to the existing authority integration regression use a synthetic signed RSA fixture and SQLite's real transaction semantics. They prove start→callback→D1 inspection→logout→replay denial, plus default-off, wrong-origin, cross-site logout and unexposed payment routes. Tests are **local contract verification**, not a real Cloudflare-hosted login, real IdP code exchange, D1 remote persistence or PayPal/Gemini API proof. No D1 migrations, production host, keys, real customer data, release flags or provider network requests are changed.

**Next gate:** Cloudflare authenticated owner access and separately approved real IdP settings/credentials/callback. A real public Worker with a stable origin and true login/merchant verification requires explicit authorization and independent browser/API security validation.
