-- OFFLINE ONLY; backup + restore rehearsal required before remote D1 application.
-- 0002/0003 sessions cannot be safely backfilled from salted subject hashes:
-- unbound existing cookies fail closed and require fresh private OIDC login.
ALTER TABLE worker_private_oidc_bindings ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0);
ALTER TABLE worker_private_sessions ADD COLUMN binding_subject_hmac TEXT CHECK(binding_subject_hmac IS NULL OR length(binding_subject_hmac)=64);
ALTER TABLE worker_private_sessions ADD COLUMN binding_revision INTEGER CHECK(binding_revision IS NULL OR binding_revision > 0);
CREATE INDEX IF NOT EXISTS idx_worker_private_session_binding ON worker_private_sessions(issuer,binding_subject_hmac,binding_revision);
-- Deactivate, reactivate, reassignment or issuer identity changes increment
-- the generation. A previously issued cookie cannot regain access.
CREATE TRIGGER IF NOT EXISTS worker_private_binding_revision_on_change
AFTER UPDATE OF active,actor_id,merchant_id,role,issuer,subject_hmac ON worker_private_oidc_bindings
BEGIN
 UPDATE worker_private_oidc_bindings SET revision = OLD.revision + 1
 WHERE issuer = NEW.issuer AND subject_hmac = NEW.subject_hmac;
END;
CREATE TRIGGER IF NOT EXISTS worker_private_binding_monotonic_revision
BEFORE UPDATE OF revision ON worker_private_oidc_bindings
WHEN NEW.revision != OLD.revision + 1
BEGIN SELECT RAISE(ABORT,'OIDC_BINDING_REVISION_NOT_MONOTONIC'); END;
CREATE TRIGGER IF NOT EXISTS worker_private_binding_no_delete
BEFORE DELETE ON worker_private_oidc_bindings
BEGIN SELECT RAISE(ABORT,'OIDC_BINDING_MUST_BE_REVOKED'); END;
CREATE TRIGGER IF NOT EXISTS worker_private_binding_no_replace
BEFORE INSERT ON worker_private_oidc_bindings
WHEN EXISTS(SELECT 1 FROM worker_private_oidc_bindings
 WHERE issuer=NEW.issuer AND subject_hmac=NEW.subject_hmac)
BEGIN SELECT RAISE(ABORT,'OIDC_BINDING_REPLACE_FORBIDDEN'); END;
