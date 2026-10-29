import test from 'node:test';import assert from 'node:assert/strict';
import {createAgentBudgetFlow} from '../src/agent_budget_flow.mjs';
const q={id:'q',ownerId:'o',merchantId:'m',version:1,currency:'USD',status:'APPROVED',approval:{actorId:'o',quoteVersion:1,amountMinor:2000}};
const n={status:'PROPOSED',currency:'USD',agreedMinor:2000,paymentAuthorized:false};
test('approval and durable reservation required before eligibility',async()=>{
 let calls=0;const flow=createAgentBudgetFlow({quotes:{get:async()=>q},budgets:{status:()=>({configured:true,limitMinor:5000,reservedMinor:0}),reserve:()=>{calls++;return {ok:true,remainingMinor:3000}}}});
 const args={quoteId:'q',ownerId:'o',merchantId:'m',expectedVersion:1,negotiation:n};
 assert.equal((await flow({...args,explicitApproval:false})).reason,'HUMAN_APPROVAL_REQUIRED');
 assert.equal(calls,0);
 const x=await flow({...args,explicitApproval:true});
 assert.equal(x.ok,true);assert.equal(x.paymentAuthorized,false);assert.equal(x.providerCallMade,false);assert.equal(calls,1);
});
test('stale quote cannot reserve',async()=>{
 let calls=0;const flow=createAgentBudgetFlow({quotes:{get:async()=>q},budgets:{status:()=>({configured:true,limitMinor:5000,reservedMinor:0}),reserve:()=>{calls++;return {ok:true}}}});
 assert.equal((await flow({quoteId:'q',ownerId:'o',merchantId:'m',expectedVersion:2,negotiation:n,explicitApproval:true})).reason,'STALE_QUOTE');
 assert.equal(calls,0);
});
