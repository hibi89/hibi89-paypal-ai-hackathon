# Proofline offline identity contract — validated 2026-10-31 KST

## Why this slice

The original browser uses one local synthetic owner and one isolated synthetic reviewer. It has NO real seller login. A production service must **not** equate the submitted `merchantId`, `role`, `verified:true`, reviewerId, or a chosen fictional candidate with an authenticated buyer, verified seller, or PayPal Business merchant. A permit returned by the new policy is **not** payment authority.

## Options compared

| Option | Performance / implementation | New cost | Maintenance / risk | Decision |
| --- | --- | --- | --- | --- |
| A. Trusted-host read-only role-policy contract on existing Node/SQLite backend | Zero new dependency, O(1) lookup, role check at every use; preserves all existing offline tests | 0 new cash, no provider HTTP | Allows verified boundaries without guessing production identity provider; NOT actual registration/login | **Selected for immediate offline P0** |
| B. Replace with new externally hosted auth, Postgres and Redis | Distributed identity possible after implementing credentials, merchant ownership and durable role grants | Potential ongoing provider/hosting fees and new credentials | Greater migration/security complexity; production deployment/permissions need explicit approval | Deferred |

## Server-authoritative identity model

Preprovisioned member: `{actorId, merchantId, role, active, sellerProfileId?}`. Role must be buyer / seller / reviewer / merchant_operator; `sellerProfileId` required only for seller. `merchantId` is a LOCAL TENANT BOUNDARY, **not** proof of a PayPal merchant account. No user-supplied headers or JSON fields can register or change roles. A trusted host-only resolver provides session identity. Per-instance WeakMap brands a proof; each authorization revalidates the host session to catch revocation or switched identities.

| Role | Whitelisted authorization actions | Resource scope |
| --- | --- | --- |
| Buyer | quote read/draft/approve/reject, marketplace match/select, contract create/read | Exact quote owner plus tenant |
| Seller | own profile read, assigned contract read, deliver submission | Exact `sellerProfileId`, active contract and tenant |
| Reviewer | assigned contract read, delivery review | Exact `reviewerId`, active contract and tenant |
| Merchant operator | merchant read | Same tenant only, no payment/capture or quote approval |

Unknown actions and all payment/PayPal operations are fail-closed. The policy only evaluates preloaded server-trusted resource metadata. An API integrating this policy must FIRST retrieve that metadata from its trusted database rather than use a browser-provided ownerId/sellerProfileId.

## Local read-only HTTP fixture

`GET /api/demo/identity` returns a synthetic actor, role, allowed action names, and unverified flags. It does not issue cookies, tokens, accounts, merchant grants, or payments. `POST` is rejected. The role is resolved from the existing 127.0.0.1 demo session, not `x-role`. The fake reviewer cookie is only a test harness mechanism. No live seller account is exposed.

**Evidence:** Source SHA `ec63a40233579f36af8f722d5fff709e3ffc540b`; [Node 593/593, Chromium AI+Global Services and Windows](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/41187333370) PASS; [offline smoke](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/41187333467) SUCCESS. Real auth, seller onboarding, issuer/audience, durable membership revocation, merchant verification, session cookies, Production and actual Gemini/PayPal NOT tested.

## P0/P1 continuation without scope creep

1. Define trusted auth provider and identity issuance/verification contract, and obtain approval before provisioning accounts, changing permissions or accepting real customer data.
2. Persist principal↔tenant↔seller and quote/contract assignments in a single production-safe DB transaction; add negative multi-tenant, stale grant, revocation, replay and no-provider test cases. Reconcile seller submit/reviewer acceptance separately from existing local owner-submits-demo semantics.
3. Gate actual sensitive endpoints behind server-derived resource metadata, never browser role claims. Maintain CSRF and separate PayPal purchase authorization.
4. Verify in actual HTTPS browser and genuine consented Sandbox/AI only after the owner approves those activities; do not call local CI real provider proof.
