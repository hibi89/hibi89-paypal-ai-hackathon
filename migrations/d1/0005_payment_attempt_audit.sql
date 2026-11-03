-- OFFLINE MIGRATION CANDIDATE ONLY: do NOT apply to remote D1 without
-- owner-approved backup, rollback rehearsal, and explicit migration approval.
-- SQLite triggers record claim, remote-ID binding and state transitions in the
-- same transaction as the payment_attempts mutation. No external calls.
-- This is DB-enforced append-only history, NOT cryptographic tamper-proofing.
CREATE TABLE IF NOT EXISTS payment_attempt_audit (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 request_id TEXT NOT NULL REFERENCES payment_attempts(request_id) ON DELETE RESTRICT,
 quote_id TEXT NOT NULL,
 quote_version INTEGER NOT NULL,
 merchant_id TEXT NOT NULL,
 operation TEXT NOT NULL,
 event_type TEXT NOT NULL CHECK(event_type IN
  ('MIGRATION_BASELINE','CLAIM_CREATED','STATE_CHANGED','REMOTE_ID_BOUND')),
 before_state TEXT,
 after_state TEXT NOT NULL CHECK(after_state IN ('IN_FLIGHT','UNKNOWN','APPROVED','PAID')),
 remote_id TEXT,
 observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payment_attempt_audit_request
 ON payment_attempt_audit(request_id,sequence);
-- A historical snapshot has no provable transition provenance. Label it
-- explicitly as a baseline rather than inventing a CLAIM_CREATED event.
INSERT INTO payment_attempt_audit
 (request_id,quote_id,quote_version,merchant_id,operation,event_type,before_state,after_state,remote_id)
SELECT request_id,quote_id,quote_version,merchant_id,operation,
 'MIGRATION_BASELINE',NULL,state,remote_id FROM payment_attempts;
CREATE TRIGGER IF NOT EXISTS payment_attempt_audit_on_insert
AFTER INSERT ON payment_attempts
BEGIN
 INSERT INTO payment_attempt_audit
 (request_id,quote_id,quote_version,merchant_id,operation,event_type,before_state,after_state,remote_id)
 VALUES (NEW.request_id,NEW.quote_id,NEW.quote_version,NEW.merchant_id,NEW.operation,
 'CLAIM_CREATED',NULL,NEW.state,NEW.remote_id);
END;
CREATE TRIGGER IF NOT EXISTS payment_attempt_audit_on_state_or_remote
AFTER UPDATE OF state,remote_id ON payment_attempts
WHEN OLD.state IS NOT NEW.state OR OLD.remote_id IS NOT NEW.remote_id
BEGIN
 INSERT INTO payment_attempt_audit
 (request_id,quote_id,quote_version,merchant_id,operation,event_type,before_state,after_state,remote_id)
 VALUES (NEW.request_id,NEW.quote_id,NEW.quote_version,NEW.merchant_id,NEW.operation,
 CASE WHEN OLD.state IS NOT NEW.state THEN 'STATE_CHANGED' ELSE 'REMOTE_ID_BOUND' END,
 OLD.state,NEW.state,NEW.remote_id);
END;
CREATE TRIGGER IF NOT EXISTS payment_attempt_audit_no_update
BEFORE UPDATE ON payment_attempt_audit
BEGIN SELECT RAISE(ABORT,'PAYMENT_AUDIT_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS payment_attempt_audit_no_delete
BEFORE DELETE ON payment_attempt_audit
BEGIN SELECT RAISE(ABORT,'PAYMENT_AUDIT_APPEND_ONLY'); END;
-- The original claim identity and amount cannot be rewritten after claiming.
CREATE TRIGGER IF NOT EXISTS payment_attempt_claim_identity_immutable
BEFORE UPDATE OF request_id,quote_id,quote_version,merchant_id,operation,amount_minor,currency
ON payment_attempts
WHEN OLD.request_id IS NOT NEW.request_id OR OLD.quote_id IS NOT NEW.quote_id
 OR OLD.quote_version IS NOT NEW.quote_version OR OLD.merchant_id IS NOT NEW.merchant_id
 OR OLD.operation IS NOT NEW.operation OR OLD.amount_minor IS NOT NEW.amount_minor
 OR OLD.currency IS NOT NEW.currency
BEGIN SELECT RAISE(ABORT,'PAYMENT_CLAIM_IDENTITY_IMMUTABLE'); END;
-- A known remote order ID may never be overwritten or cleared.
CREATE TRIGGER IF NOT EXISTS payment_attempt_remote_id_immutable
BEFORE UPDATE OF remote_id ON payment_attempts
WHEN OLD.remote_id IS NOT NULL AND OLD.remote_id IS NOT NEW.remote_id
BEGIN SELECT RAISE(ABORT,'PAYMENT_REMOTE_ID_IMMUTABLE'); END;
