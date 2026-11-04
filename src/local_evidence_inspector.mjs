// Local, synthetic, read-only evidence for contest demonstration.
// NOT DBVORA standalone; NOT a signed SOVIA event log; NOT PayPal provider evidence.
import { DatabaseSync } from 'node:sqlite';
import { verifyLocalAudit } from './ledger_audit.mjs';

const safeIdentity = value => typeof value === 'string' &&
  value.length > 0 && value.length <= 128;
const asCount = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const safeRow = (db,sql,...args) => db.prepare(sql).get(...args);
const closeSilently = db => { try { db?.close(); } catch { /* Never mask earlier errors. */ } };

export function inspectLocalEvidence({filename,actorId,merchantId}={}) {
  if(typeof filename!=='string' || !filename || filename===':memory:' ||
      !safeIdentity(actorId) || !safeIdentity(merchantId))
    throw new TypeError('EVIDENCE_READONLY_SCOPE_REQUIRED');
  // The path MUST be supplied by the trusted loopback server, never from HTTP input.
  const db=new DatabaseSync(filename,{readOnly:true});
  try {
    db.exec('PRAGMA query_only = ON');
    db.exec('PRAGMA busy_timeout = 1000');
    const integrity=db.prepare('PRAGMA quick_check').get();
    const integrityOk=Object.values(integrity ?? {}).every(v=>v==='ok');
    const audit=verifyLocalAudit(db,{actorId,merchantId});
    const known=['quotes','payment_attempts','ai_draft_attempts'];
    const tableNames=db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('quotes','payment_attempts','ai_draft_attempts') ORDER BY name"
    ).all().map(row=>row.name);
    const tables=known.map(name=>({name,present:tableNames.includes(name)}));
    const quotes=safeRow(db,
      "SELECT COUNT(*) AS total,"+
      " COALESCE(SUM(CASE WHEN status='APPROVED' THEN 1 ELSE 0 END),0) AS approved"+
      " FROM quotes WHERE owner_id=? AND merchant_id=?",
      actorId,merchantId);
    const attempts=safeRow(db,
      "SELECT COUNT(*) AS total,"+
      " COALESCE(SUM(CASE WHEN p.operation='create' THEN 1 ELSE 0 END),0) AS create_claims,"+
      " COALESCE(SUM(CASE WHEN p.operation='capture' THEN 1 ELSE 0 END),0) AS capture_claims,"+
      " COALESCE(SUM(CASE WHEN p.state='UNKNOWN' OR p.state='IN_FLIGHT' THEN 1 ELSE 0 END),0) AS unresolved,"+
      " COALESCE(SUM(CASE WHEN p.state='PAID' THEN 1 ELSE 0 END),0) AS local_paid_records"+
      " FROM payment_attempts p JOIN quotes q ON q.id=p.quote_id"+
      " WHERE q.owner_id=? AND q.merchant_id=? AND p.merchant_id=?",
      actorId,merchantId,merchantId);
    const drafts=safeRow(db,
      "SELECT COUNT(*) AS total,"+
      " COALESCE(SUM(CASE WHEN a.state='UNKNOWN' OR a.state='RESERVED' THEN 1 ELSE 0 END),0) AS unresolved"+
      " FROM ai_draft_attempts a JOIN quotes q ON q.id=a.quote_id"+
      " WHERE q.owner_id=? AND q.merchant_id=? AND a.owner_id=?",
      actorId,merchantId,actorId);
    const total=asCount(quotes.total),approved=asCount(quotes.approved);
    const unknown=asCount(attempts.unresolved),aiUnknown=asCount(drafts.unresolved);
    const checks=[
      {rule:'DB_QUICK_CHECK',status:integrityOk?'PASS':'NEEDS_REVIEW',basis:'SQLITE_QUICK_CHECK'},
      {rule:'LOCAL_AUDIT_HASH_CHAIN',status:audit.integrity,
        basis:'UNSIGNED_LEDGER_METADATA_NOT_EXTERNAL_ATTESTATION'},
      {rule:'PAYMENT_OUTCOME_UNRESOLVED',status:unknown?'NEEDS_REVIEW':'CLEAR',
        count:unknown,basis:'PERSISTED_LOCAL_CLAIMS'},
      {rule:'AI_DRAFT_OUTCOME_UNRESOLVED',status:aiUnknown?'NEEDS_REVIEW':'CLEAR',
        count:aiUnknown,basis:'PERSISTED_LOCAL_ATTEMPTS'},
      {rule:'PAYPAL_PROVIDER_NOT_CONNECTED',status:'NOT_TESTED',
        basis:'OFFLINE_SERVER_HAS_NO_PAYPAL_TRANSPORT'},
    ];
    return {
      mode:'OFFLINE_SYNTHETIC',source:'READONLY_LOCAL_SQLITE',
      observedAt:new Date().toISOString(), // Snapshot timestamp, NOT event time.
      dbvoraInspired:{
        scope:'OWNER_BOUND_LOCAL_DEMO',storage:'NODE_SQLITE_LOCAL_FILE',
        integrity:integrityOk?'PASS':'NEEDS_REVIEW',
        tables,readOnly:true,backupsVerified:false,
        note:'Read-only SQLite inspection only; no independent DBVORA runtime or backup/restore.',
      },
      soviaStyle:{
        audit,
        type:'LOCAL_SQLITE_HASH_CHAIN_WITH_CURRENT_STATE_PROJECTION',
        checks,source:'PERSISTED_LEDGER_COUNTS',
        note:'SHA256 metadata chain for new SQLite mutations only; not signed, separately anchored, legacy backfilled, or independently integrated SOVIA.',
      },
      businessIntelligence:{
        population:'SYNTHETIC_DEMO_ONLY',
        quotes:{total,approved,proposed:Math.max(0,total-approved)},
        humanApprovalRate:{
          numerator:approved,denominator:total,
          percentage:total>0?Number((100*approved/total).toFixed(1)):null,
        },
        paymentAttempts:{
          total:asCount(attempts.total),
          createClaims:asCount(attempts.create_claims),
          captureClaims:asCount(attempts.capture_claims),
          unresolved:unknown,
          localPaidRecords:asCount(attempts.local_paid_records),
        },
        aiDraftAttempts:{total:asCount(drafts.total),unresolved:aiUnknown},
        providerTransactionsMeasured:false,
        marketDemandMeasured:false,
        note:'Counts are real queries over synthetic local rows, NOT observed PayPal customers, revenue or market demand.',
      },
    };
  } finally {
    closeSilently(db);
  }
}
