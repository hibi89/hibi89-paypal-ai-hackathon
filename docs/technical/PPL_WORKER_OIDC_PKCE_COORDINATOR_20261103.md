# PayPal Cloudflare Worker OIDC PKCE coordination — 2026-11-03 KST

**State: internal library and offline security integration only. RELEASE HOLD. No real IdP requests, account provisioning or public login route.**

## Options and selected design

A. Expose the existing synthetic Node marketplace login over public HTTP: low short-term code effort, but unsafe because fake identities, disk SQLite and Node lifecycle are not deployable as an authenticated Worker service.

B. **Selected:** preserve the separately reviewed D1 RS256 pinned-JWKS identity authority and add one narrowly scoped, backend-only OAuth authorization-code + S256 PKCE coordinator. Existing authority manages one-time challenge nonce, D1 CAS consumption, preprovisioned issuer+subject mapping, revocation and session generation; new coordinator exclusively checks HTTP start/callback state, makes PKCE verifier, builds fixed authorization redirect and passes a code to an **injected** approved server code transport. It never fetches/discovers external endpoints or exposes self-registration.

C. Add a new public OIDC Worker handler immediately: would require a real IdP client, operator-approved HTTPS callback domain, pinned JWKS, secret/config governance and an actual Cloudflare D1 remote account. Not approved and not selected.

## Implementation

- `src/worker_oidc_pkce_coordinator.mjs` is standalone and **not exported by the current public Worker**. Fixed `POST /api/auth/oidc/start` requires same-origin Origin and Fetch-Metadata; callback `GET /api/auth/oidc/callback` checks exact signed HTTPS origin, state, one-time D1 challenge ID and 43-char HttpOnly, Secure, SameSite=Lax state+verifier cookies, blocking invalid/multiple cookies and wrong parameters before any exchange.
- PKCE verifier is 32 crypto-random bytes; SHA-256 S256 code challenge is sent to a fixed operator-approved HTTPS authorization endpoint. `redirect_uri`, client ID, scope, and S256 method are server-owned. The fixed token endpoint is passed only to `codeTransport.exchange`; this module itself performs **zero network operations**.
- The existing `worker_private_oidc_authority.mjs` verifies RS256/nonce, registered issuer, audience and active preprovisioned member, and atomically writes a hashed session in D1. No role/merchant value from browser or ID token is trusted. No payment.
- `tests/worker_oidc_pkce_coordinator.test.mjs`: invalid start and callback, PKCE S256 digest, state and cookie security, fixed endpoint, success and error handling.
- Extended existing `tests/worker_private_oidc_authority.test.mjs` to prove **actual SQLite/D1-shaped contract + RS256 signing + PKCE code exchange + owner GET + immediate binding revocation**. Windows+Linux CI must validate the exact feature SHA; this is not proof of an external IdP.

## Release / next real evidence

No public route was connected and no external OIDC code exchange was executed. A real provider connection requires prior explicit approval for the selected IdP, client, permitted callback, OAuth permissions, JWKS trust and network calls; a real Cloudflare Free D1 account and Worker production URL also remain unverified. Even complete offline CI success is only a backend compatibility milestone, not a signed-off public login or product release. Part1/Part2 and PayPal monetary flows remain untouched.
