import test from 'node:test';
import assert from 'node:assert/strict';
import {createNegotiationDemoApi} from '../src/agent_negotiation_demo_api.mjs';
import {createNegotiationRegistry} from '../src/negotiation_registry.mjs';

test('negotiation API refuses startup without a proposal issuance registry',()=>{
 const dependencies={resolveSession:async()=>({verified:true,actorId:'synthetic-owner',merchantId:'synthetic-merchant',csrfToken:'local'}),repository:{get:async()=>null}};
 assert.throws(()=>createNegotiationDemoApi(dependencies),{message:'TRUSTED_DEPENDENCIES_REQUIRED'});
 assert.doesNotThrow(()=>createNegotiationDemoApi({...dependencies,registry:createNegotiationRegistry()}));
});
