# PayPal synthetic three-role browser workflow + optional API protection

## Architecture decision

Option A, replace default owner/reviewer flow and force seller assignment: could break proven browser tests, old contract owners and evidence; not selected.
Option B, explicit opt-in seller session and browser workflow behind local loopback plus persisted policy hook on legacy REST: minimal cost, backward-compatible default, buyer/reviewer/seller proven in Chromium. SELECTED. No external provider/network or auth provider.

## Implemented

CLI: `npm run demo -- --synthetic-seller`. Button-controlled owner→seller→reviewer→owner rotation uses separate random HttpOnly seller and reviewer test cookies with same-site strict; request JSON/headers cannot self-grant seller role. Existing role toggle remains two-person without opt-in. Owner explicitly creates contract then invokes separate local fixed-seller assignment action, server validates CSRF/origin and owner resource. Seller contract and event reads checked against persisted tenant/profile; submit/reviewer accept or reject committed in one SQLite transaction. No payment authorization; F5 loads GET only.

Existing quote/contract APIs now have optional `identityPolicy` guard and check persisted active actor's tenant and action. Default local demo injects this guard and preserves old owner-as-deliverer only when opt-in three-role mode is disabled. Base contract POST validates allowed request fields before role authorization so malformed role claims still produce 400; denied transitions return 403.

IMPORTANT NON-PRODUCTION BOUNDARY: primary quote/contract mutations only recheck membership at API entry; unlike the new seller workflow, membership is not revalidated inside every legacy SQLite write transaction. Do not use as a production authorization implementation; need atomic write-time guard, real identity issuance and merchant attestation before public release.

## Evidence and failure

Exact source `a6860d473fca45daf1922ca727381646691335e9`: [full CI 608/608+Chromium 3 user types + Windows SUCCESS](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/41189733797), [offline smoke SUCCESS](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/41189733734). Real Gemini/PayPal POST calls 0. Existing `main` untouched.

Failed intermediate source `0387da5` changed malformed contract POST from 400 to 403. Corrected at `a6860d4`, preserves original validation ordering and scoped role checks, CI green.

Next: enforce database-transaction-atomic role at all legacy quote and contract writes; independently verify real seller proof; owner authorization required for live identities, PayPal/Gemini Sandbox actions, public deployment or release.