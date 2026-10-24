// D15 private Sandbox GET -> D1-shaped CAS. OFFLINE verification only.
// Never treat a browser redirect/JSON field as PayPal proof; never performs POST.
// Integration MUST inject the backend's own authenticated SANDBOX_ONLY transport.
export class D1GetReconcileError extends Error {
  constructor(code){ super(code); this.name='D1GetReconcileError'; this.code=code; }
}
const fail=(bad,code)=>{if(bad)throw new D1GetReconcileError(code)};
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const orderId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(x);
const approvedQuote=`
SELECT id,owner_id,merchant_id,version,currency,status,approval_actor,
 approval_version,approval_amount_minor FROM quotes
WHERE id=? AND owner_id=? AND merchant_id=? AND version=?
 AND status='APPROVED' AND approval_actor=owner_id AND approval_version=version
 AND currency='USD' AND approval_amount_minor BETWEEN 100 AND 1000000`;
const attemptSQL=`
SELECT request_id,quote_id,quote_version,merchant_id,operation,state,remote_id,
 amount_minor,currency FROM payment_attempts
WHERE quote_id=? AND quote_version=? AND merchant_id=? AND operation=?`;
const approveSQL=`
UPDATE payment_attempts SET state='APPROVED',observed_at=CURRENT_TIMESTAMP
WHERE request_id=? AND quote_id=? AND quote_version=? AND merchant_id=?
 AND operation='create' AND state IN ('IN_FLIGHT','UNKNOWN','APPROVED')
 AND remote_id=? AND amount_minor=? AND currency='USD'
 AND EXISTS(SELECT 1 FROM quotes q WHERE q.id=payment_attempts.quote_id
 AND q.owner_id=? AND q.merchant_id=payment_attempts.merchant_id
 AND q.version=payment_attempts.quote_version AND q.status='APPROVED'
 AND q.approval_actor=q.owner_id AND q.approval_version=q.version
 AND q.approval_amount_minor=payment_attempts.amount_minor)`;
const paidSQL=`
UPDATE payment_attempts SET state='PAID',remote_id=?,observed_at=CURRENT_TIMESTAMP
WHERE request_id=? AND quote_id=? AND quote_version=? AND merchant_id=?
 AND operation='capture' AND state IN ('IN_FLIGHT','UNKNOWN','PAID')
 AND (remote_id IS NULL OR remote_id=?) AND amount_minor=? AND currency='USD'
 AND EXISTS(SELECT 1 FROM payment_attempts created WHERE created.quote_id=payment_attempts.quote_id
 AND created.quote_version=payment_attempts.quote_version
 AND created.merchant_id=payment_attempts.merchant_id AND created.operation='create'
 AND created.state='APPROVED' AND created.remote_id=? AND created.amount_minor=payment_attempts.amount_minor)
 AND EXISTS(SELECT 1 FROM quotes q WHERE q.id=payment_attempts.quote_id
 AND q.owner_id=? AND q.merchant_id=payment_attempts.merchant_id
 AND q.version=payment_attempts.quote_version AND q.status='APPROVED'
 AND q.approval_actor=q.owner_id AND q.approval_version=q.version
 AND q.approval_amount_minor=payment_attempts.amount_minor)`;
const amount=q=>(q.approval_amount_minor/100).toFixed(2);
function checkOrder(q,expectedRemote,order) {
  const u=order?.purchase_units;
  const unit=Array.isArray(u)&&u.length===1?u[0]:null;
  fail(!orderId(expectedRemote)||order?.id!==expectedRemote||
    order.intent!=='CAPTURE'||
    !['CREATED','APPROVED','COMPLETED'].includes(order.status)||
    !unit||unit.reference_id!==q.id||
    unit.payee?.merchant_id!==q.merchant_id||
    unit.amount?.currency_code!=='USD'||
    unit.amount?.value!==amount(q),'ORDER_GET_PROOF_MISMATCH');
  return unit;
}
function checkCapture(q,orderIdExpected,proof) {
  const unit=checkOrder(q,orderIdExpected,proof?.order);
  const captures=unit.payments?.captures;
  const c=proof?.capture;
  fail(proof.order.status!=='COMPLETED'||
    !Array.isArray(captures)||captures.length!==1||
    !orderId(c?.id)||c.orderId!==orderIdExpected||
    c.status!=='COMPLETED'||c.amount?.currency_code!=='USD'||
    c.amount?.value!==amount(q)||
    captures[0]?.id!==c.id||captures[0]?.status!==c.status||
    captures[0]?.amount?.currency_code!=='USD'||
    captures[0]?.amount?.value!==amount(q),'CAPTURE_GET_PROOF_MISMATCH');
  return c.id;
}
export function createD1SandboxGetReconciler({db,resolveSession,transport}={}) {
  fail(!db||typeof db.prepare!=='function','D1_BINDING_REQUIRED');
  fail(typeof resolveSession!=='function','TRUSTED_SESSION_RESOLVER_REQUIRED');
  fail(transport?.mode!=='SANDBOX_ONLY'||
    typeof transport.getOrder!=='function'||
    typeof transport.getCaptureProof!=='function',
    'PRIVATE_SANDBOX_GET_TRANSPORT_REQUIRED');
  async function context({request,quoteId,quoteVersion}={}) {
    fail(!id(quoteId)||!Number.isSafeInteger(quoteVersion)||quoteVersion<1,
      'INVALID_RECONCILIATION_INPUT');
    let session;
    try{session=await resolveSession(request);}
    catch{throw new D1GetReconcileError('UNAUTHENTICATED');}
    fail(session?.verified!==true||!id(session.actorId)||!id(session.merchantId),
      'UNAUTHENTICATED');
    const q=await db.prepare(approvedQuote)
      .bind(quoteId,session.actorId,session.merchantId,quoteVersion).first();
    fail(!q,'QUOTE_NOT_FOUND');
    const quote=Object.freeze({
      id:q.id,ownerId:q.owner_id,merchantId:q.merchant_id,
      version:q.version,currency:q.currency,
      approval:{decision:'APPROVED',actorId:q.approval_actor,
        quoteVersion:q.approval_version,amountMinor:q.approval_amount_minor}
    });
    const attempt=async operation=>db.prepare(attemptSQL)
      .bind(q.id,q.version,q.merchant_id,operation).first();
    return {q,quote,attempt};
  }
  const run=async(sql,params)=>{
    const result=await db.prepare(sql).bind(...params).run();
    fail(result?.success!==true||![0,1].includes(result.meta?.changes),
      'D1_UPDATE_RESULT_UNVERIFIED');
    fail(result.meta.changes!==1,'D1_CAS_CONFLICT');
  };
  const response=(code,state)=>Object.freeze({
    status:code,ledgerState:state,realProviderAccessTested:false,
    paymentPostAttempted:false,provenance:'BACKEND_INJECTED_GET_TRANSPORT_NOT_NETWORK_ATTESTED'
  });
  return Object.freeze({
    async refreshOrder(input){
      const c=await context(input);
      const create=await c.attempt('create');
      fail(!create,'CREATE_ATTEMPT_REQUIRED');
      if(!orderId(create.remote_id))
        return response('REMOTE_ORDER_ID_UNKNOWN_NO_RETRY',create.state);
      let data;
      try{data=await transport.getOrder(c.quote,create.remote_id);}
      catch{throw new D1GetReconcileError('SANDBOX_GET_FAILED');}
      checkOrder(c.q,create.remote_id,data);
      if(data.status==='CREATED')
        return response('BUYER_APPROVAL_PENDING_NO_POST',create.state);
      if(data.status==='COMPLETED')
        return response('CAPTURE_RECONCILIATION_REQUIRED',create.state);
      await run(approveSQL,[create.request_id,c.q.id,c.q.version,c.q.merchant_id,
        create.remote_id,c.q.approval_amount_minor,c.q.owner_id]);
      const updated=await c.attempt('create');
      fail(updated?.state!=='APPROVED'||updated.remote_id!==create.remote_id,
        'D1_POST_UPDATE_UNVERIFIED');
      return response('ORDER_APPROVED_BY_GET_CONTRACT',updated.state);
    },
    async reconcileCapture(input){
      const c=await context(input);
      const create=await c.attempt('create');
      const capture=await c.attempt('capture');
      fail(!create||!capture,'CAPTURE_CLAIMS_REQUIRED');
      fail(create.state!=='APPROVED'||!orderId(create.remote_id),
        'ORDER_APPROVAL_REQUIRED');
      fail(capture.state==='PAID','PAID_ALREADY_RECORDED_NO_REPEAT');
      let proof;
      try{proof=await transport.getCaptureProof(c.quote,create.remote_id);}
      catch{throw new D1GetReconcileError('SANDBOX_GET_FAILED');}
      if(proof?.order?.status!=='COMPLETED') {
        checkOrder(c.q,create.remote_id,proof?.order);
        return response('CAPTURE_NOT_COMPLETED_NO_RETRY',capture.state);
      }
      const captureId=checkCapture(c.q,create.remote_id,proof);
      fail(capture.remote_id!==null&&capture.remote_id!==captureId,
        'CAPTURE_REMOTE_ID_CONFLICT');
      await run(paidSQL,[captureId,capture.request_id,c.q.id,c.q.version,
        c.q.merchant_id,captureId,c.q.approval_amount_minor,create.remote_id,
        c.q.owner_id]);
      const updated=await c.attempt('capture');
      fail(updated?.state!=='PAID'||updated.remote_id!==captureId,
        'D1_POST_UPDATE_UNVERIFIED');
      return response('CAPTURE_COMPLETED_BY_GET_CONTRACT',updated.state);
    }
  });
}
