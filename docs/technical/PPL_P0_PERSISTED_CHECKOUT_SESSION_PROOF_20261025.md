# P0 — Durable Checkout Session Proof Gate (2026-10-25 KST)

## Gap closed, offline only
Previously `createOwnerPilotOrderOnce(quote,claim,{publicOrigin,serverSession})` accepted a caller-supplied plain object with `{verified:true}`; this could be forged if a future developer inadvertently passed incoming request JSON into the internal transport. The existing checkout planner validated matching string fields but could not prove that a trusted server had issued a real checkout session.

The new `src/pilot_checkout_session_store.mjs` adds local **on-disk SQLite** proof issuance, verification, expiry, revocation and private in-memory proof branding:
- `createPilotCheckoutSessionStore({filename})` fails on memory DB, uses a disk SQLite WAL table, stores only a SHA-256 digest of a 32-byte random URL-safe bearer token, and enforces one issuance per quote/version/merchant. Tokens never appear in DB, GitHub, CLI output, logs or downstream request payload; only the trusted server receives them at issuance.
- A trusted server must first authenticate the human principal. `issue({quote,principal})` requires `principal.verified===true`, quote owner/merchant matching, human approval/current version, real merchant **syntax** (13 alphanumerics), USD $1–$2 cap. **The caller-provided principal is NOT an identity provider**.
- `verify({token,quote,principal})` checks the persisted token hash, owner, merchant, quote version, immutable amount and 15-minute expiry. Returns an immutable, **unforgeable within the Node process** proof object whose private metadata stays in a module-scoped WeakMap. Copied `{verified:true}` objects or serialized/reconstructed proof objects are rejected.
- `boundServerSessionFromStoredProof(proof,quote)` re-reads the row on every use and fails after expiry, revocation, quote change, or DB close. Reopen the disk DB, verify the owner token again, and build a new in-memory proof to recover after restart. No auto retry, no provider HTTP.
- Existing internal `createOwnerPilotOrderOnce` now accepts `{publicOrigin,sessionProof}` **instead** of a free-form `serverSession`; it validates the branded DB proof BEFORE PayPal OAuth or Orders POST. The pure `planOwnerSandboxPilotCheckout` remains an explicitly offline-only planner with its own field checks.
- Nine new session-store regression tests plus existing pilot integration regressions cover forgery, persistence/restart, expiration, revocation, amount/version/owner change, duplicate issuance, in-memory filename rejection and no API before session proof validation.

## Proof boundary
This is **local Node SQLite with an injected verified principal**, not production auth, federated login, durable cloud D1, HTTPS callback hosting, cookie/CSP/CSRF implementation, or real provider evidence. The public demo retains its loopback-only synthetic identity; real payment routes are **still disabled**. A production backend must use its real authenticated server principal, durable session identity and real HTTPS return/cancel listener; never accept `principal.verified` from browser JSON, headers, or request parameters. A local proof cannot establish PayPal's real Business merchant belongs to the REST app.

The owner's **prior** PayPal Sandbox OAuth and Gemini text responses were each HTTP 200 (one call each); those are not Order create/capture proof. This change makes **ZERO** PayPal/Gemini API calls and does not deploy. Do not repeat the consumed owner one-shot probes or initiate orders without fresh, narrow authorization.

Progress truth: D03 65% PARTIAL (buyer order/approval/capture 35% NOT_TESTED), D04 80% PARTIAL (real AI quote/UI NOT_TESTED), D15 20% PARTIAL (host/session NOT_TESTED). 18 days DONE12/PARTIAL3/BLOCKED0/NOT_STARTED3; actual elapsed time NOT_MEASURED. No completion percentage awarded for an offline security guard.

## Next
Select a trustworthy HTTPS return/cancel listener and real server auth approach; obtain the actual Sandbox Business merchant/app binding privately; then seek separate explicit authorization for at most one tiny Sandbox order, buyer approval and capture with new durable operation claims. No automatic replay on ambiguous payment POST.
