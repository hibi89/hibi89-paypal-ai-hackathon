// P0 full synthetic source-to-payment acceptance rehearsal.
// NO PayPal/Gemini network, no public API or provider credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createQuoteApi} from '../src/quote_api.mjs';
import {createSandboxTransport} from '../src/paypal_sandbox_transport.mjs';
import {createSandboxPaymentOrchestrator} from '../src/payment_orchestrator.mjs';

const ctx={quoteId:'quote1',actorId:'owner',merchantId:'merchant'};
const scope='Build an entirely synthetic freelancer design website';
const draft=()=>new Request('https://offline.test/api/quotes/quote1/draft',{
 method:'POST',headers:{origin:'https://offline.test',
  'x-csrf-token':'local-csrf','content-type':'application/json'},
 body:JSON.stringify({scope,expectedVersion:2,externalAiConsent:true})
});
const approve=(version,amountMinor)=>new Request('https://offline.test/api/quotes/quote1/approve',{
 method:'POST',headers:{origin:'https://offline.test',
  'x-csrf-token':'local-csrf','content-type':'application/json'},
 body:JSON.stringify({expectedVersion:version,confirmed:true,amountMinor})
});
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'paypal-ai-approval-chain-'));
 const db=createSqliteLedger({filename:join(dir,'test.sqlite')});
 const state={buyerApproved:false,captured:false};
 const calls=[];
 const fetchImpl=async(url,options)=>{
  const path=new URL(url).pathname;
  calls.push({path,method:options.method});
  if(path==='/v1/oauth2/token')
   return {status:200,json:async()=>({access_token:'OFFLINE_TOKEN',token_type:'Bearer'})};
  if(path==='/v2/checkout/orders'&&options.method==='POST'){
   const payload=JSON.parse(options.body);
   // Human $15.00 amount, not the AI $99.00 suggested amount.
   assert.equal(payload.purchase_units[0].amount.value,'15.00');
   return {status:201,json:async()=>({id:'ORDER1',status:'CREATED',links:[{
    rel:'payer-action',href:'https://www.sandbox.paypal.com/checkoutnow?token=ORDER1'
   }]})};
  }
  if(path==='/v2/checkout/orders/ORDER1'&&options.method==='GET'){
   const status=state.captured?'COMPLETED':state.buyerApproved?'APPROVED':'CREATED';
   return {status:200,json:async()=>({id:'ORDER1',status,intent:'CAPTURE',
    purchase_units:[{reference_id:'quote1',payee:{merchant_id:'merchant'},
     amount:{currency_code:'USD',value:'15.00'},
     ...(state.captured?{payments:{captures:[{
      id:'CAPTURE1',status:'COMPLETED',
      amount:{currency_code:'USD',value:'15.00'}
     }]}}:{})}]})};
  }
  if(path==='/v2/checkout/orders/ORDER1/capture'&&options.method==='POST'){
   state.captured=true;
   return {status:201,json:async()=>({id:'ORDER1',status:'COMPLETED'})};
  }
  throw Error('UNEXPECTED_LOCAL_TEST_ROUTE');
 };
 const transport=createSandboxTransport({clientId:'SYNTHETIC_ID',
   clientSecret:'SYNTHETIC_SECRET',fetchImpl});
 let aiCalls=0;
 const fakeGemini=async()=>{aiCalls++;return {source:'GEMINI_API',suggestedMinor:9900};};
 Object.defineProperty(fakeGemini,'requiresExternalConsent',{value:true});
 const api=createQuoteApi({repository:db,
  resolveSession:async()=>({verified:true,actorId:'owner',merchantId:'merchant',csrfToken:'local-csrf'}),
  authorizeExternalAi:async()=>true,allowAiPricingExperiment:true,
  draftProvider:fakeGemini});
 return {db,api,calls,state,get aiCalls(){return aiCalls;},
  payment:()=>createSandboxPaymentOrchestrator({ledger:db,transport}),
  close(){db.close();rmSync(dir,{recursive:true,force:true})}};
}
test('synthetic AI proposal -> owner approval -> verified order -> buyer -> capture GET PAID',async()=>{
 const f=fixture();try{
  await f.db.insertQuote({id:'quote1',ownerId:'owner',merchantId:'merchant',version:2});
  assert.equal((await f.api(draft())).status,200);
  const q0=await f.db.get('quote1');
  assert.equal(q0.suggestionSource,'GEMINI_API');
  assert.equal(q0.aiSuggestedMinor,9900);
  assert.equal(q0.version,3);
  assert.equal(q0.approval,null);
  assert.equal(f.aiCalls,1);
  assert.equal(f.calls.length,0);
  await assert.rejects(f.payment().openOrder(ctx),{code:'HUMAN_APPROVAL_REQUIRED'});
  assert.equal((await f.api(approve(2,1500))).status,409);
  assert.equal((await f.api(approve(3,1500))).status,200);
  const human=await f.db.get('quote1');
  assert.equal(human.approval.amountMinor,1500);
  assert.equal((await f.payment().openOrder(ctx)).status,'BUYER_APPROVAL_PENDING');
  assert.equal((await f.payment().captureApproved(ctx)).status,'BUYER_APPROVAL_PENDING');
  assert.equal(f.calls.filter(x=>x.path.endsWith('/capture')).length,0);
  f.state.buyerApproved=true;
  const paid=await f.payment().captureApproved(ctx);
  assert.equal(paid.status,'PAID');
  assert.equal(paid.captureId,'CAPTURE1');
  assert.equal(f.calls.filter(x=>x.method==='POST'&&x.path==='/v2/checkout/orders').length,1);
  assert.equal(f.calls.filter(x=>x.method==='POST'&&x.path.endsWith('/capture')).length,1);
  assert.equal((await f.payment().captureApproved(ctx)).status,'PAID');
  assert.equal(f.aiCalls,1);
  assert.equal((await f.db.getAiDraftAttempt({id:'quote1',expectedVersion:2})).state,
    'COMMITTED');
 }finally{f.close();}
});
