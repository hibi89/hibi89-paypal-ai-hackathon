import {createGeminiA2ARoleAgents} from './gemini_a2a_adapter.mjs';
import {isBudgetStore,hashEvidence} from './gemini_a2a_budget_store.mjs';

const error=code=>{const e=new Error(code);e.code=code;throw e};
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(x);

export function createDurableGeminiA2ARoles({budgetStore,budgetScope,...provider}={}){
 if(!isBudgetStore(budgetStore)||!budgetScope||
    !['actor','merchant','job'].every(k=>validId(budgetScope[k])))
  error('A2A_PRIVATE_DURABLE_QUOTA_REQUIRED');
 const inner=createGeminiA2ARoleAgents(provider);
 let blocked=false;
 const agent=role=>async view=>{
  if(blocked)error('A2A_DURABLE_CIRCUIT_OPEN');
  if(!view||view.role!==role||!Number.isSafeInteger(view.turn)||
     view.turn<1||view.turn>12||!Array.isArray(view.history))
   error('A2A_DURABLE_BAD_CONTEXT');
  const source=JSON.stringify({role,turn:view.turn,limit:view.ownLimitMinor,history:view.history});
  if(Buffer.byteLength(source)>2500)error('A2A_DURABLE_CONTEXT_TOO_LARGE');
  const ticket=budgetStore.claim({...budgetScope,role,turn:view.turn,promptHash:hashEvidence(source)});
  const before=inner.status().verifiedTokens;
  try{
   const answer=await inner[role==='seller'?'sellerAgent':'buyerAgent'](view);
   budgetStore.finish(ticket,{usedTokens:inner.status().verifiedTokens-before,
     outputHash:hashEvidence(JSON.stringify(answer))});
   return answer;
  }catch(e){
   blocked=true;
   try{budgetStore.uncertain(ticket)}catch{}
   const code=typeof e?.code==='string'&&/^(A2A_|GEMINI_A2A_)/.test(e.code)
    ?e.code:'A2A_DURABLE_UNKNOWN';
   error(code);
  }
 };
 return Object.freeze({
  sellerAgent:agent('seller'),buyerAgent:agent('buyer'),
  status:()=>Object.freeze({
   durableBudget:budgetStore.status(budgetScope),runtime:inner.status(),
   circuitOpen:blocked,providerVerified:false,
   source:'PRIVATE_INJECTED_TRANSPORT_UNVERIFIED',
   paymentAuthorized:false
  })
 });
}
