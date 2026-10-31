// Fictional subscription-retention recommendation, NOT a PayPal plan amendment.
// Inputs are demo-only policy assertions, not verified customer churn telemetry.
const riskLimits=Object.freeze({LOW:0,MEDIUM:1000,HIGH:2000});
const safe=x=>Number.isSafeInteger(x);
const invalid=()=>{const e=new Error('INVALID_SYNTHETIC_CHURN');e.code='INVALID_SYNTHETIC_CHURN';throw e;};
export function buildSyntheticChurnProposal(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).sort().join(',')!==[
     'subscriptionRef','currentMinor','remainingMonths','churnRisk',
     'maxDiscountBps','pauseAllowed'
    ].sort().join(','))invalid();
 const {subscriptionRef,currentMinor,remainingMonths,churnRisk,
  maxDiscountBps,pauseAllowed}=input;
 if(typeof subscriptionRef!=='string'||!/^demo-sub-[a-z0-9-]{3,30}$/.test(subscriptionRef)||
   !safe(currentMinor)||currentMinor<100||currentMinor>1_000_000||
   !safe(remainingMonths)||remainingMonths<1||remainingMonths>24||
   !Object.hasOwn(riskLimits,churnRisk)||
   !safe(maxDiscountBps)||maxDiscountBps<0||maxDiscountBps>3000||
   typeof pauseAllowed!=='boolean')invalid();
 const targetDiscountBps=riskLimits[churnRisk];
 const discountBps=Math.min(targetDiscountBps,maxDiscountBps);
 const monthlyDiscountMinor=Math.floor(currentMinor*discountBps/10000);
 const proposedMinor=currentMinor-monthlyDiscountMinor;
 const baselineTermMinor=currentMinor*remainingMonths;
 const proposedTermMinor=proposedMinor*remainingMonths;
 const termSavingsMinor=baselineTermMinor-proposedTermMinor;
 const decisionStatus=discountBps>0?'DISCOUNT_PROPOSAL':
    churnRisk==='HIGH'&&pauseAllowed?'PAUSE_REVIEW':'NO_DISCOUNT_RECOMMENDED';
 return Object.freeze({
  status:'DRAFT_ONLY',decisionStatus,subscriptionRef,
  churnRisk,ruleSource:'EXPLICIT_FICTIONAL_RISK_BAND_NOT_MODEL',
  currentMinor,remainingMonths,
  targetDiscountBps,maxDiscountBps,discountBps,
  monthlyDiscountMinor,proposedMinor,
  baselineTermMinor,proposedTermMinor,termSavingsMinor,
  alternative:pauseAllowed?'PAUSE_FOR_HUMAN_REVIEW':'NONE',
  recommendationOnly:true,merchantApprovalRequired:true,
  customerConsentRequired:true,providerSubscriptionVerified:false,
  paypalPlanChanged:false,paypalSubscriptionPaused:false,
  paymentState:'NOT_PAID',source:'FICTIONAL_POLICY_NOT_AI'
 });
}
