# Local workerd Proofline private OIDC integration — 2026-11-03 KST

**No external IdP, PayPal/Gemini, Cloudflare remote operation, production deploy or real payment. RELEASE HOLD.**

## Design choice

- Option A: expose the internal router from the existing READ-ONLY Worker. Rejected: would change the default production entrypoint and could accidentally expose login.
- Option B: test the internal router inside a separately named, **CI-only Worker entrypoint** with a disposable real Wrangler local D1 database and ephemeral RSA signing fixtures. Selected: zero permanent resources, 0 account credentials, no public endpoint and authentic localhost HTTPS/workerd execution.

## Files and safety

`scripts/worker_private_identity_workerd_ci.mjs` is a test-only Worker default export. Its exact `CI_PRIVATE_IDENTITY_OPT_IN=LOCAL_SYNTHETIC_NO_DEPLOY` gate requires temporary D1, origin, RSA public/private JWK fixture and 32-byte HMAC pepper. It imports the **same** existing runtime OIDC authority, PKCE coordinator and internal 4-path router. It synthesizes signed RS256 ID tokens *only after the D1 SQL challenge has been atomically reserved*, without an external provider or `fetch()`. No real identity, merchant or payment authority is created.

`scripts/probe_private_worker_identity_runtime_local.mjs` is constrained to GitHub Actions with `CLOUDFLARE_API_TOKEN=''`, disabled Wrangler telemetry and `RUNNER_TEMP` ephemeral local-only D1. It generates RSA keys/pepper in memory, writes only temporary 0600 config/seed files, drains unprinted Wrangler process logs, terminates the isolated Linux process group and removes config/SQL on exit. It uses the previously validated Wrangler 4.156.0 local engine, 4 existing migrations and loopback workerd HTTPS with a self-signed certificate accepted **only for 127.0.0.1**.

CI asserts 303 PKCE S256 authorization redirect and HttpOnly state+verifier cookies, signed RS256 callback returning HttpOnly Secure session, actual primary D1 quote/attempt status read, no CORS/cache leaks, origin/Cross-Site/POST restrictions, unknown PayPal Capture endpoint 404, POST logout revocation and no session/callback replay. Server fake signer is strictly CI-private: do not ship it with a production Worker, do not reuse fixture keys or claim a real IdP/Cloudflare remote deployment.

## Completion gates

The `[d1-local]` job must report `ACTUAL_LOCAL_WORKERD_PKCE_RSA_D1_LOGIN_READ_REVOKE_PASS` with zero actual provider calls, full Linux/Windows and smoke regression SUCCESS. **Real** Cloudflare Free D1, real IdP endpoint/registration/consent, provider token exchange, trusted production TLS and PayPal merchant/payment remain distinct owner-approved gates.
