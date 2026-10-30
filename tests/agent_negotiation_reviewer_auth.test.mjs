import test from 'node:test';import assert from 'node:assert/strict';
import {createNegotiationDemoApi} from '../src/agent_negotiation_demo_api.mjs';
import {createNegotiationRegistry} from '../src/negotiation_registry.mjs';
const quote={id:'q',ownerId:'synthetic-owner',merchantId:'synthetic-merchant',status:'PROPOSED',version:1,currency:'USD'};
const body={quoteId:'q',expectedVersion:1,buyerMaxMinor:30000,sellerMinMinor:20000,openingMinor:28000};
function request(){return new Request('http://localhost/api/demo/negotiate',{method:'POST',headers:{origin:'http://localhost','x-csrf-token':'token','content-type':'application/json'},body:JSON.stringify(body)})}
const session={verified:true,actorId:'synthetic-owner',merchantId:'synthetic-merchant',csrfToken:'token'};
test('synthetic owner may negotiate without payment authority',async()=>{
 const api=createNegotiationDemoApi({resolveSession:async()=>session,repository:{get:async()=>quote},registry:createNegotiationRegistry()});
 const res=await api(request());assert.equal(res.status,200);
 const data=await res.json();assert.equal(data.paymentAuthorized,false);
});
test('synthetic reviewer cannot negotiate even when quote is accessible',async()=>{
 const api=createNegotiationDemoApi({resolveSession:async()=>({...session,actorId:'synthetic-reviewer'}),repository:{get:async()=>quote},registry:createNegotiationRegistry()});
 const res=await api(request());assert.equal(res.status,403);assert.equal((await res.json()).error,'OWNER_ONLY');
});
