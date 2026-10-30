import test from 'node:test';
import assert from 'node:assert/strict';
import {createNegotiationRegistry} from '../src/negotiation_registry.mjs';

test('server-issued proposal is required and bound to owner, amount and version',()=>{
 const registry=createNegotiationRegistry();
 const proposal={quoteId:'sample-project',quoteVersion:2,status:'PROPOSED',currency:'USD',agreedMinor:25000,paymentAuthorized:false};
 assert.equal(registry.verify({owner:'synthetic-owner',merchant:'synthetic-merchant',proposal}),false);
 registry.issue({owner:'synthetic-owner',merchant:'synthetic-merchant',proposal});
 const check=(p,owner='synthetic-owner')=>registry.verify({owner,merchant:'synthetic-merchant',proposal:p});
 assert.equal(check(proposal),true);
 for(const forged of [{...proposal,agreedMinor:25001},{...proposal,currency:'EUR'},{...proposal,paymentAuthorized:true},{...proposal,quoteVersion:3},{...proposal,status:'NO_AGREEMENT'},{...proposal,source:'FAKE_PROVIDER'},{...proposal,rounds:[{offerMinor:1}]}]){
  assert.equal(check(forged),false);
 }
 assert.equal(check(proposal,'other-owner'),false);
});
