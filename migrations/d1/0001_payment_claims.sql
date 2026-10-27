-- D15 candidate schema; offline SQLite tested only. Never applied to remote D1.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS quotes (
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,merchant_id TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version>=1),currency TEXT NOT NULL CHECK(currency='USD'),
 status TEXT NOT NULL CHECK(status IN ('PROPOSED','APPROVED')),
 ai_suggested_minor INTEGER,scope_text TEXT,suggestion_source TEXT,
 approval_actor TEXT,approval_version INTEGER,approval_amount_minor INTEGER,
 CHECK ((status='PROPOSED' AND approval_actor IS NULL AND approval_version IS NULL AND approval_amount_minor IS NULL)
 OR (status='APPROVED' AND approval_actor=owner_id AND approval_version=version
 AND approval_amount_minor BETWEEN 100 AND 1000000))
);
CREATE TABLE IF NOT EXISTS payment_attempts (
 request_id TEXT PRIMARY KEY,
 quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE RESTRICT,
 quote_version INTEGER NOT NULL CHECK(quote_version>=1),
 merchant_id TEXT NOT NULL,operation TEXT NOT NULL CHECK(operation IN ('create','capture')),
 state TEXT NOT NULL CHECK(state IN ('IN_FLIGHT','UNKNOWN','APPROVED','PAID')),
 remote_id TEXT UNIQUE,
 amount_minor INTEGER NOT NULL CHECK(amount_minor BETWEEN 100 AND 1000000),
 currency TEXT NOT NULL CHECK(currency='USD'),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,observed_at TEXT,
 UNIQUE (merchant_id,quote_id,quote_version,operation)
);
CREATE INDEX IF NOT EXISTS idx_attempts_quote ON payment_attempts(quote_id,quote_version);
CREATE TRIGGER IF NOT EXISTS protect_claimed_quote_update BEFORE UPDATE ON quotes
WHEN EXISTS(SELECT 1 FROM payment_attempts a WHERE a.quote_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'CLAIMED_QUOTE_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS protect_claimed_quote_delete BEFORE DELETE ON quotes
WHEN EXISTS(SELECT 1 FROM payment_attempts a WHERE a.quote_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'CLAIMED_QUOTE_IMMUTABLE'); END;
