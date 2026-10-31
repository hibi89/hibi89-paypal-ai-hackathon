// Synthetic loopback budget endpoint. No outbound payment authority.
import {reply,parseSmallJson,QuoteApiError} from './quote_api.mjs';
import {createAgentBudgetFlow} from './agent_budget_flow.mjs';
import {authorizePersistedLocalAction} from './marketplace_identity_policy.mjs';
export function createAgentBudgetDemoApi({resolveSession,quotes,budgets,registry,identityPolicy}={}){
 if(identityPolicy!==undefined&&typeof quotes?.getQuoteAuthorityResource!=='function')
  throw new TypeError('PERSISTED_BUDGET_RESOURCE_REQUIRED');
 if(typeof registry?.verify!=='function')throw new TypeError('ISSUANCE_REGISTRY_REQUIRED');
 const prepare=createAgentBudgetFlow({quotes,budgets});
 return async request=>{
  try{
   const url=new URL(request.url),action=url.pathname.split('/').at(-1);
   if(!['status','history','configure','reserve'].includes(action))return reply({error:'NOT_FOUND'},404);
   const method=action==='status'||action==='history'?'GET':'POST';
   if(request.method!==method)return reply({error:'METHOD_NOT_ALLOWED'},405,{allow:method});
   const session=await resolveSession(request);
   if(!session?.verified||!session.actorId||!session.merchantId)return reply({error:'AUTH_REQUIRED'},401);
   // The reviewer persona must never configure or inspect the owner's budget.
   if(session.actorId!=='synthetic-owner'||session.merchantId!=='synthetic-merchant')return reply({error:'OWNER_ONLY'},403);
   const baseScope={ownerId:session.actorId,merchantId:session.merchantId};
   if(identityPolicy&&(method==='GET'||action==='configure'))
     await authorizePersistedLocalAction({policy:identityPolicy,request,session,
       action:method==='GET'?'budget.read':'budget.configure',resource:baseScope});
   if(method==='GET')return action==='history'?reply({source:'OFFLINE_SQLITE',reservations:budgets.history(session.actorId,session.merchantId)}):reply({source:'OFFLINE_SQLITE',...budgets.status(session.actorId,session.merchantId)});
   if(request.headers.get('origin')!==url.origin||!session.csrfToken||request.headers.get('x-csrf-token')!==session.csrfToken)return reply({error:'CSRF_REQUIRED'},403);
   const data=await parseSmallJson(request);
   if(action==='configure'){
    if(data.confirmBudget!==true)return reply({error:'EXPLICIT_BUDGET_CONFIRMATION_REQUIRED'},403);
    const result=budgets.configure(session.actorId,session.merchantId,data.limitMinor);
    return reply({...result,paymentAuthorized:false},result.ok?200:409);
   }
   if(typeof data.quoteId!=='string'||!Number.isSafeInteger(data.expectedVersion)||data.expectedVersion<1||data.negotiation?.quoteId!==data.quoteId||data.negotiation?.quoteVersion!==data.expectedVersion)return reply({error:'NEGOTIATION_BINDING_REQUIRED'},409);
   if(!registry.verify({owner:session.actorId,merchant:session.merchantId,proposal:data.negotiation}))return reply({error:'NEGOTIATION_NOT_ISSUED'},409);
   let proof,grantRevision,scope;
   if(identityPolicy){
     scope=await quotes.getQuoteAuthorityResource(data.quoteId);
     if(!scope)return reply({error:'QUOTE_NOT_FOUND'},404);
     const trusted=await authorizePersistedLocalAction({policy:identityPolicy,request,session,
       action:'budget.reserve',resource:scope});
     proof=trusted.proof;
     grantRevision=trusted.grant.membershipRevision;
   }
   const result=await prepare({quoteId:data.quoteId,ownerId:session.actorId,merchantId:session.merchantId,expectedVersion:data.expectedVersion,negotiation:data.negotiation,explicitApproval:data.explicitApproval,
     ...(identityPolicy?{beforeReserve:async()=>{
       const latest=await identityPolicy.authorize(proof,{action:'budget.reserve',resource:scope});
       if(latest.membershipRevision!==grantRevision)
         throw new QuoteApiError('ROLE_SESSION_CHANGED',403);
     }}:{})});
   return reply(result,result.ok?200:409);
  }catch(e){
   if(e instanceof QuoteApiError)return reply({error:e.code},e.status);
   if(e instanceof TypeError||e?.message==='INVALID_LIMIT'||e?.message==='INVALID_RESERVATION')return reply({error:'INVALID_BUDGET_INPUT'},400);
   return reply({error:'BUDGET_INTERNAL_ERROR'},500);
  }
 };
}
