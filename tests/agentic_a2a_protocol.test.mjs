import test from 'node:test';
import assert from 'node:assert/strict';
import {runBoundedA2A,createOfflineRoleAgents} from '../src/agentic_a2a_protocol.mjs';

const simulate=opts=>runBoundedA2A({...createOfflineRoleAgents(),
 buyerMaxMinor:30000,sellerMinMinor:27000,...opts});

test('separate buyer and seller agents alternate and accept exact final offer',async()=>{
 const result=await simulate();
 assert.equal(result.status,'AGREED_OFFLINE_CONTRACT');
 assert.equal(result.agreedMinor,29900);
 assert.deepEqual(result.messages.map(x=>[x.role,x.action]),[
  ['seller','OFFER'],['buyer','COUNTER'],['seller','COUNTER'],['buyer','ACCEPT']]);
 assert.match(result.transcriptSha256,/^[0-9a-f]{64}$/);
 assert.equal(result.paymentAuthorized,false);
 assert.equal(result.paypalCapturePerformed,false);
 assert.equal(result.providerCalls,0);
 assert.equal(result.requiredExternalFundingAuthorization,true);
});
test('seller floor and buyer ceiling fail closed and never force an acceptance',async()=>{
 const r=await simulate({buyerMaxMinor:20000});
 assert.equal(r.status,'NO_AGREEMENT');
 assert.equal(r.agreedMinor,null);
 assert.equal(r.messages.at(-1).action,'REJECT');
 const sellerWins=await simulate({buyerMaxMinor:40000});
 assert.equal(sellerWins.status,'AGREED_OFFLINE_CONTRACT');
 assert.equal(sellerWins.agreedMinor,34500);
 assert.equal(sellerWins.messages.length,2);
});
test('a malicious buyer cannot forge acceptance of a different amount',async()=>{
 const sellerAgent=async()=>({action:'OFFER',amountMinor:30000});
 const buyerAgent=async()=>({action:'ACCEPT',amountMinor:15000});
 const r=await runBoundedA2A({sellerAgent,buyerAgent,buyerMaxMinor:30000,sellerMinMinor:20000});
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'ACCEPTANCE_MUST_MATCH_LATEST_OPPOSING_OFFER');
 assert.equal(r.messages.length,1);
 assert.equal(r.paymentAuthorized,false);
});
test('wrong role amounts, unknown model fields, and impossible transitions are rejected',async()=>{
 const base={buyerMaxMinor:30000,sellerMinMinor:27000};
 const cases=[
  {sellerAgent:async()=>({action:'ACCEPT',amountMinor:29900}),
   buyerAgent:async()=>({action:'ACCEPT',amountMinor:29900}),
   reason:'INVALID_AGENT_TRANSITION'},
  {sellerAgent:async()=>({action:'OFFER',amountMinor:26000}),
   buyerAgent:async()=>({action:'ACCEPT',amountMinor:26000}),
   reason:'AGENT_OFFER_VIOLATES_ROLE_POLICY'},
  {sellerAgent:async()=>({action:'OFFER',amountMinor:30000,authorizePayment:true}),
   buyerAgent:async()=>({action:'ACCEPT',amountMinor:30000}),
   reason:'INVALID_AGENT_MESSAGE'},
  {sellerAgent:async()=>({action:'OFFER',amountMinor:31000}),
   buyerAgent:async()=>({action:'ACCEPT',amountMinor:31000}),
   reason:'A2A_ACCEPTANCE_OUT_OF_BOUNDS'}
 ];
 for(const c of cases){
  const r=await runBoundedA2A({...base,...c});
  assert.equal(r.status,'BLOCKED');
  assert.equal(r.reason,c.reason);
  assert.equal(r.paymentAuthorized,false);
 }
});
test('timeout, thrown model callback, and bounded turns cannot authorize payment',async()=>{
 const delayed=await runBoundedA2A({buyerMaxMinor:30000,sellerMinMinor:27000,
  sellerAgent:async()=>new Promise(()=>{}),
  buyerAgent:async()=>({action:'ACCEPT',amountMinor:29900}),
  turnTimeoutMs:50});
 assert.equal(delayed.status,'BLOCKED');
 assert.equal(delayed.reason,'AGENT_RESPONSE_TIMEOUT');
 const bad=await runBoundedA2A({buyerMaxMinor:30000,sellerMinMinor:27000,
  sellerAgent:async()=>{throw new Error('TOKEN_CREDENTIAL_ERROR')},
  buyerAgent:async()=>({action:'ACCEPT',amountMinor:29900})});
 assert.equal(bad.status,'BLOCKED');
 assert.equal(bad.reason,'AGENT_EXECUTION_FAILED');
 assert.equal(JSON.stringify(bad).includes('TOKEN_CREDENTIAL_ERROR'),false);
 const limit=await simulate({maxTurns:3,buyerMaxMinor:20000});
 assert.equal(limit.status,'NO_AGREEMENT');
 assert.equal(limit.reason,'MAX_AGENT_TURNS');
});
test('invalid A2A setup rejects before calling any agent callback',async()=>{
 let touched=0;
 await assert.rejects(()=>runBoundedA2A({buyerAgent:async()=>{touched++},
  sellerAgent:async()=>{touched++},buyerMaxMinor:200,sellerMinMinor:27000,
  maxTurns:99}),/INVALID_A2A_PROTOCOL_CONFIGURATION/);
 assert.equal(touched,0);
});
