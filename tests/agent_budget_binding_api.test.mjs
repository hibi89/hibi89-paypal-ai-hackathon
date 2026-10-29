import test from 'node:test';import assert from 'node:assert/strict';
import {createAgentBudgetDemoApi} from '../src/agent_budget_demo_api.mjs';
const session={verified:true,actorId:'synthetic-owner',merchantId:'synthetic-merchant',csrfToken:'token'};
let calls=0;
const api=createAgentBudgetDemoApi({resolveSession:async()=>session,quotes:{get:async()=>{calls++;return null}},budgets:{status:()=>({configured:true,limitMinor:10000,reservedMinor:0}),reserve:()=>{calls++;return {ok:true}}}});
const base={quoteId:'q1',expectedVersion:1,explicitApproval:true};
async function post(negotiation){return api(new Request('http://localhost/api/demo/budget/reserve',{method:'POST',headers:{origin:'http://localhost','x-csrf-token':'token','content-type':'application/json'},body:JSON.stringify({...base,negotiation})}))}
test('budget API rejects unbound and mismatched negotiation proposals before store access',async()=>{
 for(const n of [undefined,{status:'PROPOSED',agreedMinor:2000},{quoteId:'q2',quoteVersion:1},{quoteId:'q1',quoteVersion:2}]){
  const response=await post(n);assert.equal(response.status,409);assert.equal((await response.json()).error,'NEGOTIATION_BINDING_REQUIRED');
 }
 assert.equal(calls,0);
});

test('missing quote ID and expected version are not treated as matching undefined fields',async()=>{
 for(const payload of [{negotiation:{}},{quoteId:'q1',negotiation:{quoteId:'q1'}},{expectedVersion:1,negotiation:{quoteVersion:1}}]){
  const response=await api(new Request('http://localhost/api/demo/budget/reserve',{method:'POST',headers:{origin:'http://localhost','x-csrf-token':'token','content-type':'application/json'},body:JSON.stringify(payload)}));
  assert.equal(response.status,409);assert.equal((await response.json()).error,'NEGOTIATION_BINDING_REQUIRED');
 }
 assert.equal(calls,0);
});
