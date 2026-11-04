-- OFFLINE MIGRATION CANDIDATE ONLY. No remote D1 application without
-- explicit approval, a database backup and rollback rehearsal.
-- Database-level state/receipt invariants complement, not replace,
-- trusted PayPal provider verification. These triggers make no API calls.
-- The new rules apply to future writes; preexisting rows are not rewritten.

-- Every new attempt begins as a claim, never as an invented approval/payment.
CREATE TRIGGER IF NOT EXISTS payment_attempt_must_start_inflight
BEFORE INSERT ON payment_attempts
WHEN NEW.state != 'IN_FLIGHT' OR NEW.remote_id IS NOT NULL
BEGIN SELECT RAISE(ABORT,'PAYMENT_CLAIM_MUST_START_IN_FLIGHT'); END;

-- Allowed state transitions only. PAID is terminal. UNKNOWN can be reconciled
-- after separate verification; it may never re-enter IN_FLIGHT/CREATE.
CREATE TRIGGER IF NOT EXISTS payment_attempt_state_monotonic
BEFORE UPDATE OF state ON payment_attempts
WHEN OLD.state IS NOT NEW.state AND NOT (
 (OLD.state='IN_FLIGHT' AND NEW.state IN ('UNKNOWN','APPROVED')) OR
 (OLD.state='UNKNOWN' AND NEW.state IN ('APPROVED','PAID')) OR
 (OLD.state='APPROVED' AND NEW.state IN ('UNKNOWN','PAID'))
)
BEGIN SELECT RAISE(ABORT,'PAYMENT_STATE_TRANSITION_FORBIDDEN'); END;

-- A remote order reference is a necessary, never sufficient, prerequisite
-- for marking provider APPROVED or PAID. Receipt authenticity is separately
-- verified by a consented, read-only provider boundary.
CREATE TRIGGER IF NOT EXISTS payment_attempt_proof_reference_required
BEFORE UPDATE OF state,remote_id ON payment_attempts
WHEN NEW.state IN ('APPROVED','PAID') AND NEW.remote_id IS NULL
BEGIN SELECT RAISE(ABORT,'REMOTE_ORDER_REFERENCE_REQUIRED'); END;
