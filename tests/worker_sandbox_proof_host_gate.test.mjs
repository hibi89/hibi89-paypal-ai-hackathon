import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareWorkerSandboxGetGate} from '../src/worker_sandbox_proof_host_gate.mjs';
const FULL={PRIVATE_SANDBOX_ORDER_GET_OPT_IN:'OWNER_APPROVED_SANDBOX_ORDER_GET_ONLY',
 PRIVATE_SANDBOX_GET_NETWORK_OPT_IN:'OWNER_APPROVED_SANDBOX_OAUTH_AND_GET_ONLY',
 PRIVATE_SANDBOX_MERCHANT_ID:'PAYPALMERCH13',
 PRIVATE_SANDBOX_CLIENT_ID:'sandboxClientOne',
 PRIVATE_SANDBOX_CLIENT_SECRET:'sandboxSecretOne'};
test('production host proof gate defaults closed with zero fetch or secret processing',()=>{
 let calls=0;
 const gate=prepareWorkerSandboxGetGate({env:{},fetchImpl:async()=>{calls++}});
 assert.equal(gate.enabled,false);
 assert.equal(gate.transport,null);
 assert.equal(gate.providerCalls,0);
 assert.equal(calls,0);
 assert.ok(Object.isFrozen(gate));
});
test('partial approval, wrong merchant, missing credentials all fail closed',()=>{
 const fetchImpl=async()=>{throw Error('NO_NETWORK')};
 for(const env of [
  {PRIVATE_SANDBOX_ORDER_GET_OPT_IN:FULL.PRIVATE_SANDBOX_ORDER_GET_OPT_IN},
  {PRIVATE_SANDBOX_GET_NETWORK_OPT_IN:FULL.PRIVATE_SANDBOX_GET_NETWORK_OPT_IN},
  {...FULL,PRIVATE_SANDBOX_MERCHANT_ID:'ciMerchant'},
  {...FULL,PRIVATE_SANDBOX_CLIENT_SECRET:''},
  {...FULL,PRIVATE_SANDBOX_CLIENT_ID:''},
  {...FULL,PRIVATE_SANDBOX_ORDER_GET_OPT_IN:'OWNER_APPROVED_PAYMENT_CREATE'},
  {...FULL,PRIVATE_SANDBOX_GET_NETWORK_OPT_IN:'OWNER_APPROVED_CAPTURE'}
 ]){
  assert.throws(()=>prepareWorkerSandboxGetGate({env,fetchImpl}));
 }
});
test('explicit double gate constructs read-only transport without sending anything',async()=>{
 let calls=0;
 const gate=prepareWorkerSandboxGetGate({env:FULL,fetchImpl:async()=>{
  calls++;throw Error('SHOULD_NOT_SEND') }});
 assert.equal(gate.enabled,true);
 assert.equal(gate.transport.mode,'PAYPAL_SANDBOX_READ_ONLY');
 assert.equal(gate.transport.paymentPostsEnabled,false);
 assert.equal(gate.merchantId,'PAYPALMERCH13');
 assert.equal(gate.actualRemoteProviderVerified,false);
 assert.equal(calls,0);
});
