import test from 'node:test';import assert from 'node:assert/strict';
import {createAgentBudgetFlow} from '../src/agent_budget_flow.mjs';
test('identical approved quote replay remains eligible and does not spend twice',async()=>{
 const q={id:'q',ownerId:'o',merchantId:'m',version:1,currency:'USD',status:'APPROVED',approval:{actorId:'o',quoteVersion:1,amountMinor:2500}};
 const n={status:'PROPOSED',currency:'USD',agreedMinor:2500,paymentAuthorized:false};
 let count=0;
 const flow=createAgentBudgetFlow({quotes:{get:async()=>q},budgets:{status:()=>({configured:true,limitMinor:2500,reservedMinor:2500}),existing:()=>2500,reserve:()=>{count++;return {ok:true,reason:'ALREADY_RESERVED'}}}});
 const result=await flow({quoteId:'q',ownerId:'o',merchantId:'m',expectedVersion:1,negotiation:n,explicitApproval:true});
 assert.equal(result.ok,true);assert.equal(result.reason,'ALREADY_RESERVED');assert.equal(result.paymentAuthorized,false);assert.equal(count,1);
});
