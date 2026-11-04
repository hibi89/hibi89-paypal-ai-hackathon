// Server-side budget guardrail. Pure validation; cannot authorize a payment.
export function evaluatePaymentGuardrail({quote,negotiation,limitMinor,spentMinor=0,reservedMinor=0,actorApproved=false}={}){
 const valid=n=>Number.isSafeInteger(n)&&n>=0&&n<=100_000_000;
 if(!quote||!negotiation||!valid(limitMinor)||!valid(spentMinor)||!valid(reservedMinor))
  throw new TypeError('INVALID_GUARDRAIL_INPUT');
 if(quote.currency!=='USD'||negotiation.currency!=='USD')return {allowed:false,reason:'CURRENCY_MISMATCH'};
 if(quote.status!=='APPROVED'||quote.approval?.actorId!==quote.ownerId||
    quote.approval?.quoteVersion!==quote.version||!actorApproved)
  return {allowed:false,reason:'HUMAN_APPROVAL_REQUIRED'};
 if(negotiation.status!=='PROPOSED'||negotiation.paymentAuthorized!==false||
    !Number.isSafeInteger(negotiation.agreedMinor)||negotiation.agreedMinor<100)
  return {allowed:false,reason:'NEGOTIATION_INVALID'};
 if(quote.approval.amountMinor!==negotiation.agreedMinor)
  return {allowed:false,reason:'APPROVED_AMOUNT_MISMATCH'};
 const remaining=limitMinor-spentMinor-reservedMinor;
 if(remaining<negotiation.agreedMinor)return {allowed:false,reason:'BUDGET_EXCEEDED',remainingMinor:Math.max(0,remaining)};
 return {allowed:true,reason:'POLICY_ELIGIBLE_ONLY',remainingMinor:remaining-negotiation.agreedMinor,paymentAuthorized:false,requiresDurableReservation:true};
}
