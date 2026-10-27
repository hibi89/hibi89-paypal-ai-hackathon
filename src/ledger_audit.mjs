// Local SOVIA-style tamper-evident audit chain (not a signature or external proof).
// SQLite triggers append metadata in the SAME transaction as ledger mutations.
// No PII, scope, prompt, amount, token, merchant key or PayPal payload is logged.
// A privileged DB operator can replace/truncate/recompute the chain; a separate
// signed witness/anchoring service is necessary for external audit assurance.
import {createHash} from 'node:crypto';
export const AUDIT_GENESIS='0'.repeat(64);
const HASH=/^[0-9a-f]{64}$/;
const MAX_VERIFY_EVENTS=10000;
export function localAuditHash(...fields) {
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
}
const auditTrigger=(name,table,action,kind,id,version,actor,merchant,state,source)=>{
  const prev="COALESCE((SELECT event_hash FROM local_audit_events ORDER BY seq DESC LIMIT 1),'"+AUDIT_GENESIS+"')";
  return "CREATE TRIGGER IF NOT EXISTS "+name+" AFTER "+action+" ON "+table+
    " BEGIN INSERT INTO local_audit_events "+
    "(prev_hash,event_hash,event_time,event_kind,quote_id,quote_version,actor_id,merchant_id,state,source) "+
    "SELECT x.prev_hash,audit_hash(x.prev_hash,'"+kind+"',"+id+","+version+","+
    actor+","+merchant+","+state+","+source+",x.event_time),x.event_time,'"+kind+"',"+
    id+","+version+","+actor+","+merchant+","+state+","+source+
    " FROM (SELECT "+prev+" AS prev_hash,strftime('%Y-%m-%dT%H:%M:%fZ','now') AS event_time) AS x; END";
};
export function installLocalAudit(db){
  if(!db||typeof db.exec!=='function'||typeof db.function!=='function')
    throw new TypeError('SQLITE_AUDIT_DB_REQUIRED');
  db.function('audit_hash',{deterministic:true},(...parts)=>localAuditHash(...parts));
  db.exec("CREATE TABLE IF NOT EXISTS local_audit_events ("+
    "seq INTEGER PRIMARY KEY AUTOINCREMENT,"+
    "prev_hash TEXT NOT NULL,event_hash TEXT NOT NULL UNIQUE,event_time TEXT NOT NULL,"+
    "event_kind TEXT NOT NULL,quote_id TEXT NOT NULL,quote_version INTEGER NOT NULL,"+
    "actor_id TEXT NOT NULL,merchant_id TEXT NOT NULL,state TEXT NOT NULL,source TEXT NOT NULL)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_local_audit_tenant ON "+
    "local_audit_events(actor_id,merchant_id,seq)");
  db.exec("CREATE TRIGGER IF NOT EXISTS local_audit_deny_update "+
    "BEFORE UPDATE ON local_audit_events BEGIN "+
    "SELECT RAISE(ABORT,'LOCAL_AUDIT_IMMUTABLE'); END");
  db.exec("CREATE TRIGGER IF NOT EXISTS local_audit_deny_delete "+
    "BEFORE DELETE ON local_audit_events BEGIN "+
    "SELECT RAISE(ABORT,'LOCAL_AUDIT_IMMUTABLE'); END");
  const owner=id=>"(SELECT owner_id FROM quotes WHERE id="+id+")";
  const merchant=id=>"(SELECT merchant_id FROM quotes WHERE id="+id+")";
  const triggers=[
    auditTrigger('local_audit_quote_created','quotes','INSERT','QUOTE_CREATED',
      'NEW.id','NEW.version','NEW.owner_id','NEW.merchant_id','NEW.status',"'LEDGER_LOCAL'"),
    auditTrigger('local_audit_quote_updated','quotes','UPDATE','QUOTE_CHANGED',
      'NEW.id','NEW.version','NEW.owner_id','NEW.merchant_id',
      "NEW.status", "COALESCE(NEW.suggestion_source,'HUMAN_OR_LOCAL')"),
    auditTrigger('local_audit_payment_claimed','payment_attempts','INSERT','PAYMENT_CLAIMED',
      'NEW.quote_id','NEW.quote_version',owner('NEW.quote_id'),'NEW.merchant_id',
      'NEW.state',"'LOCAL_CLAIM_NO_PROVIDER_PROOF'"),
    auditTrigger('local_audit_payment_updated','payment_attempts','UPDATE','PAYMENT_STATE_CHANGED',
      'NEW.quote_id','NEW.quote_version',owner('NEW.quote_id'),'NEW.merchant_id',
      'NEW.state',"'LEDGER_OBSERVATION_NOT_EXTERNAL_ATTESTATION'"),
    auditTrigger('local_audit_ai_claimed','ai_draft_attempts','INSERT','AI_DRAFT_CLAIMED',
      'NEW.quote_id','NEW.quote_version','NEW.owner_id',merchant('NEW.quote_id'),
      'NEW.state',"'LOCAL_ATTEMPT_RESERVATION'"),
    auditTrigger('local_audit_ai_updated','ai_draft_attempts','UPDATE','AI_DRAFT_CHANGED',
      'NEW.quote_id','NEW.quote_version','NEW.owner_id',merchant('NEW.quote_id'),
      'NEW.state',"'LEDGER_LOCAL'"),
  ];
  for(const sql of triggers)db.exec(sql);
}
export function verifyLocalAudit(db,{actorId,merchantId}={}){
  if(!db||typeof db.prepare!=='function')throw new TypeError('SQLITE_AUDIT_DB_REQUIRED');
  const counts=db.prepare("SELECT COUNT(*) AS total FROM local_audit_events").get();
  const total=counts?.total;
  const ownerScope=typeof actorId==='string' && actorId.length>0 &&
    typeof merchantId==='string' && merchantId.length>0;
  const ownerEvents=ownerScope ? db.prepare(
    "SELECT COUNT(*) AS total FROM local_audit_events WHERE actor_id=? AND merchant_id=?"
  ).get(actorId,merchantId).total : null;
  if(!Number.isSafeInteger(total)||total<0||total>MAX_VERIFY_EVENTS)
    return {integrity:'NEEDS_REVIEW',reason:'VERIFY_LIMIT_OR_COUNT_INVALID',
      ownerEvents,kind:'LOCAL_HASH_CHAIN_NOT_SIGNED',verifiedEvents:0};
  const rows=db.prepare("SELECT seq,prev_hash,event_hash,event_time,event_kind,"+
    "quote_id,quote_version,actor_id,merchant_id,state,source FROM local_audit_events ORDER BY seq").all();
  let prev=AUDIT_GENESIS,seq=0;
  for(const row of rows){
    const expected=localAuditHash(prev,row.event_kind,row.quote_id,row.quote_version,
      row.actor_id,row.merchant_id,row.state,row.source,row.event_time);
    if(!Number.isSafeInteger(row.seq)||row.seq<=seq||
       !HASH.test(row.prev_hash)||!HASH.test(row.event_hash)||
       row.prev_hash!==prev||row.event_hash!==expected)
      return {integrity:'NEEDS_REVIEW',reason:'HASH_CHAIN_MISMATCH',
        ownerEvents,kind:'LOCAL_HASH_CHAIN_NOT_SIGNED',verifiedEvents:seq};
    seq=row.seq; prev=row.event_hash;
  }
  return {integrity:'PASS',reason:total?'LOCAL_CHAIN_RECOMPUTED':'NO_NEW_EVENTS',
    ownerEvents,kind:'LOCAL_HASH_CHAIN_NOT_SIGNED',verifiedEvents:total};
}
