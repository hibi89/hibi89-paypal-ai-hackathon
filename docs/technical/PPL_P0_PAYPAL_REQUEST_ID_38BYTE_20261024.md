# P0 PayPal-Request-Id 38-byte API compatibility audit (2026-10-24 KST)

## Evidence and discovered blocker
Official PayPal idempotency reference states **38 single-byte characters** for the `PayPal-Request-Id` header:
https://developer.paypal.com/api/rest/reference/idempotency

Before this patch, `requestKey(quote,'create')` is 39 ASCII characters and `requestKey(quote,'capture')` is 40. The Sandbox transport sent these durable ledger keys directly in the header; an actual Orders v2 request could be rejected even though all offline tests passed. No real PayPal API call has been attempted; provider rejection is **possible, not observed**.

## Alternatives considered
- A: Truncate `requestKey` directly. Simple but changes persisted `payment_attempts.request_id`, breaks crash recovery and reconciliation for existing SQLite databases. **Rejected.**
- B: Preserve durable internal key, derive a separate fixed 38-byte ASCII header ID from SHA-256 of the internal key. Stable on restart, 144-bit digest fragment, distinct for create vs capture, protects existing SQLite and the idempotency contract. **Selected.**
- C: Migrate all existing payment attempts to shorter request keys. Requires DB migration and remote-side reconciliation, higher deployment risk with no value for this phase. **Deferred.**

## Contract
- `requestKey()` is **unchanged** (39/40 chars); it remains the database key. `paypalRequestHeaderId()` accepts only the valid internal key pattern and returns `p-` plus 36 lowercase SHA-256 hex characters = **38 ASCII bytes**.
- The Sandbox transport applies this function to outbound `PayPal-Request-Id` for both Orders create and capture. It does not alter quote approval, payment ledger operations, HTTP paths, status reconciliation, buyer workflow, Sandbox-only boundary, or POST UNKNOWN no-blind-retry rule.
- Deterministic mapping provides stable replay identity, but does not authorize retrying after UNKNOWN. PayPal idempotency retention is provider-limited; never assume indefinite server storage.
- No provider account, credentials, Live calls, Sandbox HTTP calls, billing, deployments or final submissions. All tests use synthetic fetch fixtures.
- If real PayPal calls were independently made before this patch using legacy 39/40-char header values, those legacy remote transactions MUST be reconciled via authenticated GET before any further payment action. Do not silently remap an ambiguous in-flight payment. Current repo contains no verified real PayPal receipt.

## CI and remaining status
CI pending for this change. D03 remains 0% BLOCKED; D04 80% PARTIAL; D15 20% PARTIAL; D16-D18 0% NOT_STARTED. D15 estimated remaining 5h / safety 10h, actual elapsed NULL. This is PayPal compatibility preparation, **not actual API integration proof**.
