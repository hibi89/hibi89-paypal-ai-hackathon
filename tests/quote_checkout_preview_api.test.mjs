import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuoteCheckoutPreviewApi} from '../src/quote_checkout_preview_api.mjs';
import {createMemoryQuoteRepository} from '../src/quote_api.mjs';
import {planOrder} from '../src/payment_contract.mjs';
const q=(v=1)=>({id:'sample-project',version:v,ownerId:'synthetic-owner',
 merchantId:'synthetic-merchant',currency:'USD',status:'PROPOSED',
 approval:null,rejection:null});
const owner=()=>({verified:true,actorId:'synthetic-owner',merchantId:'synthetic-merchant'});
const api=(db,user=owner)=>createQuoteCheckoutPreviewApi({repository:db,resolveSession:async()=>user()});
const req=(method='GET')=>new Request('http://127.0.0.1:9900/api/demo/quote-checkout-preview',{method});
test('real approved quote flows to Orders pure planner with zero provider calls',async()=>{
 const db=createMemoryQuoteRepository([q(2)]),handle=api(db);
 assert.equal((await handle(req())).status,409);
 assert.equal((await handle(req('POST'))).status,405);
 const approved=await db.approve({id:'sample-project',actorId:'synthetic-owner',
  expectedVersion:2,amountMinor:2900});
 const response=await handle(req());
 assert.equal(response.status,200);
 const data=await response.json();
 assert.deepEqual([data.status,data.source,data.quoteVersion,data.amount,
   data.plannedMethod,data.plannedPath],[
  'LOCAL_APPROVED_QUOTE_PAYPAL_PLAN_ONLY','PERSISTED_SYNTHETIC_SQLITE_APPROVAL',
  2,'29.00','POST_NOT_SENT','/v2/checkout/orders']);
 assert.equal(data.amount,planOrder(approved).body.purchase_units[0].amount.value);
 assert.equal(data.amountMinor,2900);
 for(const k of ['executionAuthorized','orderCreated','capturePerformed',
  'sandboxMerchantConnected','liveCheckout'])assert.equal(data[k],false);
 assert.equal(data.externalProviderCalls,0);
 for(const secret of ['requestId','merchantId','synthetic-merchant','client_secret',
  'access_token','Bearer ','PayerID'])assert.equal(JSON.stringify(data).includes(secret),false);
});
test('AI Work and Global Services share source-bound quote amount and version',async()=>{
 for(const [version,minor,amount] of [[2,1500,'15.00'],[6,2900,'29.00']]){
  const db=createMemoryQuoteRepository([q(version)]);
  await db.approve({id:'sample-project',actorId:'synthetic-owner',
   expectedVersion:version,amountMinor:minor});
  const data=await (await api(db)(req())).json();
  assert.equal(data.quoteVersion,version);assert.equal(data.amount,amount);
  assert.equal(data.externalProviderCalls,0);
 }
});
test('reviewer, foreign merchant or unverified persona cannot inspect plan',async()=>{
 const db=createMemoryQuoteRepository([q()]);
 await db.approve({id:'sample-project',actorId:'synthetic-owner',
  expectedVersion:1,amountMinor:1500});
 for(const user of [{verified:true,actorId:'synthetic-reviewer',merchantId:'synthetic-merchant'},
  {verified:false,actorId:'synthetic-owner',merchantId:'synthetic-merchant'},
  {verified:true,actorId:'synthetic-owner',merchantId:'wrong-merchant'},null]){
  const result=await api(db,()=>user)(req());
  assert.equal(result.status,404);
 }
});
test('stale approval and invalid amount never generate a plan',async()=>{
 for(const approval of [
  {decision:'APPROVED',actorId:'synthetic-owner',quoteVersion:1,amountMinor:2900},
  {decision:'APPROVED',actorId:'synthetic-owner',quoteVersion:2,amountMinor:0}
 ]){
  const db={get:async()=>({...q(2),status:'APPROVED',approval})};
  assert.equal((await api(db)(req())).status,503);
 }
});

test('quote-bound fake PayPal lifecycle uses the SAME human-approved amount and no HTTP',async()=>{
 for(const [version,minor,amount] of [[2,1500,'15.00'],[6,2900,'29.00']]){
  const db=createMemoryQuoteRepository([q(version)]);
  await db.approve({id:'sample-project',actorId:'synthetic-owner',
    expectedVersion:version,amountMinor:minor});
  const response=await api(db)(req());
  assert.equal(response.status,200);
  const plan=await response.json(),trace=plan.quoteBoundFakeFlow;
  assert.equal(trace.mode,'PURE_DOMAIN_FAKE_PAYPAL_EVENTS_NO_HTTP');
  assert.equal(trace.quoteVersion,version);
  assert.equal(trace.amountMinor,minor);
  assert.equal(trace.amount,amount);
  assert.deepEqual(trace.steps,[
    'STORED_HUMAN_APPROVAL','ORDER_CREATE_PLANNED_NOT_SENT',
    'FICTIONAL_BUYER_PENDING','EARLY_CAPTURE_BLOCKED',
    'FICTIONAL_BUYER_APPROVED','CAPTURE_PLANNED_NOT_SENT',
    'FICTIONAL_GET_COMPLETED','FOREIGN_AMOUNT_BLOCKED',
    'FAKE_DOMAIN_RECONCILIATION_MATCHED']);
  assert.equal(trace.blockedPrematureCapture,true);
  assert.equal(trace.blockedMismatchedCapture,true);
  assert.equal(trace.fakeDomainReconcilePassed,true);
  assert.deepEqual([trace.providerCalls,trace.paymentPosts,trace.ledgerMutations],[0,0,0]);
  assert.equal(trace.paymentWasReal,false);
  assert.equal(trace.buyerApprovalWasReal,false);
 }
});
test('no fake lifecycle or synthetic Capture plan is exposed before human quote approval',async()=>{
 const db=createMemoryQuoteRepository([q(2)]);
 const unapproved=await api(db)(req());
 assert.equal(unapproved.status,409);
 const data=await unapproved.json();
 assert.equal(Object.hasOwn(data,'quoteBoundFakeFlow'),false);
});
