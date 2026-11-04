# PayPal P0 — legacy SQLite write-time membership role check (2026-10-31)

## Option comparison

**A: API-only policy guard.** Minimal source change but after an awaited check the membership could be revoked before any locked database write. Insufficient.

**B: Opt-in `BEGIN IMMEDIATE` database role recheck. SELECTED.** Existing SQLite file and cost zero; lock-held reads validate persisted active member and tenant/role next to quote/contract CAS and event write. Preserve old APIs and schemas; no new external provider.

## Scope

Strict opt-in `createSqliteLedger({enforceLocalMemberWrites:true,allowLocalOwnerDelivery:...})` is used in existing local `startOfflineDemo` only. Default false retains existing standalone/pilot interfaces. Locked buyer checks on `approve`, `reject`, `revise`, `claimAiDraft`, `claimOperation` and marketplace candidate binding; contract creation requires buyer and reviewer active in same tenant; legacy milestone transition checks member grant, and three-party demo forbids owner-as-seller. Synthetic seller/reviewer workflow already has locked assigned contract checks. Error `LOCAL_WRITE_ROLE_REVOKED` 403 before write, transaction rollback on deny.

Not changed: system-controlled seed insertQuote, manual trusted member provisioning, markAiDraftUnknown crash cleanup, PayPal provider transport or payment reconciler. All live provider HTTP calls remain disabled in offline demo.

## Tests and evidence

Functional SHA `db92ea8c1fd0562954cf89035cdf9d89e3bc424f`: [GitHub full Actions #41190607791](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/41190607791) SUCCESS **614/614 Node**, Chromium AI Work / Global Services / seller→reviewer accept+rework, Windows first-run and private video integrity; [offline smoke #41190607860](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/41190607860) SUCCESS. Tests include revocation *after* branded API policy grant, cross-SQLite-connection revocation visibility, no lost audit/contract version, no payment capture.

Recovered one test-only issue: intermediate SHA `364ad09` passed `{ownerDelivery:true}` to `test()` rather than the inner `fixture()`, so wrong fixture mode failed; corrected at `db92ea8`, full CI green. Previously tested application source recovered.

## Remaining safeguards before public availability

Still local synthetic identity, no actual buyer/seller login or PayPal merchant attestation. Checking current ACTIVE membership inside transaction prevents a persistently revoked actor writing, but it does **not** bind an already-issued precheck to its exact persisted membership revision if a revoke→reactivate cycle happens before commit. Next phase should carry trusted role proof revision into the locked DB write, fail on mismatched versions, and test security by interleaving separate SQLite clients. Actual real customer accounts, provider calls, data, public hosting and release require owner approval.