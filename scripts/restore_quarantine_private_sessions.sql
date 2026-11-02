-- OFFLINE restore runbook gate; execute only AFTER a separately approved
-- full D1 restore and ordered 0001..0004 migration, before any auth ingress.
-- Old backups may predate a real revocation: quarantine BOTH mapping and cookie.
-- A trusted operator must re-provision/reconcile identities using fresh proof.
UPDATE worker_private_oidc_bindings SET active=0 WHERE active=1;
UPDATE worker_private_sessions SET revoked_at_ms=
 COALESCE(revoked_at_ms,CAST(strftime('%s','now') AS INTEGER)*1000);
