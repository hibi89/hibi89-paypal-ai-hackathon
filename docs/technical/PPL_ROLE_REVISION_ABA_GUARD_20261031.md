# PayPal — Persisted Membership Revision ABA Guard (2026-10-31)

## Choice

**A: Verify membership active during SQL write.** Minimal, preserves grants but a revocation followed by reactivation can restore access to an earlier approved request, despite a newer membership revision. Rejected as sufficient authorization.

**B: Bind the server-issued, persisted membership revision to each opt-in REST write and compare under `BEGIN IMMEDIATE`. Selected.** Zero-cost local SQLite, one atomic check and existing role/milestone CAS. Durable policy grant contains numeric `membershipRevision` while public identity inspection omits it. Only local synthetic trusted resolver is used.

## Code boundaries

`createQuoteApi` maps draft/reject/approve to persisted policy and passes `expectedMembershipRevision` to `revise`,`claimAiDraft`,`reject`,`approve`. `createContractApi` passes it to `createContract` and `transitionMilestone`. `assertLocalWriteLocked` compares `revision` with supplied expected value, refusing mismatch with 403 `LOCAL_WRITE_ROLE_VERSION_CHANGED`; revocation remains separate 403 `LOCAL_WRITE_ROLE_REVOKED`. Stateless or unversioned identity-policy fixtures are rejected as `TRUSTED_MEMBERSHIP_REVISION_REQUIRED` at role-protected REST.

Other trusted internal ledger calls can omit the optional expected revision to preserve backward compatibility; they still validate active/tenant/role where `enforceLocalMemberWrites` is enabled. They are not an open customer-facing API. Candidate binding, payment reconciliation and crash recovery require separate end-to-end public entitlement assessment before real launch; no new real order, capture, Gemini, account, or provider actions are authorized.

## Evidence

Exact source `afd7626ed2340c1d2f93cfa39b313cfe8e2b15fa` [full CI #41191256153](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/41191256153) SUCCESS 621/621 Node, Chromium original/three-role/Global Services PASS, Windows first-run PASS; [smoke #41191256037](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/41191256037) SUCCESS. Revision ABA tests include real Request→policy→ledger with injected revocation/re-activation between authorization and write, failed write rollback, fresh request success, and independent SQLite connection.

Test-only intermediate SHA `554a9b1` failed on incorrect expected claim action; repository's existing safe `FIRST_CLAIM_ONLY_NO_PROVIDER_CALL` was unchanged and test corrected at `dd254a7`. Static unversioned grant fail-closed added at final `afd7626`, full CI green.

## Deployment boundary

All findings apply to the local synthetic server. Not a verified user login, real seller identity, PayPal merchant attestation, HTTPS Production, or submitted Devpost. These require separate user approval and live verification.