# Proofline two-part architecture (owner decision 2026-10-31)

Decision: preserve and complete Part 1; add Part 2 innovation lab, five independent demos, one dashboard, distinct verification status. This supersedes proposals to discard/rewrite Part 1.

Architecture A (rewrite): discards established contracts/tests, risks timeline and unrelated migration cost. Architecture B (chosen): Part 1 remains on existing quote/contract/payment ledgers, Part 2 uses separate innovation SQLite and APIs under /api/demo/innovation/, with navigation between /demo and /demo/innovation. Reuse trusted local user session and persisted membership policy. No external service calls.

Part 2 implemented offline skill engines: (1) deterministic A2A OFFER, COUNTER, ACCEPT messages and no-agreement condition, (2) owner scoped category, cap, expiry and single-use delegation with SQLite transaction and replay fingerprint, (3) mock gift catalog lowest eligible item selection, (4) subscription retention offer proposal only, (5) invoice/dispute evidence draft only. GET state never mutates. All output says no PayPal/Gemini API and no real payment.

Next real engineering (not claimed done): pluggable buyer and seller LLM adapters + schema validation, message provenance, bounded turn state machine, provider budgets and failure recoverability; product-grade buyer/seller identity and mandate revocation/merchant binding, checkout authority and safe PayPal provider adapter, real opt-in catalog, subscription revisions with buyer approval, verified invoice and dispute APIs, durable storage, protected HTTPS, strong browser E2E, production and contest artifacts.

Use exact GitHub source + Actions CI + real browser to confirm progress. Prior Part 2 feature source 1731787a passed 641/641 Node and preexisting Chromium journeys; new Part 2 browser test is tracked in its own later source commit. User has approved this product scope, not external API usage, payment, deployment or public submission.
