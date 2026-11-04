# Worker-safe OIDC authorization-code token transport — 2026-11-03 KST

**Scope:** internal, dormant, server-side code only. No external network requests, Cloudflare remote D1 changes, public identity or payment actions in this change.

## Compared approaches and decision

1. Reuse `src/oidc_authorization_code_flow.mjs` (Node host): existing code uses Node `Buffer` and host-specific flow assumptions; not the chosen Cloudflare Worker transport.
2. New `src/worker_oidc_token_transport.mjs` (selected): Web Standard `Response`/Streams, `TextDecoder`, `btoa`, `AbortSignal.timeout`, no Node globals and no implicit global fetch. An injected backend-only fetch executor and `networkApproved:true` are required; default OFF. CI injects a **synthetic in-process fake fetch** and uses an explicit local callback exception, never the real network.

## Contract and security

Pinned canonical HTTPS token endpoint (no credentials, query/fragment, IP literal, localhost, nonstandard port) plus exact HTTPS `/api/auth/oidc/callback` and client ID. CI-only `allowLocalCallback:true` permits a pinned HTTPS 127.0.0.1 ephemeral port for the **test harness**, not a public deployment. Reject ticket-supplied endpoint/client/callback overrides and malformed code/PKCE verifier before a request. Credentials are carried as percent-encoded OAuth HTTP Basic on **one** authorization-code POST; explicit `redirect:'error'`, no cookies, no cache/referrer, abort deadline 1–10 seconds, no automatic retry of ambiguous results. Strict HTTP 200 JSON, ≤16 KiB streamed response, valid Bearer/id_token syntax required. Provider access/refresh tokens discarded; id_token is **not** trusted until the existing pinned RS256 issuer/audience/nonce and D1-bound merchant identity verifier accepts it.

The preceding coordinator atomically reserves D1 login state **before** exchange, making a provider POST one-time. Transport has no PayPal create/capture, AI or payment authorization. Errors do not include secrets or token content. The CI-only workerd entrypoint uses an ephemeral client secret and the actual transport with injected fake fetch; no public Worker entrypoint changed.

## Evidence and remaining gate

Tests `tests/worker_oidc_token_transport.test.mjs` cover disabled mode, strict request, pinned trust, oversized/invalid responses, one request after errors, and the explicit isolated loopback callback. `[d1-local]` runs the exact production-candidate transport on real workerd HTTPS + local D1 via signed synthetic IdP response. No real client registration, official IdP token/JWKS, trusted public callback, Cloudflare remote Free D1 or PayPal/Gemini has been executed. **RELEASE HOLD.**
