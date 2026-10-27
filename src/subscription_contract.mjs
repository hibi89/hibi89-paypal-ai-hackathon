// D10 offline-only, pure subscription state planner.
// This module neither verifies PayPal signatures nor calls PayPal.
// D11 MUST authenticate actual event bytes before passing trusted=true and
// persist event IDs atomically; do NOT attach this planner to an HTTP route.
import { ContractError } from './payment_contract.mjs';

const STATES=new Set(['UNKNOWN','APPROVAL_PENDING','APPROVED','ACTIVE',
  'SUSPENDED','CANCELLED','EXPIRED']);
const TERMINAL=new Set(['CANCELLED','EXPIRED']);
const ACTIVE_TRANSITIONS=Object.freeze({
  'BILLING.SUBSCRIPTION.CREATED': 'APPROVAL_PENDING',
  'BILLING.SUBSCRIPTION.ACTIVATED': 'ACTIVE',
  'BILLING.SUBSCRIPTION.SUSPENDED': 'SUSPENDED',
  'BILLING.SUBSCRIPTION.CANCELLED': 'CANCELLED',
  'BILLING.SUBSCRIPTION.EXPIRED': 'EXPIRED',
});
const ADVISORY_EVENTS=new Set([
  'BILLING.SUBSCRIPTION.UPDATED',
  'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
  'PAYMENT.SALE.COMPLETED',
  'PAYMENT.SALE.REFUNDED',
  'PAYMENT.SALE.REVERSED',
]);
const fail=(condition,code)=>{
  if(condition)throw new ContractError(code);
};
const opaque=value=>typeof value==='string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const timestamp=value=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value))
    return NaN;
  return Date.parse(value);
};
function checkSnapshot(snapshot){
  fail(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)||
    !opaque(snapshot.subscriptionId)||!opaque(snapshot.merchantId)||
    !opaque(snapshot.planId)||!STATES.has(snapshot.status)||
    !Array.isArray(snapshot.seenEventIds)||
    snapshot.seenEventIds.length>200||
    snapshot.seenEventIds.some(id=>!opaque(id))||
    new Set(snapshot.seenEventIds).size!==snapshot.seenEventIds.length||
    (snapshot.lastEventTime!==null &&
     !Number.isFinite(timestamp(snapshot.lastEventTime))),
  'INVALID_SUBSCRIPTION_SNAPSHOT');
}
export function createSubscriptionSnapshot({subscriptionId,merchantId,planId}={}){
  fail(!opaque(subscriptionId)||!opaque(merchantId)||!opaque(planId),
    'INVALID_SUBSCRIPTION_IDENTITY');
  return {subscriptionId,merchantId,planId,status:'UNKNOWN',
    lastEventTime:null,seenEventIds:[],
    // A lifecycle notification is NOT proof of a successful charge.
    paymentEvidence:'NOT_VERIFIED'};
}
function allowedTransition(from,to){
  if(TERMINAL.has(from))return false;
  if(to==='APPROVAL_PENDING')return from==='UNKNOWN';
  if(to==='ACTIVE')return ['UNKNOWN','APPROVAL_PENDING','APPROVED','SUSPENDED','ACTIVE'].includes(from);
  if(to==='SUSPENDED')return from==='ACTIVE'||from==='SUSPENDED';
  if(TERMINAL.has(to))return true;
  return false;
}
/**
 * Pure offline planning ONLY; trusted is a server-derived result of actual
 * webhook signature verification, NEVER an HTTP header/body field.
 * Returned snapshots are not durable: caller must persist atomically with
 * a UNIQUE event ID, before acknowledging delivery (D11).
 */
export function planTrustedSubscriptionEvent(snapshot,event,{trusted=false}={}){
  checkSnapshot(snapshot);
  fail(trusted!==true,'UNVERIFIED_PAYPAL_WEBHOOK');
  fail(!event||typeof event!=='object'||Array.isArray(event)||
    !opaque(event.id)||typeof event.event_type!=='string'||
    event.event_type.length>120||!Number.isFinite(timestamp(event.create_time)),
    'INVALID_PAYPAL_EVENT');
  const unchanged=()=>structuredClone(snapshot);
  if(snapshot.seenEventIds.includes(event.id))
    return {action:'IGNORE_DUPLICATE',snapshot:unchanged(),
      reason:'EVENT_ID_ALREADY_PROCESSED'};
  if(snapshot.seenEventIds.length===200)
    return {action:'RECONCILE_GET_FIRST',snapshot:unchanged(),
      reason:'EVENT_TRACKING_CAPACITY_REACHED'};
  const nextStatus=ACTIVE_TRANSITIONS[event.event_type];
  if(!nextStatus){
    return {action:'RECONCILE_GET_FIRST',snapshot:unchanged(),
      reason:ADVISORY_EVENTS.has(event.event_type)?
        'ADVISORY_EVENT_REQUIRES_PROVIDER_GET':'UNHANDLED_EVENT_TYPE'};
  }
  // Only lifecycle events with a matching subscription resource may advance
  // state; SALE events often carry payment-resource IDs, not subscription IDs.
  if(event.resource?.id!==snapshot.subscriptionId)
    return {action:'RECONCILE_GET_FIRST',snapshot:unchanged(),
      reason:'SUBSCRIPTION_RESOURCE_MISMATCH'};
  if(snapshot.lastEventTime!==null &&
      timestamp(event.create_time)<=timestamp(snapshot.lastEventTime))
    return {action:'RECONCILE_GET_FIRST',snapshot:unchanged(),
      reason:'OUT_OF_ORDER_OR_SAME_TIMESTAMP'};
  if(!allowedTransition(snapshot.status,nextStatus))
    return {action:'RECONCILE_GET_FIRST',snapshot:unchanged(),
      reason:'ILLEGAL_OR_TERMINAL_TRANSITION'};
  return {action:'APPLY_VERIFIED_LIFECYCLE',reason:'OFFLINE_PLANNED_ONLY',
    snapshot:{...unchanged(),status:nextStatus,lastEventTime:event.create_time,
      seenEventIds:[...snapshot.seenEventIds,event.id],
      paymentEvidence:'NOT_VERIFIED'}};
}
