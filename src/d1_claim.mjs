// D15 offline prototype: D1-shaped atomic claim only, NO HTTP, OAuth or PayPal call.
export class D1ClaimError extends Error {
  constructor(code){super(code);this.code=code;this.name='D1ClaimError'}
}
const fail=(when,code)=>{if(when)throw new D1ClaimError(code)};
const valid=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(s);
const insert=`
INSERT INTO payment_attempts
(request_id,quote_id,quote_version,merchant_id,operation,state,amount_minor,currency)
SELECT ?,q.id,q.version,q.merchant_id,?,'IN_FLIGHT',q.approval_amount_minor,q.currency
FROM quotes q WHERE q.id=? AND q.owner_id=? AND q.merchant_id=? AND q.version=?
AND q.status='APPROVED' AND q.approval_actor=q.owner_id
AND q.approval_version=q.version AND q.currency='USD'
AND q.approval_amount_minor BETWEEN 100 AND 1000000
AND (?='create' OR EXISTS (
 SELECT 1 FROM payment_attempts prior WHERE prior.quote_id=q.id
 AND prior.merchant_id=q.merchant_id AND prior.quote_version=q.version
 AND prior.operation='create' AND prior.state='APPROVED' AND prior.remote_id IS NOT NULL
 AND prior.amount_minor=q.approval_amount_minor AND prior.currency=q.currency))
ON CONFLICT DO NOTHING`;
const read=`
SELECT a.request_id,a.quote_id,a.quote_version,a.merchant_id,a.operation,
a.state,a.remote_id,a.amount_minor,a.currency
FROM payment_attempts a JOIN quotes q ON a.quote_id=q.id
WHERE a.request_id=? AND a.quote_id=? AND a.quote_version=? AND a.merchant_id=?
AND a.operation=? AND q.owner_id=? AND q.merchant_id=a.merchant_id
AND q.version=a.quote_version AND q.status='APPROVED'
AND q.approval_actor=q.owner_id AND q.approval_version=q.version
AND q.approval_amount_minor=a.amount_minor AND q.currency=a.currency`;
// actorId/merchantId must originate from a verified SERVER session, NEVER client payload.
export async function claimD1OperationOnce({db,quoteId,actorId,merchantId,quoteVersion,
operation,requestId}={}) {
 fail(!db||typeof db.prepare!=='function','D1_BINDING_REQUIRED');
 fail(!valid(quoteId)||!valid(actorId)||!valid(merchantId)||!valid(requestId)||
 !Number.isSafeInteger(quoteVersion)||quoteVersion<1||
 !['create','capture'].includes(operation),'INVALID_D1_CLAIM');
 const result=await db.prepare(insert)
 .bind(requestId,operation,quoteId,actorId,merchantId,quoteVersion,operation).run();
 fail(result?.success!==true||![0,1].includes(result?.meta?.changes),
 'D1_CLAIM_RESULT_UNVERIFIED');
 const current=await db.prepare(read)
 .bind(requestId,quoteId,quoteVersion,merchantId,operation,actorId).first();
 fail(!current,'D1_CLAIM_PRECONDITION_OR_CONFLICT');
 if(result.meta.changes===1) {
 fail(current.state!=='IN_FLIGHT','D1_CLAIM_STATE_CONFLICT');
 return {action:'FIRST_CLAIM_ONLY_NO_PROVIDER_CALL',attempt:current};
 }
 return {action:'RECONCILE_GET_FIRST',attempt:current};
}
