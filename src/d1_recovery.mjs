// D15 local D1-shaped recovery boundary. NOT a PayPal GET client, Worker, or public HTTP endpoint.
// Use only with a backend-owned D1 binding/session and a trusted identity resolver.
// For a replicated D1 deployment, caller must use a first-primary session for read-after-write.
export class D1RecoveryError extends Error {
  constructor(code){ super(code); this.name='D1RecoveryError'; this.code=code; }
}
const fail=(bad,code)=>{if(bad)throw new D1RecoveryError(code);};
const valid=x=>typeof x==='string' && /^[A-Za-z0-9_-]{1,128}$/.test(x);
const getAttempt=`
SELECT a.request_id,a.quote_id,a.quote_version,a.merchant_id,a.operation,
       a.state,a.remote_id,a.amount_minor,a.currency
FROM payment_attempts a
JOIN quotes q ON a.quote_id=q.id
WHERE a.request_id=? AND a.quote_id=? AND a.quote_version=?
  AND a.operation=? AND a.merchant_id=? AND q.owner_id=?
  AND q.merchant_id=a.merchant_id AND q.status='APPROVED'
  AND q.version=a.quote_version AND q.approval_version=q.version
  AND q.approval_actor=q.owner_id AND q.approval_amount_minor=a.amount_minor
  AND q.currency=a.currency`;
const ageUnknown=`
UPDATE payment_attempts SET state='UNKNOWN',observed_at=CURRENT_TIMESTAMP
WHERE request_id=? AND quote_id=? AND quote_version=? AND operation=?
 AND merchant_id=? AND state='IN_FLIGHT'
 AND created_at <= datetime('now','-5 minutes')
 AND EXISTS(
 SELECT 1 FROM quotes q WHERE q.id=payment_attempts.quote_id
 AND q.owner_id=? AND q.merchant_id=payment_attempts.merchant_id
 AND q.version=payment_attempts.quote_version
 AND q.status='APPROVED' AND q.approval_actor=q.owner_id
 AND q.approval_version=q.version
 AND q.approval_amount_minor=payment_attempts.amount_minor
 AND q.currency=payment_attempts.currency)`;
function view(row) {
  const action=row.state==='IN_FLIGHT' || row.state==='UNKNOWN'
    ? 'RECONCILE_GET_FIRST'
    : row.state==='APPROVED'
      ? 'ORDER_APPROVED_IN_LOCAL_LEDGER_ONLY'
      : 'CAPTURE_STATE_IN_LOCAL_LEDGER_ONLY';
  return Object.freeze({
    mode:'LOCAL_DB_METADATA_NOT_REMOTE_PROVIDER_PROOF',
    operation:row.operation,state:row.state,action,
    quoteId:row.quote_id,quoteVersion:row.quote_version,
    remoteIdPresent:row.remote_id!==null,
    verifiedPayPalGet:false,
    allowProviderPost:false,
  });
}

// Sessions/authz are injected FUNCTIONS owned by backend. HTTP headers, JSON,
// query args or a bare role flag cannot constitute authentication or recovery approval.
export function createD1RecoveryBoundary({db,resolveSession,authorizeRecovery}={}) {
  fail(!db||typeof db.prepare!=='function','D1_BINDING_REQUIRED');
  fail(typeof resolveSession!=='function','TRUSTED_SESSION_RESOLVER_REQUIRED');

  async function context({request,quoteId,quoteVersion,operation,requestId}={}) {
    fail(!valid(quoteId)||!valid(requestId)||
      !Number.isSafeInteger(quoteVersion)||quoteVersion<1||
      !['create','capture'].includes(operation),'INVALID_D1_RECOVERY_INPUT');
    let principal;
    try{principal=await resolveSession(request);}
    catch{throw new D1RecoveryError('UNAUTHENTICATED');}
    fail(principal?.verified!==true ||
      !valid(principal.actorId) || !valid(principal.merchantId),
    'UNAUTHENTICATED');
    return {request,quoteId,quoteVersion,operation,requestId,principal};
  }
  const args=c=>[c.requestId,c.quoteId,c.quoteVersion,c.operation,
                  c.principal.merchantId,c.principal.actorId];

  async function fetchOwned(c) {
    const row=await db.prepare(getAttempt).bind(...args(c)).first();
    fail(!row,'ATTEMPT_NOT_FOUND');
    return row;
  }
  return Object.freeze({
    async inspect(input) {
      const c=await context(input);
      return view(await fetchOwned(c)); // SELECT only. F5/GET has no side effects.
    },
    async recoverStale(input) {
      // This method must only be called by a backend recovery runner after
      // independent permission checks; never wire directly to public HTTP.
      fail(typeof authorizeRecovery!=='function','INTERNAL_RECOVERY_AUTHORIZATION_REQUIRED');
      const c=await context(input);
      let authorized=false;
      try{authorized=await authorizeRecovery({request:c.request,principal:c.principal});}
      catch{authorized=false;}
      fail(authorized!==true,'INTERNAL_RECOVERY_AUTHORIZATION_REQUIRED');
      await fetchOwned(c); // existence and tenant checks precede mutation.
      const result=await db.prepare(ageUnknown).bind(...args(c)).run();
      fail(result?.success!==true ||
           ![0,1].includes(result?.meta?.changes),'D1_RECOVERY_WRITE_UNVERIFIED');
      const row=await fetchOwned(c);
      // A concurrent approved/paid transition must never be downgraded.
      return Object.freeze({transitioned:result.meta.changes===1,...view(row)});
    }
  });
}
