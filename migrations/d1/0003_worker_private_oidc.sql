-- OFFLINE-CANDIDATE ONLY. Never apply to any owner/remote D1 without
-- separate approval, schema backup, migration rehearsal and rollback plan.
-- A private operator must preprovision the issuer + HMAC(subject) binding.
-- A public browser must NEVER insert or change these records.
CREATE TABLE IF NOT EXISTS worker_private_oidc_bindings (
 issuer TEXT NOT NULL,
 subject_hmac TEXT NOT NULL CHECK(length(subject_hmac)=64),
 actor_id TEXT NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 128),
 merchant_id TEXT NOT NULL CHECK(length(merchant_id) BETWEEN 1 AND 128),
 role TEXT NOT NULL CHECK(role='OWNER'),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
 PRIMARY KEY(issuer,subject_hmac)
);
CREATE TABLE IF NOT EXISTS worker_private_login_challenges (
 challenge_sha256 TEXT PRIMARY KEY CHECK(length(challenge_sha256)=64),
 nonce TEXT NOT NULL UNIQUE CHECK(length(nonce)=43),
 created_at_ms INTEGER NOT NULL CHECK(created_at_ms>0),
 expires_at_ms INTEGER NOT NULL CHECK(expires_at_ms>created_at_ms),
 consumed_at_ms INTEGER
);
-- One signed ID token cannot be used to create a second session by replay.
ALTER TABLE worker_private_sessions ADD COLUMN assertion_sha256 TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_worker_session_assertion
 ON worker_private_sessions(assertion_sha256)
 WHERE assertion_sha256 IS NOT NULL;
