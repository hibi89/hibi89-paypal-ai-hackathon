// Read-only, local persisted-payment projection. Never a PayPal status API.
// Do not serialize request IDs, remote order/capture IDs or provider secrets.
const STATES=new Set(['IN_FLIGHT','UNKNOWN','APPROVED','PAID']);
const OPERATIONS=new Set(['create','capture']);
const invalid=()=>{const e=new Error('LOCAL_PAYMENT_LEDGER_INVALID');e.code='LOCAL_PAYMENT_LEDGER_INVALID';throw e;};

export function projectLocalPaymentStatus({quote,attempts}={}){
 if(!quote||typeof quote!=='object'||typeof quote.id!=='string'||
    typeof quote.ownerId!=='string'||typeof quote.merchantId!=='string'||
    !Number.isSafeInteger(quote.version)||quote.version<1||
    quote.currency!=='USD'||!['PROPOSED','APPROVED'].includes(quote.status)||
    !Array.isArray(attempts)||attempts.length>2)invalid();
 const approved=quote.status==='APPROVED';
 const amount=approved?quote.approval?.amountMinor:null;
 if(approved&&(!Number.isSafeInteger(amount)||amount<100||amount>1000000||
    quote.approval?.actorId!==quote.ownerId||
    quote.approval?.quoteVersion!==quote.version))invalid();
 if(!approved&&attempts.length>0)invalid();
 const seen=new Map();
 for(const item of attempts){
  if(!item||!OPERATIONS.has(item.operation)||!STATES.has(item.state)||
     seen.has(item.operation)||item.quoteId!==quote.id||
     item.quoteVersion!==quote.version||item.merchantId!==quote.merchantId||
     item.currency!=='USD'||item.amountMinor!==amount)invalid();
  if(item.operation==='create'&&item.state==='PAID')invalid();
  if(item.operation==='capture'&&item.state==='APPROVED')invalid();
  seen.set(item.operation,item.state);
 }
 const created=seen.get('create')??null;
 const captured=seen.get('capture')??null;
 if(captured!==null&&created!=='APPROVED')invalid();
 let paymentState;
 if(!approved)paymentState='QUOTE_NOT_APPROVED';
 else if(captured==='PAID')paymentState='LOCAL_CAPTURE_PAID_RECORD_NOT_LIVE_RECHECKED';
 else if(captured!==null)paymentState='CAPTURE_UNRESOLVED_NEEDS_PROVIDER_GET';
 else if(created==='APPROVED')paymentState='ORDER_APPROVAL_RECORDED_NOT_LIVE_RECHECKED';
 else if(created!==null)paymentState='ORDER_UNRESOLVED_NEEDS_PROVIDER_GET';
 else paymentState='NO_PAYMENT_ATTEMPT';
 return Object.freeze({
  source:'LOCAL_SQLITE_ONLY_NO_PROVIDER_REQUEST',
  paymentState,quoteVersion:quote.version,currency:'USD',
  humanApprovedAmountMinor:approved?amount:null,
  createAttemptState:created,captureAttemptState:captured,
  attemptedOperations:seen.size,
  localCaptureRecorded:captured==='PAID',
  providerGetPerformedThisRead:false,
  livePaymentVerifiedThisRead:false,
  paymentAuthorizedByRead:false,providerCalls:0,
  createOrCaptureEnabled:false,autoRetryAllowed:false,
  requiresSeparateProviderEvidence:seen.size>0
 });
}
