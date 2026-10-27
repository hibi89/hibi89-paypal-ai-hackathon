// D13 synthetic quote / contract / subscription consistency gate.
// No money, identities, production readiness or PayPal state are inferred here.
export function evaluateLocalIntegration({quote,contract,subscription}={}){
  const approved=quote?.status==='APPROVED' &&
    quote.approval?.actorId===quote.ownerId &&
    quote.approval?.quoteVersion===quote.version &&
    Number.isSafeInteger(quote.approval?.amountMinor);
  const linked=!!(approved&&contract&&contract.quoteId===quote.id&&
    contract.quoteVersion===quote.version&&contract.ownerId===quote.ownerId&&
    contract.merchantId===quote.merchantId&&
    contract.currency===quote.currency&&
    contract.amountMinor===quote.approval.amountMinor);
  const milestones=Array.isArray(contract?.milestones)?contract.milestones:[];
  const amountTotal=milestones.reduce((sum,m)=>sum+(Number.isSafeInteger(m.amountMinor)?m.amountMinor:0),0);
  const amountConsistent=linked&&milestones.length>0&&amountTotal===contract.amountMinor;
  const delivered=amountConsistent&&milestones.every(m=>m.state==='ACCEPTED');
  const subState=subscription?.state??'UNAVAILABLE';
  const subValid=subscription?.mode==='OFFLINE_SCENARIO_NO_PROVIDER' &&
    subscription?.paymentEvidence==='NOT_VERIFIED';
  const status=approved&&delivered&&subValid&&subState==='ACTIVE'
    ? 'LOCAL_DEMO_CANDIDATE' : 'LOCAL_DEMO_INCOMPLETE';
  return Object.freeze({
    status,mode:'SYNTHETIC_LOOPBACK_ONLY',
    quote:approved?'HUMAN_APPROVED':'HUMAN_APPROVAL_REQUIRED',
    contract:contract ? (amountConsistent?(delivered?'DELIVERY_ACCEPTED':'FULFILLMENT_PENDING'):
      'CONTRACT_QUOTE_MISMATCH') : 'NO_CONTRACT',
    subscription:subValid?subState:'NOT_VERIFIED_SCENARIO',
    dataContract:contract?(amountConsistent?'CONSISTENT':'MISMATCH'):'NOT_CREATED',
    contractPayment:contract?.paymentState??'NOT_CAPTURED',
    subscriptionPayment:'NOT_VERIFIED',
    realPayPal:'NOT_TESTED',
    realAI:'NOT_TESTED',
    realWebhook:'NOT_TESTED',
    productionAuth:'NOT_CONFIGURED',
    publicDeployment:'NOT_TESTED',
    reviewRequired:!delivered,
    // Never include actor identity, tokens, server paths or raw credentials.
  });
}
