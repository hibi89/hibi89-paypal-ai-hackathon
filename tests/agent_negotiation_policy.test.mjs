import test from 'node:test';
import assert from 'node:assert/strict';
import {negotiateBoundedPrice} from '../src/agent_negotiation_policy.mjs';
test('bounded USD proposal is not a payment authorization',()=>{
 const x=negotiateBoundedPrice({buyerMaxMinor:30000,sellerMinMinor:25000,openingMinor:28000});
 assert.equal(x.status,'PROPOSED');assert.ok(x.agreedMinor>=25000&&x.agreedMinor<=30000);
 assert.equal(x.paymentAuthorized,false);assert.equal(x.requiresHumanApproval,true);
});
test('disjoint budgets fail closed',()=>assert.equal(negotiateBoundedPrice({buyerMaxMinor:100,sellerMinMinor:101,openingMinor:101}).status,'NO_AGREEMENT'));
test('invalid values and currency rejected',()=>{
 for(const v of [0,-1,1.1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])
 assert.throws(()=>negotiateBoundedPrice({buyerMaxMinor:v,sellerMinMinor:100,openingMinor:100}));
 assert.throws(()=>negotiateBoundedPrice({buyerMaxMinor:300,sellerMinMinor:100,openingMinor:200,currency:'KRW'}));
});
test('proposal and rounds are immutable',()=>{
 const x=negotiateBoundedPrice({buyerMaxMinor:30000,sellerMinMinor:25000,openingMinor:28000});
 assert.ok(Object.isFrozen(x));assert.ok(Object.isFrozen(x.rounds));assert.ok(Object.isFrozen(x.rounds[0]));
});
