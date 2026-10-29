// Offline-only orchestration. No PayPal/Gemini calls and no implicit payment authority.
import {evaluatePaymentGuardrail} from './agent_budget_guardrail.mjs';
export function createAgentBudgetFlow({quotes,budgets}={}){
 if(typeof quotes?.get!=='function'||typeof budgets?.status!=='function'||typeof budgets?.reserve!=='function')throw new TypeError('STORES_REQUIRED');
 return async function prepare({quoteId,ownerId,merchantId,expectedVersion,negotiation,explicitApproval}={}){
  if(typeof quoteId!=='string'||typeof ownerId!=='string'||typeof merchantId!=='string'||!Number.isSafeInteger(expectedVersion)||expectedVersion<1)return {ok:false,reason:'INVALID_REQUEST'};
  if(negotiation?.quoteId !== undefined && negotiation.quoteId !== quoteId) return {ok:false,reason:'NEGOTIATION_QUOTE_MISMATCH'};
  if(negotiation?.quoteVersion !== undefined && negotiation.quoteVersion !== expectedVersion) return {ok:false,reason:'NEGOTIATION_VERSION_MISMATCH'};
  const quote=await quotes.get(quoteId);
  if(!quote||quote.ownerId!==ownerId||quote.merchantId!==merchantId)return {ok:false,reason:'QUOTE_NOT_FOUND'};
  if(quote.version!==expectedVersion)return {ok:false,reason:'STALE_QUOTE'};
  const state=budgets.status(ownerId,merchantId);
  if(!state.configured)return {ok:false,reason:'BUDGET_NOT_CONFIGURED'};
  const prior=typeof budgets.existing==='function'?budgets.existing(ownerId,merchantId,quoteId,expectedVersion):null;
  // An identical replay must not count its own already-reserved amount twice.
  if(prior!==null&&prior!==negotiation?.agreedMinor)return {ok:false,reason:'RESERVATION_AMOUNT_CONFLICT'};
  const replay=prior!==null&&prior===negotiation?.agreedMinor;
  const reservedMinor=state.reservedMinor-(replay?prior:0);
  const decision=evaluatePaymentGuardrail({quote,negotiation,limitMinor:state.limitMinor,reservedMinor,actorApproved:explicitApproval===true});
  if(!decision.allowed)return {ok:false,reason:decision.reason};
  // Re-read quote immediately before reservation; durable CAS is still required for production.
  const fresh=await quotes.get(quoteId);
  if(!fresh||fresh.rejection||fresh.currency!==quote.currency||fresh.id!==quoteId||fresh.ownerId!==ownerId||fresh.merchantId!==merchantId||fresh.version!==expectedVersion||fresh.status!=='APPROVED'||fresh.approval?.actorId!==ownerId||fresh.approval?.quoteVersion!==expectedVersion||fresh.approval?.amountMinor!==negotiation.agreedMinor)return {ok:false,reason:'QUOTE_CHANGED'};
  const reserved=budgets.reserve({owner:ownerId,merchant:merchantId,quote:quoteId,version:expectedVersion,amount:negotiation.agreedMinor});
  const remainingMinor=reserved.ok ? budgets.status(ownerId,merchantId).limitMinor-budgets.status(ownerId,merchantId).reservedMinor : null;
  return {ok:reserved.ok,reason:reserved.reason??'RESERVED',remainingMinor,paymentAuthorized:false,providerCallMade:false};
 };
}
