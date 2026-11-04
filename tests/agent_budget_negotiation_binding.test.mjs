import test from 'node:test';import assert from 'node:assert/strict';
import {createAgentBudgetFlow} from '../src/agent_budget_flow.mjs';
const quote={id:'q1',ownerId:'owner',merchantId:'merchant',version:2,currency:'USD',status:'APPROVED',approval:{actorId:'owner',quoteVersion:2,amountMinor:2000}};
const negotiation={quoteId:'q1',quoteVersion:2,status:'PROPOSED',currency:'USD',agreedMinor:2000,paymentAuthorized:false};
test('reject negotiation belonging to a different quote or version',async()=>{
 let lookups=0;
 const flow=createAgentBudgetFlow({quotes:{get:async()=>{lookups++;return quote}},budgets:{status:()=>({configured:true,limitMinor:5000,reservedMinor:0}),reserve:()=>({ok:true})}});
 const args={quoteId:'q1',ownerId:'owner',merchantId:'merchant',expectedVersion:2,explicitApproval:true};
 assert.equal((await flow({...args,negotiation:{...negotiation,quoteId:'q2'}})).reason,'NEGOTIATION_QUOTE_MISMATCH');
 assert.equal((await flow({...args,negotiation:{...negotiation,quoteVersion:1}})).reason,'NEGOTIATION_VERSION_MISMATCH');
 assert.equal(lookups,0);
 assert.equal((await flow({...args,negotiation})).ok,true);
});
