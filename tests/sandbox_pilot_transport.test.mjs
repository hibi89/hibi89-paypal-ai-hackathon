import test,{after} from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createPilotCheckoutSessionStore} from '../src/pilot_checkout_session_store.mjs';
import assert from 'node:assert/strict';
import {createSandboxTransport} from '../src/paypal_sandbox_transport.mjs';
import {requestKey, paypalRequestHeaderId} from '../src/payment_contract.mjs';

// All data, merchant, hostname and PayPal responses in this fixture are fake.
// All requests go to an INJECTED stub, never fetch/global/network.
const q={id:'quote-pilot',ownerId:'owner',merchantId:'A1B2C3D4E5F6G',
  version:2,currency:'USD',status:'APPROVED',
  approval:{decision:'APPROVED',actorId:'owner',quoteVersion:2,amountMinor:150}};
const tmp=mkdtempSync(join(tmpdir(),'pilot-transport-session-'));
const sessionStore=createPilotCheckoutSessionStore({filename:join(tmp,'session.sqlite')});
const principal={verified:true,actorId:q.ownerId,merchantId:q.merchantId};
const {token}=sessionStore.issue({quote:q,principal});
const sessionProof=sessionStore.verify({token,quote:q,principal});
const ctx={publicOrigin:'https://checkout.example.org',sessionProof};
after(()=>{sessionStore.close();rmSync(tmp,{recursive:true,force:true})});
const claim=(quote=q)=>({action:'FIRST_CLAIM_ONLY_NO_PROVIDER_CALL',attempt:{
  operation:'create',quoteId:quote.id,quoteVersion:quote.version,
  merchantId:quote.merchantId,requestId:requestKey(quote,'create'),
  amountMinor:quote.approval.amountMinor,currency:quote.currency,state:'IN_FLIGHT'
}});
function fixture({postFailure=false,badGet=false}={}){
 const calls=[];
 const transport=createSandboxTransport({
  clientId:'OFFLINE_CLIENT',clientSecret:'OFFLINE_SECRET',
  fetchImpl:async(url,options)=>{
   const path=new URL(url).pathname;
   calls.push({url,method:options.method,headers:options.headers,body:options.body});
   if(path==='/v1/oauth2/token')
     return {status:200,json:async()=>({access_token:'OFFLINE_TOKEN',token_type:'Bearer'})};
   if(options.method==='POST'&&path==='/v2/checkout/orders'){
     if(postFailure)return {status:503,json:async()=>({})};
     return {status:201,json:async()=>({
       id:'PILOTORDER1',status:'PAYER_ACTION_REQUIRED',
       links:[{rel:'payer-action',
         href:'https://www.sandbox.paypal.com/checkoutnow?token=PILOTORDER1'}]})};
   }
   if(options.method==='GET'&&path==='/v2/checkout/orders/PILOTORDER1')
     return {status:200,json:async()=>({
       id:'PILOTORDER1',status:'PAYER_ACTION_REQUIRED',intent:'CAPTURE',
       purchase_units:[{reference_id:q.id,payee:{merchant_id:
        badGet?'OTHERSELLERID':q.merchantId},
        amount:{currency_code:'USD',value:'1.50'}}]})};
   throw Error('UNEXPECTED_ROUTE_IN_TEST');
  }
 });
 return {transport,calls};
}
const countCreate=calls=>calls.filter(x=>x.method==='POST'&&
  x.url.endsWith('/v2/checkout/orders')).length;

test('explicit pilot method sends one capped PayPal wallet payload then verifies GET',async()=>{
 const {transport,calls}=fixture();
 const x=await transport.createOwnerPilotOrderOnce(q,claim(),ctx);
 assert.equal(x.orderId,'PILOTORDER1');
 assert.equal(x.orderStatus,'PAYER_ACTION_REQUIRED');
 assert.equal(x.paymentState,'NOT_PAID');
 assert.equal(countCreate(calls),1);
 assert.equal(calls.filter(c=>c.method==='GET').length,1);
 assert.ok(calls.every(c=>c.url.startsWith('https://api-m.sandbox.paypal.com/')));
 const create=calls.find(c=>c.method==='POST'&&c.url.endsWith('/v2/checkout/orders'));
 const body=JSON.parse(create.body);
 assert.equal(body.purchase_units[0].amount.value,'1.50');
 assert.equal(body.purchase_units[0].payee.merchant_id,q.merchantId);
 assert.equal(body.payment_source.paypal.experience_context.return_url,
   'https://checkout.example.org/checkout/paypal/return');
 assert.equal(body.payment_source.paypal.experience_context.cancel_url,
   'https://checkout.example.org/checkout/paypal/cancel');
 assert.equal(create.headers['PayPal-Request-Id'],
   paypalRequestHeaderId(requestKey(q,'create')));
 assert.equal(Buffer.byteLength(create.headers['PayPal-Request-Id'],'utf8'),38);
 assert.ok(!JSON.stringify(x).includes('OFFLINE_TOKEN'));
 assert.ok(!JSON.stringify(x).includes(token));
});

test('pilot rejects missing claim before any provider OAuth',async()=>{
 const {transport,calls}=fixture();
 await assert.rejects(transport.createOwnerPilotOrderOnce(q,{},ctx),
  {code:'DURABLE_FIRST_CLAIM_REQUIRED'});
 assert.equal(calls.length,0);
});

test('pilot rejects fake merchant, extra amount, forged session or HTTP callback pre-network',async()=>{
 const variations=[
  [{...q,merchantId:'sandbox_merchant'},ctx,'PILOT_SESSION_NOT_VERIFIED'],
  [{...q,approval:{...q.approval,amountMinor:300}},ctx,'PILOT_SESSION_NOT_VERIFIED'],
  [q,{...ctx,sessionProof:{verified:true}},'PILOT_SESSION_NOT_VERIFIED'],
  [q,{...ctx,sessionProof:{...sessionProof}},'PILOT_SESSION_NOT_VERIFIED'],
  [q,{...ctx,publicOrigin:'http://localhost:3000'},'PUBLIC_HTTPS_ORIGIN_REQUIRED']
 ];
 for(const [quote,config,code] of variations){
   const {transport,calls}=fixture();
   await assert.rejects(transport.createOwnerPilotOrderOnce(quote,claim(quote),config),{code});
   assert.equal(calls.length,0);
 }
});

test('pilot failed create POST is UNKNOWN and is never retried',async()=>{
 const {transport,calls}=fixture({postFailure:true});
 await assert.rejects(transport.createOwnerPilotOrderOnce(q,claim(),ctx),
  {code:'SANDBOX_POST_OUTCOME_UNKNOWN'});
 assert.equal(countCreate(calls),1);
 assert.equal(calls.filter(x=>x.method==='GET').length,0);
});

test('pilot GET mismatch never yields buyer approval link for wrong merchant',async()=>{
 const {transport,calls}=fixture({badGet:true});
 await assert.rejects(transport.createOwnerPilotOrderOnce(q,claim(),ctx),
  {code:'SANDBOX_ORDER_MISMATCH'});
 assert.equal(countCreate(calls),1);
 assert.equal(calls.filter(x=>x.method==='GET').length,1);
});

test('pilot path is opt-in and public payment transport stays Sandbox-only',()=>{
 const {transport}=fixture();
 assert.equal(transport.mode,'SANDBOX_ONLY');
 assert.equal(transport.realAccessTested,false);
 assert.equal(typeof transport.createOwnerPilotOrderOnce,'function');
 assert.equal(Object.hasOwn(transport,'live'),false);
 assert.equal(Object.hasOwn(transport,'createPublicHttpRoute'),false);
});
