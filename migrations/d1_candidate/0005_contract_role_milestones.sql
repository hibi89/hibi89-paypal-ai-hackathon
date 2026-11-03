-- Future candidate ONLY. Never in default migrations/d1 or remote D1 runner.
-- Operator must separately review backups, Free plan and role provisioning.
-- Existing 0001-0004 migration files and owner data remain unchanged.
CREATE TABLE IF NOT EXISTS worker_contract_memberships (
 actor_id TEXT NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 128),
 merchant_id TEXT NOT NULL CHECK(length(merchant_id) BETWEEN 1 AND 128),
 role TEXT NOT NULL CHECK(role IN ('BUYER','SELLER','REVIEWER')),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
 PRIMARY KEY(actor_id,merchant_id)
);
CREATE TABLE IF NOT EXISTS worker_contracts (
 id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 128),
 quote_id TEXT NOT NULL UNIQUE REFERENCES quotes(id) ON DELETE RESTRICT,
 merchant_id TEXT NOT NULL, buyer_id TEXT NOT NULL,
 seller_id TEXT NOT NULL, reviewer_id TEXT NOT NULL,
 milestone_id TEXT NOT NULL CHECK(length(milestone_id) BETWEEN 1 AND 64),
 milestone_title TEXT NOT NULL CHECK(length(milestone_title) BETWEEN 12 AND 160),
 amount_minor INTEGER NOT NULL CHECK(amount_minor BETWEEN 100 AND 1000000),
 currency TEXT NOT NULL CHECK(currency='USD'),
 state TEXT NOT NULL CHECK(state IN ('PENDING','SUBMITTED','REJECTED','ACCEPTED')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
 last_event_id TEXT NOT NULL UNIQUE CHECK(length(last_event_id) BETWEEN 1 AND 128),
 last_action TEXT NOT NULL CHECK(last_action IN ('CREATE','SUBMIT','ACCEPT','REJECT')),
 last_actor_id TEXT NOT NULL,
 last_detail TEXT NOT NULL DEFAULT '' CHECK(length(last_detail)<=500),
 created_at_ms INTEGER NOT NULL CHECK(created_at_ms>0),
 CHECK (buyer_id<>seller_id AND buyer_id<>reviewer_id AND seller_id<>reviewer_id),
 CHECK ((version=1 AND state='PENDING' AND last_action='CREATE') OR
        (version>1 AND last_action<>'CREATE'))
);
CREATE INDEX IF NOT EXISTS idx_worker_contracts_buyer ON worker_contracts(merchant_id,buyer_id,id);
CREATE INDEX IF NOT EXISTS idx_worker_contracts_seller ON worker_contracts(merchant_id,seller_id,id);
CREATE INDEX IF NOT EXISTS idx_worker_contracts_reviewer ON worker_contracts(merchant_id,reviewer_id,id);
CREATE TABLE IF NOT EXISTS worker_contract_events (
 event_id TEXT PRIMARY KEY,
 contract_id TEXT NOT NULL REFERENCES worker_contracts(id) ON DELETE RESTRICT,
 version INTEGER NOT NULL CHECK(version>=1),
 state TEXT NOT NULL CHECK(state IN ('PENDING','SUBMITTED','REJECTED','ACCEPTED')),
 action TEXT NOT NULL CHECK(action IN ('CREATE','SUBMIT','ACCEPT','REJECT')),
 actor_id TEXT NOT NULL,detail TEXT NOT NULL,
 occurred_at_ms INTEGER NOT NULL CHECK(occurred_at_ms>0),
 UNIQUE(contract_id,version)
);
CREATE TRIGGER IF NOT EXISTS worker_contract_insert_event AFTER INSERT ON worker_contracts
BEGIN
 INSERT INTO worker_contract_events(event_id,contract_id,version,state,action,actor_id,detail,occurred_at_ms)
 VALUES(NEW.last_event_id,NEW.id,NEW.version,NEW.state,NEW.last_action,NEW.last_actor_id,
        NEW.last_detail,NEW.created_at_ms);
END;
CREATE TRIGGER IF NOT EXISTS worker_contract_transition_event AFTER UPDATE OF state ON worker_contracts
BEGIN
 INSERT INTO worker_contract_events(event_id,contract_id,version,state,action,actor_id,detail,occurred_at_ms)
 VALUES(NEW.last_event_id,NEW.id,NEW.version,NEW.state,NEW.last_action,NEW.last_actor_id,
        NEW.last_detail,CAST(strftime('%s','now') AS INTEGER)*1000);
END;
CREATE TRIGGER IF NOT EXISTS worker_contract_fixed_assignment BEFORE UPDATE OF
 quote_id,merchant_id,buyer_id,seller_id,reviewer_id,milestone_id,milestone_title,
 amount_minor,currency,created_at_ms ON worker_contracts
BEGIN SELECT RAISE(ABORT,'CONTRACT_ASSIGNMENT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS worker_contract_no_delete BEFORE DELETE ON worker_contracts
BEGIN SELECT RAISE(ABORT,'CONTRACT_DELETION_FORBIDDEN'); END;
CREATE TRIGGER IF NOT EXISTS worker_contract_event_no_update BEFORE UPDATE ON worker_contract_events
BEGIN SELECT RAISE(ABORT,'CONTRACT_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS worker_contract_event_no_delete BEFORE DELETE ON worker_contract_events
BEGIN SELECT RAISE(ABORT,'CONTRACT_AUDIT_IMMUTABLE'); END;
