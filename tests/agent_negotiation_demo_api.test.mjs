import test from 'node:test';
import assert from 'node:assert/strict';
import {createNegotiationDemoApi} from '../src/agent_negotiation_demo_api.mjs';
import {createNegotiationRegistry} from '../src/negotiation_registry.mjs';
const quote={id:'q1',ownerId:'owner',merchantId:'merchant',status:'PROPOSED',version:1,currency:'USD'};
const api=createNegotiationDemoApi({resolveSession:async()=>({verified:true,actorId:'owner',merchantId:'merchant',csrfToken:'csrf'}),repository:{get:async()=>quote},registry:createNegotiationRegistry()});
function req(body,csrf='csrf'){return new Request('http://localhost/api/demo/negotiate',{method:'POST',headers:{origin:'http://localhost','x-csrf-token':csrf,'content-type':'application/json'},body:JSON.stringify(body)});}
test('offline proposal requires approval',async()=>{const r=await api(req({quoteId:'q1',expectedVersion:1,buyerMaxMinor:30000,sellerMinMinor:25000,openingMinor:28000}));assert.equal(r.status,200);const x=await r.json();assert.equal(x.source,'OFFLINE_POLICY');assert.equal(x.paymentAuthorized,false);});
test('CSRF mismatch is rejected',async()=>assert.equal((await api(req({quoteId:'q1'},'bad'))).status,403));
test('stale quote version is rejected',async()=>assert.equal((await api(req({quoteId:'q1',expectedVersion:2,buyerMaxMinor:30000,sellerMinMinor:25000,openingMinor:28000}))).status,409));
test('no budget overlap returns no agreement',async()=>{const r=await api(req({quoteId:'q1',expectedVersion:1,buyerMaxMinor:100,sellerMinMinor:101,openingMinor:101}));assert.equal((await r.json()).status,'NO_AGREEMENT');});
