// PPL-002 Day2: local Node/SQLite durable offline ledger. PayPal outbound calls DISABLED.
// Node >=22 with --experimental-sqlite. Not a Cloudflare D1 adapter, not an auth provider.
import { DatabaseSync } from 'node:sqlite';
import {createHash} from 'node:crypto';
import { createContractMilestoneStore } from './contract_milestones.mjs';
import { approvedAmount, requestKey, reconcileCapture } from './payment_contract.mjs';
import { QuoteApiError } from './quote_api.mjs';
import { installLocalAudit } from './ledger_audit.mjs';

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
  'rejection_actor TEXT,rejection_version INTEGER,rejection_reason TEXT,' +
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
    rejection:q.rejection_reason == null ? null : {
      actorId:q.rejection_actor, decision:'REJECTED',
      quoteVersion:q.rejection_version, reason:q.rejection_reason,
    },
  };
  return result;
}
const convertAttempt = row => row && ({
  requestId:row.request_id, quoteId:row.quote_id, quoteVersion:row.quote_version,
  merchantId:row.merchant_id, operation:row.operation, state:row.state,
  remoteId:row.remote_id, amountMinor:row.amount_minor, currency:row.currency,
  createdAt:row.created_at, observedAt:row.observed_at,
});

export function createSqliteLedger({filename,
  enforceLocalMemberWrites=false, allowLocalOwnerDelivery=false} = {}) {
  if(typeof enforceLocalMemberWrites!=='boolean'||
     typeof allowLocalOwnerDelivery!=='boolean')
    throw new TypeError('INVALID_LOCAL_WRITE_POLICY');
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
  if (!columns.includes('rejection_actor')) db.exec('ALTER TABLE quotes ADD COLUMN rejection_actor TEXT');
  if (!columns.includes('rejection_version')) db.exec('ALTER TABLE quotes ADD COLUMN rejection_version INTEGER');
  if (!columns.includes('rejection_reason')) db.exec('ALTER TABLE quotes ADD COLUMN rejection_reason TEXT');
  // Triggers write inside each existing SQLite transaction, including preexisting
  // code paths; legacy rows are intentionally NOT backfilled as audit evidence.
  installLocalAudit(db);
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
  // Re-read the trusted *persisted* membership only while the database write
  // lock is held. The API precheck alone cannot guarantee this across awaits.
  // Disabled by default to preserve legacy standalone ledger and owner-pilot flows.
  function assertLocalWriteLocked(actorId,merchantId,role){
    if(!enforceLocalMemberWrites)return;
    const row=stmt(`SELECT merchant_id,role,active FROM marketplace_actor_memberships
      WHERE actor_id=?`).get(actorId);
    reject(!row||row.active!==1||row.merchant_id!==merchantId||row.role!==role,
      'LOCAL_WRITE_ROLE_REVOKED',403);
  }
  const contractStore = createContractMilestoneStore({db,transaction,
    lockedApprovedQuote,reject,assertLocalWriteLocked,
    enforceLocalMemberWrites,allowLocalOwnerDelivery});
  // P0: Store candidate binding in the SAME file and BEGIN IMMEDIATE domain
  // as the quote/approval/contract. Historical unselected quotes remain valid.
  db.exec(`CREATE TABLE IF NOT EXISTS quote_candidate_bindings (
    quote_id TEXT PRIMARY KEY REFERENCES quotes(id) ON DELETE RESTRICT,
    owner_id TEXT NOT NULL, merchant_id TEXT NOT NULL,
    quote_version INTEGER NOT NULL CHECK(quote_version>=1),
    recommendation_id TEXT NOT NULL, set_round INTEGER NOT NULL CHECK(set_round BETWEEN 1 AND 3),
    profile_id TEXT NOT NULL, skills_json TEXT NOT NULL,
    scope_digest TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS contract_candidate_evidence (
    contract_id TEXT PRIMARY KEY REFERENCES contracts(id) ON DELETE RESTRICT,
    quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE RESTRICT,
    quote_version INTEGER NOT NULL, owner_id TEXT NOT NULL, merchant_id TEXT NOT NULL,
    recommendation_id TEXT NOT NULL, set_round INTEGER NOT NULL,
    profile_id TEXT NOT NULL, skills_json TEXT NOT NULL,
    scope_digest TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  // Runs inside the existing contract INSERT transaction; rollback of any
  // contract insert also rolls back this candidate evidence snapshot.
  db.exec(`CREATE TRIGGER IF NOT EXISTS trg_contract_candidate_snapshot
    AFTER INSERT ON contracts BEGIN
      INSERT INTO contract_candidate_evidence
        (contract_id,quote_id,quote_version,owner_id,merchant_id,recommendation_id,
         set_round,profile_id,skills_json,scope_digest)
      SELECT NEW.id,b.quote_id,b.quote_version,b.owner_id,b.merchant_id,
             b.recommendation_id,b.set_round,b.profile_id,b.skills_json,b.scope_digest
      FROM quote_candidate_bindings b
      WHERE b.quote_id=NEW.quote_id AND b.quote_version=NEW.quote_version
        AND b.owner_id=NEW.owner_id AND b.merchant_id=NEW.merchant_id;
    END`);
  for(const event of ['UPDATE','DELETE'])db.exec(
    `CREATE TRIGGER IF NOT EXISTS trg_candidate_evidence_no_${event.toLowerCase()}
     BEFORE ${event} ON contract_candidate_evidence
     BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CANDIDATE_EVIDENCE'); END`);
  // Durable, local-only preprovisioned membership and contract assignment.
  // Membership is not a browser registration, provider account or entitlement.
  db.exec(`CREATE TABLE IF NOT EXISTS marketplace_actor_memberships (
    actor_id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('buyer','seller','reviewer','merchant_operator')),
    seller_profile_id TEXT,
    active INTEGER NOT NULL CHECK(active IN (0,1)),
    revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
    CHECK((role='seller' AND seller_profile_id IS NOT NULL) OR
          (role<>'seller' AND seller_profile_id IS NULL))
  )`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_local_seller_profile_tenant
     ON marketplace_actor_memberships(merchant_id,seller_profile_id)`);
  db.exec(`CREATE TABLE IF NOT EXISTS marketplace_contract_sellers (
    contract_id TEXT PRIMARY KEY REFERENCES contracts(id) ON DELETE RESTRICT,
    merchant_id TEXT NOT NULL, seller_profile_id TEXT NOT NULL
  )`);
  const memberRow=actorId=>stmt('SELECT * FROM marketplace_actor_memberships WHERE actor_id=?').get(actorId);
  const candidateRow = id => stmt('SELECT * FROM quote_candidate_bindings WHERE quote_id=?').get(id);
  const digest = scope => createHash('sha256').update(scope).digest('hex');
  function lockedCandidateGuard(quote){
    const row=candidateRow(quote.id);
    if(!row)return; // Keep established non-marketplace quote API intact.
    reject(row.owner_id!==quote.ownerId||row.merchant_id!==quote.merchantId||
      row.quote_version!==quote.version,'QUOTE_SELECTION_STALE',409);
    reject(typeof quote.scope!=='string'||row.scope_digest!==digest(quote.scope),
      'QUOTE_SCOPE_CANDIDATE_MISMATCH',409);
  }
  const candidatePublic=(row,quote)=>row?{
    quoteId:row.quote_id,quoteVersion:row.quote_version,
    sessionId:row.recommendation_id,round:row.set_round,
    profileId:row.profile_id,requiredSkills:JSON.parse(row.skills_json),
    status:quote.version===row.quote_version &&
      typeof quote.scope==='string'&&digest(quote.scope)===row.scope_digest
      ?'BOUND':'STALE_QUOTE_VERSION',
    approvalAuthorized:false,paymentAuthorized:false
  }:null;

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
    // Trusted-host-only operations. NEVER expose provisioning or membership
    // writes to a public HTTP route without an independent administrator gate.
    async provisionLocalMember({actorId,merchantId,role,sellerProfileId=null}={}){
      reject(!idOk(actorId)||!idOk(merchantId)||
        !['buyer','seller','reviewer','merchant_operator'].includes(role)||
        (role==='seller'?!idOk(sellerProfileId):sellerProfileId!==null),
        'INVALID_LOCAL_MEMBER');
      return transaction(()=>{
        const current=memberRow(actorId);
        if(current){
          reject(current.merchant_id!==merchantId||current.role!==role||
            current.seller_profile_id!==sellerProfileId,
            'LOCAL_MEMBERSHIP_CONFLICT',409);
          return {created:false,actorId}; // never silently reactivate revoked actors
        }
        stmt(`INSERT INTO marketplace_actor_memberships
          (actor_id,merchant_id,role,seller_profile_id,active) VALUES(?,?,?,?,1)`)
          .run(actorId,merchantId,role,sellerProfileId);
        return {created:true,actorId};
      });
    },
    async setLocalMemberActive({actorId,expectedRevision,active}={}){
      reject(!idOk(actorId)||!Number.isSafeInteger(expectedRevision)||
        expectedRevision<1||typeof active!=='boolean','INVALID_MEMBER_REVISION');
      return transaction(()=>{
        const done=stmt(`UPDATE marketplace_actor_memberships
          SET active=?,revision=revision+1 WHERE actor_id=? AND revision=?`)
          .run(Number(active),actorId,expectedRevision);
        reject(done.changes!==1,'STALE_OR_UNKNOWN_MEMBERSHIP',409);
        return {actorId,active,revision:expectedRevision+1};
      });
    },
    async getLocalMember(actorId){
      if(!idOk(actorId))return null;
      const row=memberRow(actorId);
      if(!row)return null;
      return {actorId:row.actor_id,merchantId:row.merchant_id,role:row.role,
        ...(row.role==='seller'?{sellerProfileId:row.seller_profile_id}:{}),
        active:row.active===1,revision:row.revision};
    },
    async assignLocalContractSeller({contractId,merchantId,sellerProfileId}={}){
      reject(!idOk(contractId)||!idOk(merchantId)||!idOk(sellerProfileId),
        'INVALID_CONTRACT_SELLER_ASSIGNMENT');
      return transaction(()=>{
        const c=stmt('SELECT merchant_id FROM contracts WHERE id=?').get(contractId);
        reject(!c||c.merchant_id!==merchantId,'CONTRACT_NOT_FOUND',404);
        const prior=stmt('SELECT * FROM marketplace_contract_sellers WHERE contract_id=?')
          .get(contractId);
        if(prior){
          reject(prior.merchant_id!==merchantId||
            prior.seller_profile_id!==sellerProfileId,
            'CONTRACT_SELLER_ALREADY_ASSIGNED',409);
        }else{
          // A seller role membership must exist in this merchant tenant.
          reject(!stmt(`SELECT 1 FROM marketplace_actor_memberships
             WHERE merchant_id=? AND role='seller' AND seller_profile_id=?
               AND active=1 LIMIT 1`).get(merchantId,sellerProfileId),
             'ACTIVE_SELLER_MEMBERSHIP_REQUIRED',409);
          stmt(`INSERT INTO marketplace_contract_sellers
             (contract_id,merchant_id,seller_profile_id) VALUES(?,?,?)`)
             .run(contractId,merchantId,sellerProfileId);
        }
        return {contractId,merchantId,sellerProfileId};
      });
    },
    // Opt-in synthetic marketplace delivery workflow. Role/assignment, grant
    // and CAS state are ALL checked under the same BEGIN IMMEDIATE SQLite lock.
    // This does not grant access to PayPal or change legacy owner-delivery APIs.
    async transitionMarketplaceMilestone({contractId,milestoneId,actorId,merchantId,
      expectedVersion,expectedState,nextState,eventId,detail=null}={}){
      reject(!idOk(contractId)||!idOk(milestoneId)||!idOk(actorId)||
        !idOk(merchantId)||!idOk(eventId),
        'INVALID_MARKETPLACE_WORKFLOW_ID');
      reject(!Number.isSafeInteger(expectedVersion)||expectedVersion<1,
        'CONTRACT_VERSION_REQUIRED');
      const submit=nextState==='SUBMITTED'&&
        ['PENDING','REJECTED'].includes(expectedState);
      const review=expectedState==='SUBMITTED'&&
        ['ACCEPTED','REJECTED'].includes(nextState);
      reject(!submit&&!review,'INVALID_MILESTONE_TRANSITION',409);
      reject(detail!==null&&(typeof detail!=='string'||detail.length>1000),
        'INVALID_EVENT_DETAIL');
      reject((submit||nextState==='REJECTED')&&
        (typeof detail!=='string'||detail.trim().length<8),
        submit?'DELIVERY_NOTE_REQUIRED':'REJECTION_REASON_REQUIRED');
      return transaction(()=>{
        const context=stmt(`SELECT c.id,c.merchant_id,c.reviewer_id,c.owner_id,c.version,
          c.state,c.quote_id,m.role,m.merchant_id AS actor_tenant,
          m.seller_profile_id,m.active,
          s.seller_profile_id AS assigned_profile
          FROM contracts c
          LEFT JOIN marketplace_actor_memberships m ON m.actor_id=?
          LEFT JOIN marketplace_contract_sellers s ON s.contract_id=c.id
          WHERE c.id=?`).get(actorId,contractId);
        reject(!context||context.merchant_id!==merchantId||
          context.actor_tenant!==merchantId||context.active!==1,
          'MARKETPLACE_CONTRACT_NOT_FOUND',404);
        reject(context.state!=='ACTIVE','CONTRACT_NOT_ACTIVE',409);
        const assignedSeller=context.role==='seller'&&submit&&
          context.seller_profile_id!==null&&
          context.seller_profile_id===context.assigned_profile;
        const assignedReviewer=context.role==='reviewer'&&review&&
          context.reviewer_id===actorId;
        reject(!assignedSeller&&!assignedReviewer,'MARKETPLACE_WORKFLOW_ROLE_FORBIDDEN',403);
        reject(context.version!==expectedVersion,'STALE_CONTRACT_VERSION',409);
        const milestone=stmt(`SELECT state FROM contract_milestones
          WHERE id=? AND contract_id=?`).get(milestoneId,contractId);
        reject(!milestone,'MILESTONE_NOT_FOUND',404);
        reject(milestone.state!==expectedState,'STALE_MILESTONE_STATE',409);
        reject(!!stmt('SELECT 1 FROM contract_events WHERE event_id=?').get(eventId),
          'DUPLICATE_EVENT_ID',409);
        const changed=stmt(`UPDATE contracts SET version=version+1
          WHERE id=? AND version=?`).run(contractId,expectedVersion);
        reject(changed.changes!==1,'CONTRACT_CAS_CONFLICT',409);
        const updated=stmt(`UPDATE contract_milestones
          SET state=?,delivery_note=CASE WHEN ?='SUBMITTED' THEN ? ELSE delivery_note END,
          updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND contract_id=? AND state=?`)
          .run(nextState,nextState,detail,milestoneId,contractId,expectedState);
        reject(updated.changes!==1,'MILESTONE_CAS_CONFLICT',409);
        stmt(`INSERT INTO contract_events
          (event_id,contract_id,milestone_id,actor_id,event_type,from_state,to_state,
          contract_version,detail) VALUES(?,?,?,?,?,?,?,?,?)`)
          .run(eventId,contractId,milestoneId,actorId,nextState,expectedState,
            nextState,expectedVersion+1,detail);
        return Object.freeze({contractId,milestoneId,version:expectedVersion+1,
          fromState:expectedState,state:nextState,eventId,actorId,
          paymentAuthorized:false,paymentState:'NOT_AUTHORIZED_BY_WORKFLOW'});
      });
    },
    // Resource metadata for server-side policy; no client-supplied owner/tenant.
    async getQuoteAuthorityResource(quoteId){
      if(!idOk(quoteId))return null;
      const q=getRow(quoteId);
      return q?{quoteId:q.id,ownerId:q.owner_id,merchantId:q.merchant_id}:null;
    },
    async getContractAuthorityResource(contractId){
      if(!idOk(contractId))return null;
      const c=stmt(`SELECT c.id,c.quote_id,c.owner_id,c.merchant_id,
        c.reviewer_id,c.state,s.seller_profile_id
        FROM contracts c LEFT JOIN marketplace_contract_sellers s
          ON s.contract_id=c.id AND s.merchant_id=c.merchant_id
        WHERE c.id=?`).get(contractId);
      if(!c)return null;
      return {contractId:c.id,quoteId:c.quote_id,ownerId:c.owner_id,
        merchantId:c.merchant_id,reviewerId:c.reviewer_id,
        sellerProfileId:c.seller_profile_id,contractState:c.state};
    },
    async getMarketplaceCandidate({quoteId,ownerId,merchantId}={}){
      if(!idOk(quoteId)||!dbSafeText(ownerId)||!dbSafeText(merchantId))return null;
      const quote=convertQuote(getRow(quoteId));
      if(!quote||quote.ownerId!==ownerId||quote.merchantId!==merchantId)return null;
      return candidatePublic(candidateRow(quoteId),quote);
    },
    async bindMarketplaceCandidate({quoteId,ownerId,merchantId,expectedQuoteVersion,
      sessionId,round,profileId,requiredSkills,scopeDigest}={}){
      reject(!idOk(quoteId)||!dbSafeText(ownerId)||!dbSafeText(merchantId)||
        typeof sessionId!=='string'||!/^[a-f0-9]{32}$/.test(sessionId)||
        !idOk(profileId)||!/^synthetic-[a-z]+$/.test(profileId)||
        !Number.isSafeInteger(expectedQuoteVersion)||expectedQuoteVersion<1||
        !Number.isInteger(round)||round<1||round>3||
        !Array.isArray(requiredSkills)||requiredSkills.length>6||
        !requiredSkills.every(s=>typeof s==='string'&&/^[a-z]{2,32}$/.test(s))||
        typeof scopeDigest!=='string'||!/^[a-f0-9]{64}$/.test(scopeDigest),
        'INVALID_CANDIDATE_BINDING');
      transaction(()=>{
        const quote=authorized(quoteId,ownerId,merchantId);
        assertLocalWriteLocked(ownerId,quote.merchantId,'buyer');
        reject(quote.status!=='PROPOSED'||quote.version!==expectedQuoteVersion,
          'STALE_OR_APPROVED_QUOTE',409);
        reject(typeof quote.scope!=='string'||digest(quote.scope)!==scopeDigest,
          'QUOTE_SCOPE_CANDIDATE_MISMATCH',409);
        reject(!!stmt('SELECT 1 FROM contracts WHERE quote_id=?').get(quoteId),
          'CONTRACT_EXISTS',409);
        reject(!!stmt('SELECT 1 FROM payment_attempts WHERE quote_id=?').get(quoteId),
          'PAYMENT_ATTEMPT_EXISTS',409);
        const prior=candidateRow(quoteId),skills=JSON.stringify(requiredSkills);
        if(prior){
          reject(prior.owner_id!==ownerId||prior.merchant_id!==merchantId,
            'QUOTE_SELECTION_CONFLICT',409);
          if(prior.quote_version===expectedQuoteVersion){
            reject(prior.recommendation_id!==sessionId||prior.set_round!==round||
              prior.profile_id!==profileId||prior.skills_json!==skills||
              prior.scope_digest!==scopeDigest,'QUOTE_SELECTION_ALREADY_BOUND',409);
          }else{
            reject(prior.quote_version>expectedQuoteVersion,'QUOTE_SELECTION_ALREADY_BOUND',409);
            stmt(`UPDATE quote_candidate_bindings SET quote_version=?,recommendation_id=?,
               set_round=?,profile_id=?,skills_json=?,scope_digest=?,created_at=CURRENT_TIMESTAMP
               WHERE quote_id=? AND owner_id=? AND merchant_id=?`)
              .run(expectedQuoteVersion,sessionId,round,profileId,skills,scopeDigest,
                quoteId,ownerId,merchantId);
          }
        }else{
          stmt(`INSERT INTO quote_candidate_bindings
             (quote_id,owner_id,merchant_id,quote_version,recommendation_id,set_round,
              profile_id,skills_json,scope_digest) VALUES(?,?,?,?,?,?,?,?,?)`)
            .run(quoteId,ownerId,merchantId,expectedQuoteVersion,sessionId,
              round,profileId,skills,scopeDigest);
        }
      });
      return api.getMarketplaceCandidate({quoteId,ownerId,merchantId});
    },
    async assertMarketplaceCandidate({quoteId,ownerId,merchantId,expectedQuoteVersion}={}){
      const quote=authorized(quoteId,ownerId,merchantId);
      reject(quote.version!==expectedQuoteVersion,'STALE_QUOTE_VERSION',409);
      lockedCandidateGuard(quote);
    },
    async getContractCandidate({contractId,actorId,merchantId}={}){
      await contractStore.getContract({contractId,actorId,merchantId});
      const row=stmt('SELECT * FROM contract_candidate_evidence WHERE contract_id=?').get(contractId);
      return row?{
        contractId,quoteId:row.quote_id,quoteVersion:row.quote_version,
        profileId:row.profile_id,sessionId:row.recommendation_id,round:row.set_round,
        requiredSkills:JSON.parse(row.skills_json),source:'LOCAL_SYNTHETIC_SNAPSHOT',
        approvalAuthorized:false,paymentAuthorized:false
      }:null;
    },
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
        assertLocalWriteLocked(actorId,row.merchant_id,'buyer');
        reject(row.version !== expectedVersion,'STALE_QUOTE_VERSION',409);
        reject(row.status !== 'PROPOSED','QUOTE_ALREADY_APPROVED',409);
        lockedCandidateGuard(convertQuote(row));
        reject(row.rejection_reason!=null,'QUOTE_REJECTED',409);
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
    async reject({id,expectedVersion,actorId,reason}) {
      reject(!Number.isSafeInteger(expectedVersion)||expectedVersion<1,'QUOTE_VERSION_REQUIRED');
      reject(typeof reason!=='string'||reason.trim().length<3||reason.trim().length>500,
        'INVALID_REJECTION_REASON');
      return transaction(()=>{
        const row=getRow(id);
        reject(!row||row.owner_id!==actorId,'QUOTE_NOT_FOUND',404);
        assertLocalWriteLocked(actorId,row.merchant_id,'buyer');
        reject(row.version!==expectedVersion,'STALE_QUOTE_VERSION',409);
        reject(row.status!=='PROPOSED'||row.rejection_reason!=null,'QUOTE_NOT_REJECTABLE',409);
        reject(!!stmt('SELECT 1 FROM ai_draft_attempts WHERE quote_id=? AND quote_version=? AND state=\'RESERVED\'').get(id,expectedVersion),
          'AI_DRAFT_IN_FLIGHT',409);
        const res=stmt('UPDATE quotes SET rejection_actor=?,rejection_version=?,rejection_reason=?'+
          ' WHERE id=? AND owner_id=? AND version=? AND status=\'PROPOSED\' AND rejection_reason IS NULL')
          .run(actorId,expectedVersion,reason.trim(),id,actorId,expectedVersion);
        reject(res.changes!==1,'REJECTION_CONFLICT',409);
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
        assertLocalWriteLocked(actorId,row.merchant_id,'buyer');
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
          'rejection_actor=NULL,rejection_version=NULL,rejection_reason=NULL,' +
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
        assertLocalWriteLocked(actorId,row.merchant_id,'buyer');
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
        assertLocalWriteLocked(actorId,quote.merchantId,'buyer');
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

