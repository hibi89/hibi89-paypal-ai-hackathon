import test from 'node:test';
import assert from 'node:assert/strict';
import {createAgentBudgetDemoApi} from '../src/agent_budget_demo_api.mjs';
const budgets={status:()=>({configured:false,limitMinor:null,reservedMinor:0}),configure:()=>({ok:true}),reserve:()=>({ok:false})};
const quotes={get:async()=>null};
const owner={verified:true,actorId:'synthetic-owner',merchantId:'synthetic-merchant',csrfToken:'csrf'};
const reviewer={...owner,actorId:'synthetic-reviewer'};
function request(path,method='GET',data,csrf='csrf'){
 const headers={origin:'http://localhost','x-csrf-token':csrf,'content-type':'application/json'};
 return new Request('http://localhost/api/demo/budget/'+path,{method,headers,...(data?{body:JSON.stringify(data)}:{})});
}
test('reviewer denied owner budget read and writes',async()=>{
 const api=createAgentBudgetDemoApi({resolveSession:async()=>reviewer,quotes,budgets});
 assert.equal((await api(request('status'))).status,403);
 assert.equal((await api(request('configure','POST',{limitMinor:10000,confirmBudget:true}))).status,403);
 assert.equal((await api(request('reserve','POST',{quoteId:'q'}))).status,403);
});
test('owner budget read permitted, writes require CSRF and explicit confirmation',async()=>{
 const api=createAgentBudgetDemoApi({resolveSession:async()=>owner,quotes,budgets});
 assert.equal((await api(request('status'))).status,200);
 assert.equal((await api(request('configure','POST',{limitMinor:10000,confirmBudget:true},'bad'))).status,403);
 assert.equal((await api(request('configure','POST',{limitMinor:10000}))).status,403);
 assert.equal((await api(request('configure','POST',{limitMinor:10000,confirmBudget:true}))).status,200);
});
