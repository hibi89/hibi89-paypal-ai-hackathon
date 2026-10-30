import test from 'node:test';
import assert from 'node:assert/strict';
import {createAgentBudgetDemoApi} from '../src/agent_budget_demo_api.mjs';
import {createNegotiationRegistry} from '../src/negotiation_registry.mjs';

test('budget API refuses startup without trusted issuance verification',()=>{
 const dependencies={resolveSession:async()=>({verified:true,actorId:'synthetic-owner',merchantId:'synthetic-merchant'}),quotes:{get:async()=>null},budgets:{status:()=>({}),reserve:()=>({ok:false})}};
 assert.throws(()=>createAgentBudgetDemoApi(dependencies),{message:'ISSUANCE_REGISTRY_REQUIRED'});
 assert.doesNotThrow(()=>createAgentBudgetDemoApi({...dependencies,registry:createNegotiationRegistry()}));
});
