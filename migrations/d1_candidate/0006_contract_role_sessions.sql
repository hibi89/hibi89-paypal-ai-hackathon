-- Candidate 0006: isolated SELLER/REVIEWER contract sessions only.
-- Not in migrations/d1. Never apply to remote without approved backup and review.
-- Requires candidate 0005 and an independently OIDC-verified operator issuer.
CREATE TABLE IF NOT EXISTS worker_contract_role_bindings (
 issuer TEXT NOT NULL CHECK(length(issuer) BETWEEN 8 AND 200),
 subject_hmac TEXT NOT NULL CHECK(length(subject_hmac)=64),
 actor_id TEXT NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 128),
 merchant_id TEXT NOT NULL CHECK(length(merchant_id) BETWEEN 1 AND 128),
 role TEXT NOT NULL CHECK(role IN ('SELLER','REVIEWER')),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
 PRIMARY KEY(issuer,subject_hmac)
);
CREATE TABLE IF NOT EXISTS worker_contract_role_sessions (
 token_sha256 TEXT PRIMARY KEY CHECK(length(token_sha256)=64),
 issuer TEXT NOT NULL,
 subject_hmac TEXT NOT NULL CHECK(length(subject_hmac)=64),
 actor_id TEXT NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 128),
 merchant_id TEXT NOT NULL CHECK(length(merchant_id) BETWEEN 1 AND 128),
 role TEXT NOT NULL CHECK(role IN ('SELLER','REVIEWER')),
 binding_revision INTEGER NOT NULL CHECK(binding_revision>=1),
 membership_revision INTEGER NOT NULL CHECK(membership_revision>=1),
 assertion_sha256 TEXT NOT NULL UNIQUE CHECK(length(assertion_sha256)=64),
 issued_at_ms INTEGER NOT NULL CHECK(issued_at_ms>0),
 expires_at_ms INTEGER NOT NULL CHECK(expires_at_ms>issued_at_ms AND expires_at_ms<=issued_at_ms+1800000),
 revoked_at_ms INTEGER,
 FOREIGN KEY(issuer,subject_hmac) REFERENCES worker_contract_role_bindings(issuer,subject_hmac) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_worker_contract_role_expiry ON worker_contract_role_sessions(expires_at_ms);
CREATE TRIGGER IF NOT EXISTS worker_contract_role_binding_epoch BEFORE UPDATE
 ON worker_contract_role_bindings
WHEN NEW.revision<=OLD.revision
BEGIN SELECT RAISE(ABORT,'ROLE_BINDING_EPOCH_MUST_INCREASE'); END;
CREATE TRIGGER IF NOT EXISTS worker_contract_membership_epoch BEFORE UPDATE
 ON worker_contract_memberships
WHEN NEW.revision<=OLD.revision
BEGIN SELECT RAISE(ABORT,'CONTRACT_ROLE_EPOCH_MUST_INCREASE'); END;
CREATE TRIGGER IF NOT EXISTS worker_contract_role_binding_no_delete BEFORE DELETE
 ON worker_contract_role_bindings
BEGIN SELECT RAISE(ABORT,'ROLE_BINDING_DELETE_FORBIDDEN'); END;
CREATE TRIGGER IF NOT EXISTS worker_contract_role_session_no_delete BEFORE DELETE
 ON worker_contract_role_sessions
BEGIN SELECT RAISE(ABORT,'ROLE_SESSION_DELETE_FORBIDDEN'); END;

-- Identity and membership epochs cannot be edited after credential issuance.
CREATE TRIGGER IF NOT EXISTS worker_contract_role_session_identity_immutable
BEFORE UPDATE OF token_sha256,issuer,subject_hmac,actor_id,merchant_id,
 role,binding_revision,membership_revision,assertion_sha256,issued_at_ms,expires_at_ms
ON worker_contract_role_sessions
BEGIN SELECT RAISE(ABORT,'ROLE_SESSION_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS worker_contract_role_session_revocation_final
BEFORE UPDATE OF revoked_at_ms ON worker_contract_role_sessions
WHEN OLD.revoked_at_ms IS NOT NULL OR NEW.revoked_at_ms IS NULL
BEGIN SELECT RAISE(ABORT,'ROLE_SESSION_REVOCATION_FINAL'); END;
