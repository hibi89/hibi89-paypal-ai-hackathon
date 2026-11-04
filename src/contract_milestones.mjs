// D07: durable offline contract/milestone ledger. Not a payment transport or public API.
// A trusted caller must authenticate actorId and merchantId; no browser-supplied role is trusted.
const validId = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(x);
const validPrincipal = x => typeof x === 'string' && x.length > 0 && x.length <= 128;
const statements = [
  `CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY,
    quote_id TEXT NOT NULL UNIQUE REFERENCES quotes(id) ON DELETE RESTRICT,
    quote_version INTEGER NOT NULL CHECK(quote_version >= 1),
    owner_id TEXT NOT NULL, merchant_id TEXT NOT NULL, reviewer_id TEXT NOT NULL,
    amount_minor INTEGER NOT NULL CHECK(amount_minor BETWEEN 100 AND 1000000),
    currency TEXT NOT NULL CHECK(currency='USD'),
    state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(state='ACTIVE'),
    version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK(owner_id <> reviewer_id)
  )`,
  `CREATE TABLE IF NOT EXISTS contract_milestones (
    id TEXT PRIMARY KEY,
    contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE RESTRICT,
    step INTEGER NOT NULL CHECK(step >= 1),
    amount_minor INTEGER NOT NULL CHECK(amount_minor >= 1),
    state TEXT NOT NULL DEFAULT 'PENDING'
      CHECK(state IN ('PENDING','SUBMITTED','REJECTED','ACCEPTED')),
    delivery_note TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(contract_id,step), UNIQUE(contract_id,id)
  )`,
  `CREATE TABLE IF NOT EXISTS contract_events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE RESTRICT,
    milestone_id TEXT,
    actor_id TEXT NOT NULL, event_type TEXT NOT NULL,
    from_state TEXT, to_state TEXT NOT NULL,
    contract_version INTEGER NOT NULL CHECK(contract_version >= 1),
    detail TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(contract_id,contract_version),
    FOREIGN KEY(contract_id,milestone_id) REFERENCES contract_milestones(contract_id,id) ON DELETE RESTRICT
  )`,
  "CREATE INDEX IF NOT EXISTS idx_contract_events_order ON contract_events(contract_id,seq)",
  `CREATE TRIGGER IF NOT EXISTS contract_events_no_update
    BEFORE UPDATE ON contract_events BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_EVENT'); END`,
  `CREATE TRIGGER IF NOT EXISTS contract_events_no_delete
    BEFORE DELETE ON contract_events BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_EVENT'); END`
];
const transitionPolicy = {
  'PENDING:SUBMITTED':'owner', 'REJECTED:SUBMITTED':'owner',
  'SUBMITTED:ACCEPTED':'reviewer', 'SUBMITTED:REJECTED':'reviewer'
};

// Reuses the parent ledger's BEGIN IMMEDIATE transaction to keep quotes/payment/contract atomic.
export function createContractMilestoneStore({db,transaction,lockedApprovedQuote,reject,
  assertLocalWriteLocked=()=>{},enforceLocalMemberWrites=false,
  allowLocalOwnerDelivery=false}) {
  for (const sql of statements) db.exec(sql);
  const q = sql => db.prepare(sql);
  const contractRow = id => q('SELECT * FROM contracts WHERE id=?').get(id);
  function authorized(contractId,actorId,merchantId) {
    const c=contractRow(contractId);
    reject(!c || c.merchant_id!==merchantId ||
      (c.owner_id!==actorId && c.reviewer_id!==actorId),
    'CONTRACT_NOT_FOUND',404);
    return c;
  }
  function read(c) {
    const milestones=q('SELECT id,step,amount_minor,state,delivery_note FROM contract_milestones WHERE contract_id=? ORDER BY step')
      .all(c.id).map(m=>({
        id:m.id,step:m.step,amountMinor:m.amount_minor,state:m.state,
        deliveryNote:m.delivery_note
      }));
    // Payment outcome is OBSERVED, never used to mutate fulfillment state.
    const payment=q(`SELECT state FROM payment_attempts WHERE quote_id=? AND quote_version=?
      AND merchant_id=? AND operation='capture'`)
      .get(c.quote_id,c.quote_version,c.merchant_id);
    return {
      id:c.id,quoteId:c.quote_id,quoteVersion:c.quote_version,
      ownerId:c.owner_id,merchantId:c.merchant_id,reviewerId:c.reviewer_id,
      amountMinor:c.amount_minor,currency:c.currency,state:c.state,version:c.version,
      paymentState:payment?.state ?? 'NOT_CAPTURED', milestones
    };
  }
  return {
    async createContract({id,quoteId,actorId,merchantId,reviewerId,expectedVersion,milestones,eventId,
      expectedMembershipRevision}) {
      reject(!validId(id)||!validId(quoteId)||!validId(eventId)||
        !validPrincipal(actorId)||!validPrincipal(merchantId)||
        !validPrincipal(reviewerId)||actorId===reviewerId,
      'INVALID_CONTRACT_IDENTITY');
      reject(!Number.isSafeInteger(expectedVersion)||expectedVersion<1,
        'QUOTE_VERSION_REQUIRED');
      reject(!Array.isArray(milestones)||milestones.length<1||milestones.length>30,
        'INVALID_MILESTONES');
      const ids=new Set(); let sum=0;
      milestones.forEach((m,i)=>{
        reject(!validId(m?.id)||ids.has(m.id)||m.step!==i+1||
          !Number.isSafeInteger(m.amountMinor)||m.amountMinor<1,
        'INVALID_MILESTONE');
        ids.add(m.id); sum+=m.amountMinor;
        reject(!Number.isSafeInteger(sum),'INVALID_MILESTONE_TOTAL');
      });
      return transaction(()=>{
        const {quote,cents}=lockedApprovedQuote(quoteId,actorId,merchantId);
        assertLocalWriteLocked(actorId,merchantId,'buyer',expectedMembershipRevision);
        assertLocalWriteLocked(reviewerId,merchantId,'reviewer');
        reject(quote.version!==expectedVersion,'STALE_QUOTE_VERSION',409);
        reject(sum!==cents,'CONTRACT_AMOUNT_MISMATCH',409);
        reject(!!q('SELECT 1 FROM contracts WHERE quote_id=? OR id=?').get(quoteId,id),
          'CONTRACT_ALREADY_EXISTS',409);
        reject(!!q('SELECT 1 FROM contract_events WHERE event_id=?').get(eventId),
          'DUPLICATE_EVENT_ID',409);
        q(`INSERT INTO contracts
          (id,quote_id,quote_version,owner_id,merchant_id,reviewer_id,amount_minor,currency)
          VALUES(?,?,?,?,?,?,?,?)`)
          .run(id,quoteId,quote.version,quote.ownerId,quote.merchantId,reviewerId,cents,quote.currency);
        for(const m of milestones) q(`INSERT INTO contract_milestones
          (id,contract_id,step,amount_minor) VALUES(?,?,?,?)`)
          .run(m.id,id,m.step,m.amountMinor);
        q(`INSERT INTO contract_events
          (event_id,contract_id,actor_id,event_type,to_state,contract_version)
          VALUES(?,?,?,'CREATED','ACTIVE',1)`).run(eventId,id,actorId);
        return read(contractRow(id));
      });
    },
    async transitionMilestone({contractId,milestoneId,actorId,merchantId,
      expectedVersion,expectedState,nextState,eventId,detail=null,
      expectedMembershipRevision}) {
      reject(!validId(contractId)||!validId(milestoneId)||!validId(eventId),
        'INVALID_EVENT_ID');
      reject(!Number.isSafeInteger(expectedVersion)||expectedVersion<1,
        'CONTRACT_VERSION_REQUIRED');
      const role=transitionPolicy[`${expectedState}:${nextState}`];
      reject(!role,'INVALID_MILESTONE_TRANSITION',409);
      reject(detail!==null && (typeof detail!=='string'||detail.length>1000),
        'INVALID_EVENT_DETAIL');
      reject(nextState==='SUBMITTED' &&
        (typeof detail!=='string'||detail.trim().length<8),
        'DELIVERY_NOTE_REQUIRED');
      reject(nextState==='REJECTED' &&
        (typeof detail!=='string'||detail.trim().length<8),
        'REJECTION_REASON_REQUIRED');
      return transaction(()=>{
        const c=authorized(contractId,actorId,merchantId);
        if(role==='reviewer')assertLocalWriteLocked(actorId,merchantId,'reviewer',expectedMembershipRevision);
        else{
          reject(enforceLocalMemberWrites&&!allowLocalOwnerDelivery,
            'LOCAL_OWNER_DELIVERY_DISABLED',403);
          assertLocalWriteLocked(actorId,merchantId,'buyer',expectedMembershipRevision);
        }
        reject(c.version!==expectedVersion,'STALE_CONTRACT_VERSION',409);
        reject((role==='owner'&&actorId!==c.owner_id)||
          (role==='reviewer'&&actorId!==c.reviewer_id),
        'CONTRACT_ROLE_FORBIDDEN',403);
        const m=q('SELECT * FROM contract_milestones WHERE id=? AND contract_id=?')
          .get(milestoneId,contractId);
        reject(!m,'MILESTONE_NOT_FOUND',404);
        reject(m.state!==expectedState,'STALE_MILESTONE_STATE',409);
        reject(!!q('SELECT 1 FROM contract_events WHERE event_id=?').get(eventId),
          'DUPLICATE_EVENT_ID',409);
        const v=q('UPDATE contracts SET version=version+1 WHERE id=? AND version=?')
          .run(contractId,expectedVersion);
        reject(v.changes!==1,'CONTRACT_CAS_CONFLICT',409);
        const updated=q(`UPDATE contract_milestones SET state=?,
          delivery_note=CASE WHEN ?='SUBMITTED' THEN ? ELSE delivery_note END,
          updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND contract_id=? AND state=?`)
          .run(nextState,nextState,detail,milestoneId,contractId,expectedState);
        reject(updated.changes!==1,'MILESTONE_CAS_CONFLICT',409);
        q(`INSERT INTO contract_events
          (event_id,contract_id,milestone_id,actor_id,event_type,from_state,to_state,
          contract_version,detail) VALUES(?,?,?,?,?,?,?,?,?)`)
          .run(eventId,contractId,milestoneId,actorId,nextState,expectedState,
            nextState,expectedVersion+1,detail);
        return read(contractRow(contractId));
      });
    },
    async getContract({contractId,actorId,merchantId}) {
      return read(authorized(contractId,actorId,merchantId));
    },
    async listContractEvents({contractId,actorId,merchantId}) {
      authorized(contractId,actorId,merchantId);
      return q(`SELECT seq,event_id,contract_id,milestone_id,actor_id,event_type,
        from_state,to_state,contract_version,detail,created_at
        FROM contract_events WHERE contract_id=? ORDER BY seq`).all(contractId).map(e=>({
          seq:e.seq,eventId:e.event_id,contractId:e.contract_id,milestoneId:e.milestone_id,
          actorId:e.actor_id,eventType:e.event_type,fromState:e.from_state,toState:e.to_state,
          contractVersion:e.contract_version,detail:e.detail,createdAt:e.created_at
        }));
    }
  };
}
