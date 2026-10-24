// PPL-002 Day2: local Node/SQLite durable offline ledger. PayPal outbound calls DISABLED.
// Node >=22 with --experimental-sqlite. Not a Cloudflare D1 adapter, not an auth provider.
import { DatabaseSync } from 'node:sqlite';
import { createContractMilestoneStore } from './contract_milestones.mjs';
import { approvedAmount, requestKey, reconcileCapture } from './payment_contract.mjs';
import { QuoteApiError } from './quote_api.mjs';

const reject = (condition, code, http = 400) => {
  if (condition) throw new QuoteApiError(code, http);
};
const idOk = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
const dbSafeText = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
const clone = v => structuredClone(v);

// Each persistent SQLite file has a deliberately tiny pilot AI request budget.
// No actual provider transport is enabled by this ledger module.
const MAX_AI_DRAFT_ATTEMPTS_PER_LEDGER=1;
const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS quotes (' +
  'id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, merchant_id TEXT NOT NULL,' +
  'version INTEGER NOT NULL CHECK(version >= 1), currency TEXT NOT NULL CHECK(currency = \'USD\'),' +
  'status TEXT NOT NULL CHECK(status IN (\'PROPOSED\',\'APPROVED\')),' +
  'ai_suggested_minor INTEGER, scope_text TEXT, suggestion_source TEXT,' +
  'approval_actor TEXT, approval_version INTEGER,' +
  'approval_amount_minor INTEGER,' +
  'CHECK ((status = \'PROPOSED\' AND approval_actor IS NULL AND approval_version IS NULL AND approval_amount_minor IS NULL)' +
  ' OR (status = \'APPROVED\' AND approval_actor = owner_id AND approval_version = version' +
  ' AND approval_amount_minor BETWEEN 100 AND 1000000)))',
  'CREATE TABLE IF NOT EXISTS payment_attempts (' +
  'request_id TEXT PRIMARY KEY, quote_id TEXT NOT NULL REFERENCES quotes(id),' +
  'quote_version INTEGER NOT NULL, merchant_id TEXT NOT NULL,' +
  'operation TEXT NOT NULL CHECK(operation IN (\'create\',\'capture\')),' +
  'state TEXT NOT NULL CHECK(state IN (\'IN_FLIGHT\',\'UNKNOWN\',\'APPROVED\',\'PAID\')),' +
  'remote_id TEXT UNIQUE, amount_minor INTEGER NOT NULL, currency TEXT NOT NULL,' +
  'created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, observed_at TEXT,' +
  'UNIQUE (merchant_id, quote_id, quote_version, operation))',
  'CREATE INDEX IF NOT EXISTS idx_attempts_quote ON payment_attempts(quote_id, quote_version)',
  'CREATE TABLE IF NOT EXISTS ai_draft_attempts ('+
  'quote_id TEXT NOT NULL REFERENCES quotes(id),quote_version INTEGER NOT NULL,'+
  'owner_id TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN (\'RESERVED\',\'UNKNOWN\',\'COMMITTED\')),'+
  'created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,'+
  'PRIMARY KEY(quote_id,quote_version))'
];

function convertQuote(q) {
  if (!q) return null;
  const result = {
    id:q.id, ownerId:q.owner_id, merchantId:q.merchant_id,
    version:q.version, currency:q.currency, status:q.status,
    aiSuggestedMinor:q.ai_suggested_minor,
    scope:q.scope_text ?? null, suggestionSource:q.suggestion_source ?? null,
    approval:q.status === 'APPROVED' ? {
      actorId:q.approval_actor, decision:'APPROVED',
      quoteVersion:q.approval_version, amountMinor:q.approval_amount_minor,
    } : null,
  };
  return result;
}
const convertAttempt = row => row && ({
  requestId:row.request_id, quoteId:row.quote_id, quoteVersion:row.quote_version,
  merchantId:row.merchant_id, operation:row.operation, state:row.state,
  remoteId:row.remote_id, amountMinor:row.amount_minor, currency:row.currency,
  createdAt:row.created_at, observedAt:row.observed_at,
});

export function createSqliteLedger({ filename } = {}) {
  // Must explicitly select a disk file; ephemeral DB is not valid safety evidence.
  reject(!filename || typeof filename !== 'string' || filename === ':memory:' ||
    filename.startsWith('file::memory:') || filename.includes('?mode=memory'),
  'DURABLE_SQLITE_FILENAME_REQUIRED');
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA journal_mode = WAL');
  for (const sql of SCHEMA) db.exec(sql);
  // Migrate earlier day-2 SQLite files without deleting approvals or attempts.
  const columns = db.prepare('PRAGMA table_info(quotes)').all().map(c => c.name);
  if (!columns.includes('scope_text')) db.exec('ALTER TABLE quotes ADD COLUMN scope_text TEXT');
  if (!columns.includes('suggestion_source'))
    db.exec('ALTER TABLE quotes ADD COLUMN suggestion_source TEXT');
  const stmt = sql => db.prepare(sql);
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  const getRow = id => stmt('SELECT * FROM quotes WHERE id=?').get(id);
  const attemptRow = requestId => stmt('SELECT * FROM payment_attempts WHERE request_id=?').get(requestId);
  function authorized(id, actorId, merchantId) {
    const quote = convertQuote(getRow(id));
    // Quote IDs are opaque to other users/merchants; no state enumeration.
    reject(!quote || quote.ownerId !== actorId ||
      (merchantId !== undefined && quote.merchantId !== merchantId),
    'QUOTE_NOT_FOUND', 404);
    return quote;
  }
  function lockedApprovedQuote(id, actorId, merchantId) {
    const quote = authorized(id, actorId, merchantId);
    reject(quote.status !== 'APPROVED', 'HUMAN_APPROVAL_REQUIRED', 409);
    let cents;
    try { cents = approvedAmount(quote); }
    catch { throw new QuoteApiError('HUMAN_APPROVAL_REQUIRED',409); }
    return {quote,cents};
  }
  const contractStore = createContractMilestoneStore({db,transaction,lockedApprovedQuote,reject});

  // Defense in depth: the private PayPal transport verifies its GET results,
  // but the persistent ledger must reject incomplete/foreign proof independently.
  // A browser redirect or a detached capture JSON is never payment evidence.
  function verifiedGetOrderUnit({quote,cents,merchantId,order,statuses}) {
    const units=order?.purchase_units;
    const unit=Array.isArray(units)&&units.length===1?units[0]:null;
    reject(!idOk(order?.id)||order?.intent!=='CAPTURE'||
      !statuses.includes(order?.status)||!unit||
      unit.reference_id!==quote.id||
      unit.payee?.merchant_id!==merchantId||
      unit.amount?.currency_code!==quote.currency||
      unit.amount?.value!==(cents/100).toFixed(2),
    'ORDER_PROOF_MISMATCH',409);
    return unit;
  }

  const api = {
    ...contractStore,
    async get(id) { return convertQuote(getRow(id)); },
    async insertQuote({id,ownerId,merchantId,version=1,currency='USD',
      aiSuggestedMinor=null,status='PROPOSED'}={}) {
      reject(!idOk(id) || !dbSafeText(ownerId) || !dbSafeText(merchantId) ||
        !Number.isSafeInteger(version) || version < 1 || status !== 'PROPOSED',
      'INVALID_NEW_QUOTE');
      reject(currency !== 'USD', 'UNSUPPORTED_CURRENCY');
      reject(aiSuggestedMinor !== null && (!Number.isSafeInteger(aiSuggestedMinor) ||
        aiSuggestedMinor < 0), 'INVALID_AI_SUGGESTION');
      try {
        stmt('INSERT INTO quotes(id,owner_id,merchant_id,version,currency,status,ai_suggested_minor)' +
          ' VALUES(?,?,?,?,?,?,?)').run(id,ownerId,merchantId,version,currency,status,aiSuggestedMinor);
      } catch (err) {
        if (String(err.message).includes('UNIQUE constraint'))
          throw new QuoteApiError('DUPLICATE_QUOTE_ID',409);
        throw err;
      }
      return api.get(id);
    },
    async approve({ id, expectedVersion, actorId, amountMinor }) {
      reject(!Number.isSafeInteger(expectedVersion) || expectedVersion < 1,'QUOTE_VERSION_REQUIRED');
      reject(!Number.isSafeInteger(amountMinor) || amountMinor < 100 ||
        amountMinor > 1000000,'INVALID_APPROVED_AMOUNT');
      return transaction(() => {
        const row = getRow(id);
        reject(!row || row.owner_id !== actorId,'QUOTE_NOT_FOUND',404);
        reject(row.version !== expectedVersion,'STALE_QUOTE_VERSION',409);
        reject(row.status !== 'PROPOSED','QUOTE_ALREADY_APPROVED',409);
        reject(!!stmt('SELECT 1 FROM ai_draft_attempts WHERE quote_id=? AND quote_version=? AND state=\'RESERVED\'').get(id,expectedVersion),
          'AI_DRAFT_IN_FLIGHT',409);
        const res = stmt('UPDATE quotes SET status=\'APPROVED\',approval_actor=?,' +
          'approval_version=?,approval_amount_minor=? WHERE id=? AND owner_id=?' +
          ' AND version=? AND status=\'PROPOSED\'')
          .run(actorId,expectedVersion,amountMinor,id,actorId,expectedVersion);
        reject(res.changes !== 1,'APPROVAL_CONFLICT',409);
        return convertQuote(getRow(id));
      });
    },
    // Version compare-and-set; any approved snapshot is invalidated by a revised scope.
    // Never allow editing once ANY remote payment attempt has been claimed.
    async revise({ id, actorId, expectedVersion, scope, suggestedMinor,
      suggestionSource }) {
      reject(!Number.isSafeInteger(expectedVersion) || expectedVersion < 1,
        'QUOTE_VERSION_REQUIRED');
      reject(typeof scope !== 'string' || scope.length < 8 || scope.length > 500,
        'INVALID_SCOPE');
      reject(!Number.isSafeInteger(suggestedMinor) || suggestedMinor < 100 ||
        suggestedMinor > 1000000 ||
        !['OFFLINE_MOCK','GEMINI_API'].includes(suggestionSource),
      'INVALID_DRAFT');
      return transaction(() => {
        const row = getRow(id);
        reject(!row || row.owner_id !== actorId, 'QUOTE_NOT_FOUND', 404);
        reject(row.version !== expectedVersion, 'STALE_QUOTE_VERSION', 409);
        reject(row.version >= Number.MAX_SAFE_INTEGER, 'QUOTE_VERSION_EXHAUSTED', 409);
        reject(!!stmt('SELECT 1 FROM contracts WHERE quote_id=? LIMIT 1').get(id),
          'CONTRACT_EXISTS',409);
        reject(!!stmt('SELECT 1 AS found FROM payment_attempts WHERE quote_id=? LIMIT 1')
          .get(id), 'PAYMENT_ATTEMPT_EXISTS', 409);
        const ai=stmt('SELECT state FROM ai_draft_attempts WHERE quote_id=? AND quote_version=?')
          .get(id,expectedVersion);
        if(suggestionSource==='GEMINI_API')
          reject(ai?.state!=='RESERVED','AI_DRAFT_CLAIM_REQUIRED',409);
        else reject(ai?.state==='RESERVED','AI_DRAFT_IN_FLIGHT',409);
        const done = stmt('UPDATE quotes SET version=version+1, status=\'PROPOSED\',' +
          'approval_actor=NULL,approval_version=NULL,approval_amount_minor=NULL,' +
          'scope_text=?,suggestion_source=?,ai_suggested_minor=?' +
          ' WHERE id=? AND owner_id=? AND version=?')
          .run(scope, suggestionSource, suggestedMinor, id, actorId, expectedVersion);
        reject(done.changes !== 1, 'REVISION_CONFLICT', 409);
        if(suggestionSource==='GEMINI_API'){
          const commit=stmt('UPDATE ai_draft_attempts SET state=\'COMMITTED\''+
            ' WHERE quote_id=? AND quote_version=? AND owner_id=? AND state=\'RESERVED\'')
            .run(id,expectedVersion,actorId);
          reject(commit.changes!==1,'AI_DRAFT_COMMIT_CONFLICT',409);
        }
        return convertQuote(getRow(id));
      });
    },
    // Atomically reserve a single potential third-party AI call, before provider HTTP.
    // A crashed or timed-out reservation is NOT automatically retryable.
    async claimAiDraft({id,actorId,expectedVersion}={}) {
      reject(!Number.isSafeInteger(expectedVersion)||expectedVersion<1,
        'QUOTE_VERSION_REQUIRED');
      return transaction(()=>{
        const row=getRow(id);
        reject(!row || row.owner_id!==actorId,'QUOTE_NOT_FOUND',404);
        reject(row.version!==expectedVersion,'STALE_QUOTE_VERSION',409);
        reject(row.status!=='PROPOSED','AI_DRAFT_REQUIRES_PROPOSAL',409);
        reject(!!stmt('SELECT 1 FROM contracts WHERE quote_id=? LIMIT 1').get(id),
          'CONTRACT_EXISTS',409);
        reject(!!stmt('SELECT 1 FROM payment_attempts WHERE quote_id=? LIMIT 1').get(id),
          'PAYMENT_ATTEMPT_EXISTS',409);
        reject(!!stmt('SELECT 1 FROM ai_draft_attempts WHERE quote_id=? AND quote_version=?')
          .get(id,expectedVersion),'AI_DRAFT_ALREADY_CLAIMED',409);
        reject(stmt('SELECT COUNT(*) AS total FROM ai_draft_attempts').get().total
          >=MAX_AI_DRAFT_ATTEMPTS_PER_LEDGER,'AI_DRAFT_BUDGET_EXHAUSTED',429);
        stmt('INSERT INTO ai_draft_attempts(quote_id,quote_version,owner_id,state)'+
          ' VALUES(?,?,?,\'RESERVED\')').run(id,expectedVersion,actorId);
        return {status:'RESERVED',quoteId:id,quoteVersion:expectedVersion,
          maxAttemptsPerLedger:MAX_AI_DRAFT_ATTEMPTS_PER_LEDGER};
      });
    },
    async markAiDraftUnknown({id,actorId,expectedVersion}={}) {
      return transaction(()=>{
        const row=stmt('SELECT state FROM ai_draft_attempts'+
          ' WHERE quote_id=? AND quote_version=? AND owner_id=?')
          .get(id,expectedVersion,actorId);
        reject(!row,'AI_DRAFT_CLAIM_NOT_FOUND',404);
        if(row.state==='RESERVED')
          stmt('UPDATE ai_draft_attempts SET state=\'UNKNOWN\''+
            ' WHERE quote_id=? AND quote_version=? AND owner_id=? AND state=\'RESERVED\'')
            .run(id,expectedVersion,actorId);
        return {state:stmt('SELECT state FROM ai_draft_attempts'+
          ' WHERE quote_id=? AND quote_version=? AND owner_id=?')
          .get(id,expectedVersion,actorId).state};
      });
    },
    async getAiDraftAttempt({id,expectedVersion}={}) {
      const row=stmt('SELECT quote_id,quote_version,state,created_at FROM ai_draft_attempts'+
        ' WHERE quote_id=? AND quote_version=?').get(id,expectedVersion);
      return row?{quoteId:row.quote_id,quoteVersion:row.quote_version,
        state:row.state,createdAt:row.created_at}:null;
    },
    // Atomically occupies each quote/version/merchant operation once, forever.
    // A duplicate NEVER reissues provider POST; it must reconcile via PayPal GET.
    async claimOperation({quoteId,actorId,merchantId,operation}) {
      reject(!['create','capture'].includes(operation),'INVALID_ACTION');
      return transaction(() => {
        const {quote,cents} = lockedApprovedQuote(quoteId,actorId,merchantId);
        const rid=requestKey(quote,operation);
        const prior=attemptRow(rid);
        if (prior) {
          reject(prior.quote_id !== quoteId || prior.merchant_id !== merchantId ||
            prior.quote_version !== quote.version ||
            prior.amount_minor !== cents || prior.currency !== quote.currency ||
            prior.operation !== operation,
          'PAYMENT_ATTEMPT_CONFLICT',409);
          return {action:'RECONCILE_GET_FIRST',attempt:convertAttempt(prior)};
        }
        if (operation === 'capture') {
          const create=attemptRow(requestKey(quote,'create'));
          reject(!create || create.state !== 'APPROVED' || !create.remote_id,
            'REMOTE_ORDER_APPROVAL_REQUIRED',409);
        }
        stmt('INSERT INTO payment_attempts(request_id,quote_id,quote_version,merchant_id,' +
          'operation,state,amount_minor,currency) VALUES(?,?,?,?,?,\'IN_FLIGHT\',?,?)')
          .run(rid,quote.id,quote.version,merchantId,operation,cents,quote.currency);
        return {action:'FIRST_CLAIM_ONLY_NO_PROVIDER_CALL',attempt:convertAttempt(attemptRow(rid))};
      });
    },
    // Persist the remote order id immediately after a trusted, verified GET.
    // A known CREATED order is NOT paid: keep UNKNOWN and forbid another POST.
    async recordCreatedOrderFromGet({quoteId,actorId,merchantId,order}) {
      return transaction(() => {
        const {quote,cents}=lockedApprovedQuote(quoteId,actorId,merchantId);
        verifiedGetOrderUnit({quote,cents,merchantId,order,
          statuses:['CREATED','PAYER_ACTION_REQUIRED','APPROVED']});
        const rid=requestKey(quote,'create');
        const prior=attemptRow(rid);
        reject(!prior || prior.merchant_id!==merchantId ||
          prior.amount_minor!==cents, 'CREATE_ATTEMPT_REQUIRED',409);
        reject(prior.remote_id!==null && prior.remote_id!==order.id,
          'ORDER_ID_CONFLICT',409);
        // Never downgrade a previously approved order due to stale remote GET.
        const desired=prior.state==='APPROVED' || order.status==='APPROVED'
          ? 'APPROVED' : 'UNKNOWN';
        stmt('UPDATE payment_attempts SET state=?,remote_id=?,'+
          'observed_at=CURRENT_TIMESTAMP WHERE request_id=? AND state IN '+
          '(\'UNKNOWN\',\'IN_FLIGHT\',\'APPROVED\')')
          .run(desired,order.id,rid);
        return convertAttempt(attemptRow(rid));
      });
    },
    // Called only by trusted BACKEND observer after GET (never browser redirect).
    // This module has no PayPal transport and cannot independently attest the evidence.
    async recordApprovedOrderFromGet({quoteId,actorId,merchantId,order}) {
      return transaction(() => {
        const {quote,cents}=lockedApprovedQuote(quoteId,actorId,merchantId);
        verifiedGetOrderUnit({quote,cents,merchantId,order,statuses:['APPROVED']});
        const rid=requestKey(quote,'create');
        const previous=attemptRow(rid);
        reject(!previous || previous.merchant_id !== merchantId ||
          previous.amount_minor !== cents,'CREATE_ATTEMPT_REQUIRED',409);
        reject(previous.remote_id !== null && previous.remote_id !== order.id,
          'ORDER_ID_CONFLICT',409);
        stmt('UPDATE payment_attempts SET state=\'APPROVED\',remote_id=?,' +
          'observed_at=CURRENT_TIMESTAMP WHERE request_id=? AND state IN' +
          ' (\'UNKNOWN\',\'IN_FLIGHT\',\'APPROVED\')')
          .run(order.id,rid);
        return convertAttempt(attemptRow(rid));
      });
    },
    // Proof must come from server-side PayPal GET, supplied by a future trusted transport.
    async recordCaptureFromGet({quoteId,actorId,merchantId,order,capture}) {
      return transaction(() => {
        const {quote,cents}=lockedApprovedQuote(quoteId,actorId,merchantId);
        const unit=verifiedGetOrderUnit({quote,cents,merchantId,order,
          statuses:['COMPLETED']});
        const nested=unit.payments?.captures;
        const confirmed=Array.isArray(nested)&&nested.length===1?nested[0]:null;
        reject(!confirmed || !idOk(confirmed.id)||
          confirmed.id!==capture?.id||
          confirmed.status!=='COMPLETED'||
          confirmed.amount?.currency_code!==quote.currency||
          confirmed.amount?.value!==(cents/100).toFixed(2),
          'CAPTURE_PROOF_MISMATCH',409);
        const create=attemptRow(requestKey(quote,'create'));
        const rid=requestKey(quote,'capture');
        const attempt=attemptRow(rid);
        reject(!create || create.state !== 'APPROVED' ||
          !create.remote_id || create.remote_id !== order?.id ||
          create.merchant_id !== merchantId ||
          create.amount_minor !== cents || create.currency !== quote.currency ||
          !attempt || attempt.merchant_id !== merchantId ||
          attempt.amount_minor !== cents || attempt.currency !== quote.currency,
          'CAPTURE_ATTEMPT_REQUIRED',409);
        let proof;
        try { proof=reconcileCapture(quote,order,capture); }
        catch { throw new QuoteApiError('CAPTURE_PROOF_MISMATCH',409); }
        reject(proof.status !== 'PAID','CAPTURE_NOT_COMPLETED',409);
        reject(attempt.remote_id !== null && attempt.remote_id !== proof.captureId,
          'CAPTURE_ID_CONFLICT',409);
        stmt('UPDATE payment_attempts SET state=\'PAID\',remote_id=?,' +
          'observed_at=CURRENT_TIMESTAMP WHERE request_id=? AND state IN' +
          ' (\'IN_FLIGHT\',\'UNKNOWN\',\'PAID\')')
          .run(proof.captureId,rid);
        return convertAttempt(attemptRow(rid));
      });
    },
    async markUnknown(requestId) {
      return transaction(() => {
        const item=attemptRow(requestId);
        reject(!item,'ATTEMPT_NOT_FOUND',404);
        if (item.state === 'IN_FLIGHT')
          stmt('UPDATE payment_attempts SET state=\'UNKNOWN\',observed_at=CURRENT_TIMESTAMP' +
            ' WHERE request_id=? AND state=\'IN_FLIGHT\'').run(requestId);
        return convertAttempt(attemptRow(requestId));
      });
    },
    async getAttempt(requestId) { return convertAttempt(attemptRow(requestId)); },
    async listAttempts(quoteId) {
      return stmt('SELECT * FROM payment_attempts WHERE quote_id=? ORDER BY operation')
        .all(quoteId).map(convertAttempt);
    },
    // Startup crash protection: unknown outcomes MUST be resolved with remote GET.
    async recoverInterrupted() {
      return transaction(() => stmt('UPDATE payment_attempts SET state=\'UNKNOWN\',' +
        ' observed_at=CURRENT_TIMESTAMP WHERE state=\'IN_FLIGHT\'').run().changes);
    },
    close() { db.close(); },
  };
  return api;
}
