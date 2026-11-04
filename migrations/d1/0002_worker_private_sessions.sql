-- OFFLINE-ONLY schema candidate. Never migrate an owner or remote D1 database
-- without a separately approved backup, migration and rollback rehearsal.
-- Only a trusted external identity callback may provision a row; no public
-- signup/session-issuance route is implemented in this repository.
CREATE TABLE IF NOT EXISTS worker_private_sessions (
 token_sha256 TEXT PRIMARY KEY CHECK(length(token_sha256)=64),
 actor_id TEXT NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 128),
 merchant_id TEXT NOT NULL CHECK(length(merchant_id) BETWEEN 1 AND 128),
 role TEXT NOT NULL CHECK(role='OWNER'),
 issuer TEXT NOT NULL CHECK(length(issuer) BETWEEN 1 AND 200),
 issuer_verified_at_ms INTEGER NOT NULL CHECK(issuer_verified_at_ms>0),
 expires_at_ms INTEGER NOT NULL CHECK(expires_at_ms>issuer_verified_at_ms),
 revoked_at_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_worker_sessions_expiry ON worker_private_sessions(expires_at_ms);
