import test from 'node:test';import assert from 'node:assert/strict';
import {createAgentBudgetFlow} from '../src/agent_budget_flow.mjs';
const quote={id:'q',ownerId:'o',merchantId:'m',version:1,currency:'USD',status:'APPROVED',approval:{actorId:'o',quoteVersion:1,amountMinor:2000}};
const negotiation={status:'PROPOSED',currency:'USD',agreedMinor:2000,paymentAuthorized:false};
test('different-amount replay fails before SQLite mutation',async()=>{
 let calls=0;
 const prepare=createAgentBudgetFlow({quotes:{get:async()=>quote},budgets:{
  status:()=>({configured:true,limitMinor:10000,reservedMinor:3000}),
  existing:()=>3000,
  reserve:()=>{calls++;return {ok:true}}
 }});
 const result=await prepare({quoteId:'q',ownerId:'o',merchantId:'m',expectedVersion:1,negotiation,explicitApproval:true});
 assert.deepEqual(result,{ok:false,reason:'RESERVATION_AMOUNT_CONFLICT'});
 assert.equal(calls,0);
});
test('identical reservation replay remains permitted without a new charge',async()=>{
 const prepare=createAgentBudgetFlow({quotes:{get:async()=>quote},budgets:{
  status:()=>({configured:true,limitMinor:2000,reservedMinor:2000}),
  existing:()=>2000,
  reserve:()=>({ok:true,reason:'ALREADY_RESERVED'})
 }});
 const result=await prepare({quoteId:'q',ownerId:'o',merchantId:'m',expectedVersion:1,negotiation,explicitApproval:true});
 assert.equal(result.ok,true);assert.equal(result.reason,'ALREADY_RESERVED');assert.equal(result.paymentAuthorized,false);
});
