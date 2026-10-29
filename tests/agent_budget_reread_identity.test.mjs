import test from 'node:test';
import assert from 'node:assert/strict';
import {createAgentBudgetFlow} from '../src/agent_budget_flow.mjs';

test('reservation rejects ownership or approval changed between two quote reads',async()=>{
 const base={id:'q',ownerId:'owner',merchantId:'merchant',version:2,currency:'USD',status:'APPROVED',approval:{actorId:'owner',quoteVersion:2,amountMinor:2500}};
 const negotiation={quoteId:'q',quoteVersion:2,status:'PROPOSED',currency:'USD',agreedMinor:2500,paymentAuthorized:false};
 for(const changed of [
  {ownerId:'attacker'},{merchantId:'other'},{id:'other'},
  {approval:{actorId:'attacker',quoteVersion:2,amountMinor:2500}},
  {approval:{actorId:'owner',quoteVersion:1,amountMinor:2500}}
 ]){
  let reads=0,reservations=0;
  const flow=createAgentBudgetFlow({quotes:{get:async()=>++reads===1?base:{...base,...changed}},budgets:{status:()=>({configured:true,limitMinor:5000,reservedMinor:0}),reserve:()=>{reservations++;return {ok:true}}}});
  const result=await flow({quoteId:'q',ownerId:'owner',merchantId:'merchant',expectedVersion:2,negotiation,explicitApproval:true});
  assert.equal(result.ok,false);assert.equal(result.reason,'QUOTE_CHANGED');
  assert.equal(reads,2);assert.equal(reservations,0);
 }
});
