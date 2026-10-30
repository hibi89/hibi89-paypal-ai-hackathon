import test from 'node:test';
import assert from 'node:assert/strict';
import {createGithubDeliveryDemoApi} from '../src/github_delivery_demo_api.mjs';
const input={repository:'fictional/demo',commitSha:'a'.repeat(40),prNumber:1,checks:[{name:'build',conclusion:'success'}],requiredChecks:['build'],reviewApproved:true,acknowledgeSynthetic:true};
function req(data=input,csrf='token'){return new Request('http://localhost/api/demo/github-delivery',{method:'POST',headers:{origin:'http://localhost','x-csrf-token':csrf,'content-type':'application/json'},body:JSON.stringify(data)})}
const owner={verified:true,actorId:'synthetic-owner',merchantId:'synthetic-merchant',csrfToken:'token'};
test('owner may evaluate fictional CI but cannot authorize payout',async()=>{
 const api=createGithubDeliveryDemoApi({resolveSession:async()=>owner});
 const response=await api(req());assert.equal(response.status,200);
 const body=await response.json();assert.equal(body.decision,'READY_FOR_HUMAN_SETTLEMENT_REVIEW');assert.equal(body.payoutAuthorized,false);assert.equal(body.source,'UNVERIFIED_OFFLINE_INPUT');
});
test('reviewer cannot evaluate owner delivery',async()=>{
 const api=createGithubDeliveryDemoApi({resolveSession:async()=>({...owner,actorId:'synthetic-reviewer'})});
 assert.equal((await api(req())).status,403);
});
test('CSRF and explicit synthetic acknowledgement required',async()=>{
 const api=createGithubDeliveryDemoApi({resolveSession:async()=>owner});
 assert.equal((await api(req(input,'bad'))).status,403);
 assert.equal((await api(req({...input,acknowledgeSynthetic:false}))).status,403);
});
test('missing check and approval always hold',async()=>{
 const api=createGithubDeliveryDemoApi({resolveSession:async()=>owner});
 const response=await api(req({...input,checks:[],reviewApproved:false}));
 assert.equal((await response.json()).decision,'HOLD');
});
