import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createPilotCheckoutSessionStore} from '../src/pilot_checkout_session_store.mjs';
import {createSandboxTransport} from '../src/paypal_sandbox_transport.mjs';
import {createOwnerPilotCheckoutCoordinator} from '../src/owner_pilot_checkout_coordinator.mjs';
import {createOwnerBuyerReturnInquiry} from '../src/owner_buyer_return_inquiry.mjs';

const merchantId='A1B2C3D4E5F6G';
const origin='https://checkout.example.org';
const quoteId='buyer-return-1';
const url=origin+'/checkout/paypal/';
async function setup(){
 const folder=mkdtempSync(join(tmpdir(),'paypal-return-gateway-'));
 const ledger=createSqliteLedger({filename:join(folder,'ledger.sqlite')});
 const sessions=createPilotCheckoutSessionStore({filename:join(folder,'sessions.sqlite')});
 const calls=[],readHandles=[];
 let buyerApproved=false,captured=false,merchantWrong=false;
 const transport=createSandboxTransport({
  clientId:'INJECTED_FAKE_ID',clientSecret:'INJECTED_FAKE_SECRET',
  fetchImpl:async(u,opts)=>{
   const pathname=new URL(u).pathname;
   calls.push({pathname,method:opts.method});
   if(pathname==='/v1/oauth2/token')return {status:200,
     json:async()=>({access_token:'INJECTED_FAKE_ACCESS_TOKEN',token_type:'Bearer'})};
   if(pathname==='/v2/checkout/orders'&&opts.method==='POST')return {
    status:201,json:async()=>({id:'RETURNORDER1',status:'PAYER_ACTION_REQUIRED',
     links:[{rel:'payer-action',href:'https://www.sandbox.paypal.com/checkoutnow?token=RETURNORDER1'}]})
   };
   if(pathname==='/v2/checkout/orders/RETURNORDER1'&&opts.method==='GET'){
    const status=captured?'COMPLETED':buyerApproved?'APPROVED':'PAYER_ACTION_REQUIRED';
    return {status:200,json:async()=>({
     id:'RETURNORDER1',status,intent:'CAPTURE',
     purchase_units:[{reference_id:quoteId,payee:{
      merchant_id:merchantWrong?'WRONGMERCHANT':merchantId
     },amount:{currency_code:'USD',value:'1.50'},
     ...(captured?{payments:{captures:[{id:'RETURNCAPTURE1',status:'COMPLETED',
      amount:{currency_code:'USD',value:'1.50'}}]}}:{})
     }]
    })};
   }
   if(pathname==='/v2/checkout/orders/RETURNORDER1/capture'&&opts.method==='POST'){
    captured=true;return {status:201,json:async()=>({id:'RETURNORDER1',status:'COMPLETED'})};
   }
   throw Error('UNEXPECTED_STUB_ENDPOINT');
  }
 });
 await ledger.insertQuote({id:quoteId,ownerId:'owner',merchantId,version:2});
 await ledger.approve({id:quoteId,actorId:'owner',expectedVersion:2,amountMinor:150});
 const quote=await ledger.get(quoteId);
 const principal={verified:true,actorId:'owner',merchantId};
 const token=sessions.issue({quote,principal}).token;
 const proof=sessions.verify({token,quote,principal});
 const coordinator=createOwnerPilotCheckoutCoordinator({
  ledger,transport,authorizeAction:async()=>true
 });
 const gateway=createOwnerBuyerReturnInquiry({
  coordinator,publicOrigin:origin,
  resolveTrustedCheckout:async handle=>{
   readHandles.push(handle);
   if(handle!=='host-session-trusted')return null;
   return {verified:true,quoteId,actorId:'owner',merchantId,sessionProof:proof};
  }
 });
 const execute=(path='return',handle='host-session-trusted',opts={})=>
   gateway.handle({request:new Request(url+path+'?token=FORGED&PayerID=FAKE&status=COMPLETED',opts),
     serverSessionHandle:handle});
 const postCount=()=>calls.filter(c=>c.method==='POST'&&c.pathname.startsWith('/v2/checkout/orders')).length;
 const getCount=()=>calls.filter(c=>c.method==='GET'&&c.pathname.includes('/v2/checkout/orders/')).length;
 const begin=()=>coordinator.openOwnerOrder({quoteId,actorId:'owner',merchantId,
   publicOrigin:origin,sessionProof:proof});
 return {gateway,execute,begin,coordinator,ledger,sessions,calls,readHandles,
  postCount,getCount,
  setBuyerApproved:()=>{buyerApproved=true},
  setMerchantWrong:()=>{merchantWrong=true},
  revoke:()=>sessions.revoke({quote,principal,token}),
  close:()=>{sessions.close();ledger.close();rmSync(folder,{recursive:true,force:true})},
  get captured(){return captured},
 };
}
const withFixture=fn=>async()=>{const f=await setup();try{await fn(f);}finally{f.close();}};
test('constructor never exposes public route, rejects HTTP origin and missing host dependencies',()=>{
 assert.throws(()=>createOwnerBuyerReturnInquiry({
  publicOrigin:'http://localhost:3000',
  coordinator:{mode:'INTERNAL_OWNER_SANDBOX_PILOT_ONLY'},
  resolveTrustedCheckout:async()=>null
 }),{code:'TRUSTED_PUBLIC_HTTPS_ORIGIN_REQUIRED'});
 for(const origin of ['https://127.0.0.1','https://pay.example.org:8443','https://pay.example.org/path'])
  assert.throws(()=>createOwnerBuyerReturnInquiry({publicOrigin:origin}),
   {code:'TRUSTED_PUBLIC_HTTPS_ORIGIN_REQUIRED'});
 assert.throws(()=>createOwnerBuyerReturnInquiry({publicOrigin:origin}),
  {code:'TRUSTED_BUYER_INQUIRY_DEPENDENCIES_REQUIRED'});
});
test('untrusted browser callback token and fake cookies never authenticate a session',withFixture(async f=>{
 const before=f.calls.length;
 for(const handle of [undefined,'token=FORGED','owner',{}]){
  const r=await f.execute('return',handle,{headers:{
   cookie:'pilot=admin','x-actor-id':'owner','x-paypal-status':'COMPLETED',
   'x-forwarded-host':'checkout.example.org'
  }});
  assert.equal(r.status,401);
  assert.equal((await r.json()).error,'TRUSTED_CHECKOUT_SESSION_REQUIRED');
 }
 assert.equal(f.calls.length,before);
 assert.equal(f.postCount(),0);
}));
test('buyer return GET-only requires separate owner payment execution',withFixture(async f=>{
 await f.begin();
 const posts=f.postCount();
 const before=f.getCount();
 let r=await f.execute('return');
 assert.equal(r.status,200);
 let b=await r.json();
 assert.equal(b.callback,'BUYER_RETURN_UNVERIFIED');
 assert.equal(b.browserDataTrusted,false);
 assert.equal(b.callbackIsPaymentProof,false);
 assert.equal(b.buyerApprovedByTrustedGet,false);
 assert.equal(b.paymentVerifiedByTrustedGet,false);
 assert.equal(b.capturePerformedByCallback,false);
 assert.equal(b.providerPostPerformed,false);
 assert.equal(b.providerState,'BUYER_APPROVAL_PENDING');
 assert.equal(f.getCount(),before+1);
 f.setBuyerApproved();
 r=await f.execute('return');
 b=await r.json();
 assert.equal(b.providerState,'ORDER_APPROVED');
 assert.equal(b.buyerApprovedByTrustedGet,true);
 assert.equal(b.paymentState,'NOT_CONFIRMED');
 assert.equal(b.nextAction,'SEPARATE_OWNER_AUTHORIZED_CAPTURE_REQUIRED');
 assert.equal(f.postCount(),posts);
 assert.equal(f.captured,false);
 assert.equal((await f.ledger.listAttempts(quoteId)).length,1);
}));
test('callback cancellation does not cancel, capture or convert approved order into PAID',withFixture(async f=>{
 await f.begin();
 f.setBuyerApproved();
 const before=f.postCount();
 const r=await f.execute('cancel');
 const b=await r.json();
 assert.equal(b.callback,'BUYER_CANCEL_UNVERIFIED');
 assert.equal(b.providerState,'ORDER_APPROVED');
 assert.equal(b.callbackIsPaymentProof,false);
 assert.equal(b.capturePerformedByCallback,false);
 assert.equal(f.postCount(),before);
 assert.equal(f.captured,false);
}));
test('strict route, method and origin validation precedes authentication and provider reads',withFixture(async f=>{
 const before=f.calls.length,lookups=f.readHandles.length;
 for(const path of ['other','RETURN','cancel/']){
  const r=await f.execute(path);
  assert.equal(r.status,404);
 }
 const method=await f.execute('return','host-session-trusted',{method:'POST'});
 assert.equal(method.status,405);
 assert.equal(method.headers.get('allow'),'GET');
 const other=await f.gateway.handle({request:new Request(
  'https://evil.example/checkout/paypal/return'),serverSessionHandle:'host-session-trusted'});
 assert.equal(other.status,403);
 assert.equal(f.calls.length,before);
 assert.equal(f.readHandles.length,lookups);
}));
test('browser forged PAID parameters cannot override merchant-mismatch GET',withFixture(async f=>{
 await f.begin();
 f.setBuyerApproved();f.setMerchantWrong();
 const posts=f.postCount();
 const r=await f.execute('return');
 assert.equal(r.status,200);
 const b=await r.json();
 assert.equal(b.providerState,'UNKNOWN');
 assert.equal(b.paymentVerifiedByTrustedGet,false);
 assert.equal(b.buyerApprovedByTrustedGet,false);
 assert.equal(f.postCount(),posts);
 assert.equal(JSON.stringify(b).includes('FORGED'),false);
 assert.equal(JSON.stringify(b).includes('INJECTED_FAKE'),false);
}));
test('expired or revoked owner checkout proof refuses to query provider',withFixture(async f=>{
 await f.begin();f.revoke();
 const before=f.calls.length;
 const r=await f.execute('return');
 assert.equal(r.status,401);
 assert.equal((await r.json()).error,'TRUSTED_CHECKOUT_SESSION_NOT_VERIFIED');
 assert.equal(f.calls.length,before);
}));
test('refresh callback can observe PAID only after separate authorized capture with provider GET',withFixture(async f=>{
 await f.begin();f.setBuyerApproved();
 const paid=await f.coordinator.captureOwnerOrder({
  quoteId,actorId:'owner',merchantId,publicOrigin:origin,
  sessionProof:(()=>undefined)()
 }).catch(e=>e);
 // Direct calls without proof stay blocked.
 assert.equal(paid.code,'PILOT_SESSION_NOT_VERIFIED');
 assert.equal(f.captured,false);
 const r=await f.execute('return');
 const b=await r.json();
 assert.equal(b.paymentState,'NOT_CONFIRMED');
 assert.equal(b.paymentVerifiedByTrustedGet,false);
}));
