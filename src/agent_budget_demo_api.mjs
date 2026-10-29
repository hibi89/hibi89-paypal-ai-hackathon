// Synthetic loopback budget endpoint. No outbound payment authority.
import {reply,parseSmallJson,QuoteApiError} from './quote_api.mjs';
import {createAgentBudgetFlow} from './agent_budget_flow.mjs';
export function createAgentBudgetDemoApi({resolveSession,quotes,budgets}={}){
 const prepare=createAgentBudgetFlow({quotes,budgets});
 return async request=>{
  try{
   const url=new URL(request.url),action=url.pathname.split('/').at(-1);
   if(!['status','configure','reserve'].includes(action))return reply({error:'NOT_FOUND'},404);
   const method=action==='status'?'GET':'POST';
   if(request.method!==method)return reply({error:'METHOD_NOT_ALLOWED'},405,{allow:method});
   const session=await resolveSession(request);
   if(!session?.verified||!session.actorId||!session.merchantId)return reply({error:'AUTH_REQUIRED'},401);
   // The reviewer persona must never configure or inspect the owner's budget.
   if(session.actorId!=='synthetic-owner'||session.merchantId!=='synthetic-merchant')return reply({error:'OWNER_ONLY'},403);
   if(method==='GET')return reply({source:'OFFLINE_SQLITE',...budgets.status(session.actorId,session.merchantId)});
   if(request.headers.get('origin')!==url.origin||!session.csrfToken||request.headers.get('x-csrf-token')!==session.csrfToken)return reply({error:'CSRF_REQUIRED'},403);
   const data=await parseSmallJson(request);
   if(action==='configure'){
    if(data.confirmBudget!==true)return reply({error:'EXPLICIT_BUDGET_CONFIRMATION_REQUIRED'},403);
    const result=budgets.configure(session.actorId,session.merchantId,data.limitMinor);
    return reply({...result,paymentAuthorized:false},result.ok?200:409);
   }
   if(typeof data.quoteId!=='string'||!Number.isSafeInteger(data.expectedVersion)||data.expectedVersion<1||data.negotiation?.quoteId!==data.quoteId||data.negotiation?.quoteVersion!==data.expectedVersion||data.negotiation?.source!=='OFFLINE_POLICY')return reply({error:'NEGOTIATION_BINDING_REQUIRED'},409);
   const result=await prepare({quoteId:data.quoteId,ownerId:session.actorId,merchantId:session.merchantId,expectedVersion:data.expectedVersion,negotiation:data.negotiation,explicitApproval:data.explicitApproval});
   return reply(result,result.ok?200:409);
  }catch(e){
   if(e instanceof QuoteApiError)return reply({error:e.code},e.status);
   if(e instanceof TypeError||e?.message==='INVALID_LIMIT'||e?.message==='INVALID_RESERVATION')return reply({error:'INVALID_BUDGET_INPUT'},400);
   return reply({error:'BUDGET_INTERNAL_ERROR'},500);
  }
 };
}
