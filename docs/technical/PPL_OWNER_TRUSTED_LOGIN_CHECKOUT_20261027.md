# PPL P0 — Trusted-host login ↔ Checkout session bridge
2026-10-27 KST. Repository `hibi89/hibi89-paypal-ai-hackathon` branch `lead/paypal`. Validated source SHA `501b4cc15bc6d7f2d8c5d56103010ea00d990054`. [GitHub Actions #40502023429](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40502023429).

## 1. Purpose and initial blueprint comparison
The owner's approved contest plan requires a genuine buyer→AI task/seller matching→human-approved quote→PayPal Sandbox order→buyer approval→capture→provider GET; policy audit, DB operations and scoped BI are additional elements. Existing `pilot_checkout_session_store.mjs` guarded PayPal session proof using durable SQLite and an opaque branded object, while `owner_buyer_return_inquiry.mjs` accepted a trusted host resolver; no consolidated trusted-host identity→session issuance path existed. An unvetted host could inadvertently bind a browser-supplied user identity. Added one internal-only bridge rather than deploying or changing the synthetic localhost server.

## 2. Working implementation
- NEW `src/owner_checkout_host_session.mjs` factory `createOwnerCheckoutHostSession({ledger,sessionStore,resolveTrustedPrincipal,authorizeSessionIssue})`.
- `issue({hostLoginHandle,quoteId})` obtains identity from the **injected host verifier**, not user-supplied cookies/headers/IDs, and validates quote owner/merchant, version and human approval. Requires an independent trusted callback `authorizeSessionIssue`; rechecks identity and quote after callback before issuing durable SQLite session. The resulting bearer is stored in a module-private WeakMap, not returned in JSON/logs. The client only gets a server-process object capability and nonsecret expiry.
- `resolveTrustedCheckout(serverHandle)` validates the exact object capability; invokes host login verifier *on every read*, rechecks quote, merchant and version, and re-verifies the stored 15-minute token via branded `sessionStore.verify`. Produces `sessionProof` consumable by the existing GET-only buyer-return inquiry and owner Sandbox coordinator.
- `revoke(serverHandle)` checks identity then invalidates the SQLite token and local handle. A user logout/account reassignment or expired/revoked proof blocks future inquiry; no automatic session reissuance.
- No PayPal API, Gemini, network, HTTP route, real authentication provider, production cookies, public deployment or cost.

## 3. Runtime tests
NEW `tests/owner_checkout_host_session.test.mjs` adds 9 actual SQLite-backed Node tests: constructor requirements; separate human session approval; opaque non-serialized handle; forged browser object/cookie values; logout/account-change/merchant change; 15-minute expiry and revocation; foreign quote and malformed ID rejection; post-issuance quote revision invalidates proof; integration with `createOwnerBuyerReturnInquiry` confirms owner-scoped GET path and rejection of forged/session-ended callback lookup without Capture.
Exact tested commit `501b4cc15bc6d7f2d8c5d56103010ea00d990054`: [Actions #40502023429](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40502023429) **SUCCESS**; 407/407 Node tests PASS (previously 398), Chromium local browser journey PASS, progress/dashboard validation PASS.

## 4. Current status vs required proof
DONE: trusted-host login verifier *integration interface* and durable proof binding, read-only callback integration through injected resolver, session invalidation tests.
PARTIAL: a real authentication provider/production TLS/reverse proxy/cookie security/CSP/CSRF, actual merchant account identity, seller-buyer onboarding. Current host verifier is INJECTED; these tests do not prove real production auth or actual buyer identity. Handles are process-local and cannot be recovered after restart. Session proof on disk is one-per-quote and intended one-shot; existing issued sessions must not be silently replaced.
BLOCKED: owner approval for actual real Sandbox calls; verified Business merchant↔REST app, distinct Personal buyer, HTTPS callback reachable from buyer browser, one capped Orders v2 CREATE→buyer approval→Capture→fresh PayPal GET. A genuine PayPal call was **not** made here.
NOT_DONE: completed genuine AI↔buyer↔payment application, real independent SOVIA/DBVORA services, actual business dataset, public deployment/video/Devpost receipt. Do not infer whole-vision completion percentages from 407 synthetic tests.

## 5. Security principles
Do not pass a browser `verified:true` object as `hostLoginHandle`; actual host must verify a secure server-side session independently. Keep returned opaque handle in server process only; do not serialize or expose it to the browser. Callback URL query, PayerID and cookies never authorize Capture or payment state. Only existing provider-GET bounded payment orchestrator can reconcile; timeout/unknown provider POST stays GET-first without a repeated request. No raw bearer token in response. The capability is not a production distributed session layer.

## 6. Runtime/permissions/deploy
Node >=22.5 built-in SQLite with experimental flag, no added npm dependency, no hosting change. `publicHttpEnabled:false`, `productionAuthImplemented:false`, `implicitProviderAccess:false`. No live money, no PayPal Live API, no real Sandbox order, no secret writing to GitHub or files.

## 7. Failures and recovery
New code/test source passed on first CI. On missing/forged host principal or human session consent, no session is issued. After session revoked/expired, do not automatically reissue (SQLite unique scoped issuance). On quote revision, reject original proof. If process stops, in-process WeakMap capability is lost and must only be rebound by a separately verified host-side recovery flow in a future architecture; no silent fallback to browser token.

## 8. Ownership and commit history
Previous pass `321bfd21093e0794e14622748b5391eb3af17a93`; implementation `7d998eb5880f17c1cd95cd83f749bbee37431bd3`; nine-test validated `501b4cc15bc6d7f2d8c5d56103010ea00d990054`. `main` untouched, no force push. Original sources remain retrievable through Git history. Only PayPal contest repository updated, no private SOVIA/DBVORA source copied.

## 9. Next verified acceptance steps
P0: separately authorized actual Sandbox merchant REST app+Business and Personal buyer, private authenticated HTTPS service, explicit Order approval, Capture and PayPal GET; observe correct merchant/amount and no duplicate POST. Also independently verify secure host login and logout. P1: gated real Gemini skill classification with verified project Free tier and owner consent. P2: actual multi-user seller identity and privacy/billing evidence, safe publicly runnable demo, MIT root and under-3-min YouTube video. P3: English Devpost and submitted receipt before 2026-11-13 05:00 KST (repo schedule).

## 10. Verification cutoff
2026-10-27 KST, `501b4cc15bc6d7f2d8c5d56103010ea00d990054`, CI #40502023429: 407/407 PASS and Chromium PASS. Final docs-only HEAD will require its own verification. All third-party provider and production steps are still unverified.
