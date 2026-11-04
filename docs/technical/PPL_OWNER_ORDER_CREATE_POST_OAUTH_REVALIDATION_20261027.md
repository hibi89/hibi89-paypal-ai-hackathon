# PPL P0 — Owner checkout proof revalidation before Orders CREATE

**Date:** 2026-10-27 KST. **Repo/branch:** `hibi89/hibi89-paypal-ai-hackathon@lead/paypal`.
**Work state:** source and regression test committed; 3 targeted V8 injected-mock behavior checks PASS. **Full Node/SQLite/Chromium CI and actual PayPal Sandbox Orders E2E NOT VERIFIED.**

## 1. Goal / original architecture
The owner-approved contest flow requires an exact approved synthetic quote + Business merchant binding, non-serializable branded SQLite checkout proof, human authorization, one-time operation claim, and PayPal Sandbox OAuth→Orders CREATE→provider GET. The browser is not a payment authority. `createOwnerPilotOrderOnce` is the bounded owner-only API. No Live endpoint, new dependency, or public HTTP route is authorized.

## 2. Missing safety boundary and alternatives
Previously `createOwnerPilotOrderOnce` verified the durable proof before `createFromPlan` performed OAuth. The session could be revoked or expire while awaiting OAuth, yet an Orders CREATE POST could still proceed. Alternatives: (A) pre-OAuth-only check (unsafe), (B) recheck the private proof after OAuth immediately before Orders POST (chosen: bounded local read), (C) lock a database transaction across provider OAuth (unnecessary database contention).

## 3. Implementation
- `src/paypal_sandbox_transport.mjs`: internal `createFromPlan(quote,planned,{beforeProviderPost}={})` invokes the callback after OAuth and immediately before the Orders CREATE POST. `createOwnerPilotOrderOnce` supplies a closure calling `boundServerSessionFromStoredProof(sessionProof,quote)`. The existing pre-OAuth proof check and first-claim validation remain in place. The general `createOrderOnce` behavior is unchanged for existing synthetic callers.
- The trusted checkout proof is SQLite-backed and private; browser `verified:true` objects remain invalid. No new token exposure, no OAuth rerun and no retry after UNKNOWN.
- On revoked proof, the existing owner coordinator catches the ambiguous post-claim result, persists UNKNOWN and blocks automatic re-POST.

## 4. Regression test
`tests/owner_pilot_checkout_coordinator.test.mjs` adds a real SQLite/mock PayPal case: revoke the owner session inside the injected OAuth handler after the CREATE claim, assert zero Orders POST, an UNKNOWN persisted create attempt and no second POST with the revoked proof.

## 5. Direct execution evidence
Three behavioral checks executed against the **actual updated GitHub transport source** in a V8 isolate with injected synthetic dependencies (remote blob SHA `ea2d284616d5ea6d008a44075afd53a636af32f9`):
1. Revoke while awaiting OAuth: branded proof checked twice; zero Orders POST — PASS.
2. Invalid proof at entry: reject before any OAuth or Orders request — PASS.
3. Valid proof: proof checked before+after OAuth, one synthetic Orders CREATE and valid GET shape — PASS.

**Limitations:** These isolated checks are not Node's `node:test`, real `node:sqlite`, Chromium E2E, real merchant authentication or real PayPal GET. No real provider call took place.

## 6. CI investigation
Existing workflow `.github/workflows/test.yml` exists on `lead/paypal` and runs on branch pushes, but it does **not exist on `main`**. The earlier draft PR #1 to `main` could not provide a trustworthy Actions run, was not merged and is closed. Available GitHub connector lists only PR-related workflow runs for a commit; the `push`-event check is not exposed. Container DNS cannot resolve GitHub for cloning. **Exact-SHA Node+Chromium CI remains unverified, not reported as PASS.** No extra branch or PR created in this step.

## 7. Source commits / rollback
- Source commit: `d0bc12e7ea14f4b947cd3a6870651a6b041c6a27`.
- Regression commit: `3711481adad1dc06edabdc6d763fef037bca9d83`.
- Source baseline before work: `26f6b2cd387077764b53d9fc41dd2dc9b64dab47`.
- No main merge or force push. Use normal non-force Git revert if a later runtime regression is found.

## 8. Security / external permissions / budget
Zero external PayPal/Gemini calls, no public deployment, no Live funds, no payment creation, no new license or library, no account secret or customer PII in source. Any real Sandbox CREATE, browser buyer approval, Capture, OAuth repetition or new Gemini AI call needs the owner's separate scope approval and verified local credentials.

## 9. Remaining release blockers
1. Exact-source `npm test` and Chromium verification, e.g. user-provided Actions run URL or a runnable local clone.
2. Owner-confirmed Sandbox Business payee/REST app binding and separate Personal buyer; safe HTTPS return/cancel and trusted server login.
3. Explicitly authorized one synthetic USD 1–2 transaction: create → buyer approval → separately approved capture → PayPal provider GET.
4. Real integrated Gemini matching with authorized free-tier use, then reviewer runnable repo/English instructions, genuine under-3-minute public video and Devpost receipt.

## 10. Handoff and completion rule
Do not upgrade day progress or product-wide percent from code presence or 3 isolated tests. The 2026-11-13 05:00 KST submission deadline controls scope. Next work should prioritize actual integration/test proof rather than further speculative hardening.
