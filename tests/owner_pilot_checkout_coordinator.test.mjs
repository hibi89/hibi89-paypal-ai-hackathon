import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createPilotCheckoutSessionStore} from '../src/pilot_checkout_session_store.mjs';
import {createSandboxTransport} from '../src/paypal_sandbox_transport.mjs';
import {createOwnerPilotCheckoutCoordinator} from '../src/owner_pilot_checkout_coordinator.mjs';

const merchantId='A1B2C3D4E5F6G';
const ctx={quoteId:'owner-pilot',actorId:'owner',merchantId,
  publicOrigin:'https://checkout.example.org'};
function fixture({createLost=false,captureLost=false,badMerchant=false}={}){
 const folder=mkdtempSync(join(tmpdir(),'owner-pilot-coordinator-'));
 const ledger=createSqliteLedger({filename:join(folder,'ledger.sqlite')});
 const sessions=createPilotCheckoutSessionStore({filename:join(folder,'sessions.sqlite')});
 const calls=[],authorizations=[],state={buyerApproved:false,captured:false,createLost,captureLost};
 const transport=createSandboxTransport({
  clientId:'INJECTED_FAKE_CLIENT',clientSecret:'INJECTED_FAKE_SECRET',
  async fetchImpl(url,options){
   const path=new URL(url).pathname;
   calls.push({path,method:options.method,body:options.body});
   if(path==='/v1/oauth2/token')return {status:200,
     json:async()=>({access_token:'FAKE_TOKEN',token_type:'Bearer'})};
   if(path==='/v2/checkout/orders'&&options.method==='POST'){
     if(state.createLost)throw Error('SIMULATED_UNKNOWN_POST');
     return {status:201,json:async()=>({
       id:'OWNERPILOT1',status:'PAYER_ACTION_REQUIRED',
       links:[{rel:'payer-action',
         href:'https://www.sandbox.paypal.com/checkoutnow?token=OWNERPILOT1'}]
     })};
   }
   if(path==='/v2/checkout/orders/OWNERPILOT1'&&options.method==='GET'){
     const status=state.captured?'COMPLETED':state.buyerApproved?'APPROVED':'PAYER_ACTION_REQUIRED';
     return {status:200,json:async()=>({
       id:'OWNERPILOT1',intent:'CAPTURE',status,
       purchase_units:[{reference_id:'owner-pilot',
         payee:{merchant_id:badMerchant?'ZZZZZZZZZZZZZ':merchantId},
         amount:{currency_code:'USD',value:'1.50'},
         ...(state.captured?{payments:{captures:[{
           id:'CAPTUREPILOT1',status:'COMPLETED',
           amount:{currency_code:'USD',value:'1.50'}
         }]}}:{})
       }]
     })};
   }
   if(path==='/v2/checkout/orders/OWNERPILOT1/capture'&&options.method==='POST'){
     state.captured=true;
     if(state.captureLost)throw Error('SIMULATED_LOST_CAPTURE_REPLY');
     return {status:201,json:async()=>({id:'OWNERPILOT1',status:'COMPLETED'})};
   }
   throw Error('UNEXPECTED_FAKE_TRANSPORT_PATH '+path);
  }
 });
 const authorizeAction=async action=>{
   authorizations.push(action);
   return state.authorize!==false;
 };
 let proof,token;
 async function seed(){
  await ledger.insertQuote({id:'owner-pilot',ownerId:'owner',merchantId,version:2});
  await ledger.approve({id:'owner-pilot',actorId:'owner',
    expectedVersion:2,amountMinor:150});
  const quote=await ledger.get('owner-pilot');
  const principal={verified:true,actorId:'owner',merchantId};
  token=sessions.issue({quote,principal}).token;
  proof=sessions.verify({token,quote,principal});
 }
 function service(){return createOwnerPilotCheckoutCoordinator({ledger,transport,authorizeAction})}
 function input(){return {...ctx,sessionProof:proof}}
 function count(method,path){return calls.filter(c=>c.method===method&&c.path===path).length}
 return {ledger,sessions,calls,authorizations,state,seed,service,input,count,
   get token(){return token},
   async revoke(){
     const quote=await ledger.get('owner-pilot');
     sessions.revoke({token,quote,principal:{verified:true,actorId:'owner',merchantId}});
   },
   close(){sessions.close();ledger.close();rmSync(folder,{recursive:true,force:true})}
 };
}
const withFixture=(options,run)=>async()=>{
 const f=fixture(options);try{await f.seed();await run(f)}finally{f.close()}
};
test('pilot coordinator is internal only and requires an injected trusted host approval callback',()=>{
 assert.throws(()=>createOwnerPilotCheckoutCoordinator({}),
   {code:'TRUSTED_OWNER_AUTHORIZER_REQUIRED'});
 const f=fixture();try{
  assert.equal(f.service().publicHttpEnabled,false);
  assert.equal(f.service().productionAuthConfigured,false);
  assert.equal(Object.hasOwn(f.service(),'publicRoute'),false);
 }finally{f.close()}
});
test('untrusted owner/merchant/proof/callback/approval block all provider and ledger attempts',
 withFixture({},async f=>{
   const service=f.service();
   const bads=[
     {...f.input(),actorId:'intruder'},
     {...f.input(),merchantId:'OTHERSELLER01'},
     {...f.input(),sessionProof:{verified:true}},
     {...f.input(),publicOrigin:'http://localhost:3000'},
   ];
   for(const input of bads)
     await assert.rejects(service.openOwnerOrder(input));
   f.state.authorize=false;
   await assert.rejects(service.openOwnerOrder(f.input()),
     {code:'OWNER_EXPLICIT_ACTION_AUTHORIZATION_REQUIRED'});
   assert.equal(f.calls.length,0);
   assert.deepEqual(await f.ledger.listAttempts('owner-pilot'),[]);
 }));
test('bounded real transport contract: synthetic buyer pending -> authorized capture -> provider GET PAID',
 withFixture({},async f=>{
   const s=f.service();
   const opened=await s.openOwnerOrder(f.input());
   assert.equal(opened.status,'BUYER_APPROVAL_PENDING');
   assert.equal(opened.providerGetChecked,true);
   assert.equal(opened.paymentState,'NOT_PAID');
   assert.match(opened.approvalUrl,/sandbox\.paypal\.com/);
   assert.equal(f.count('POST','/v2/checkout/orders'),1);
   assert.equal(f.count('POST','/v2/checkout/orders/OWNERPILOT1/capture'),0);
   assert.equal((await s.refreshOwnerOrder(f.input())).status,'BUYER_APPROVAL_PENDING');
   const repeat=await s.openOwnerOrder(f.input());
   assert.equal(repeat.status,'BUYER_APPROVAL_PENDING');
   assert.equal(repeat.approvalUrl,null);
   assert.equal(f.count('POST','/v2/checkout/orders'),1);
   f.state.authorize=false;
   await assert.rejects(s.captureOwnerOrder(f.input()),
     {code:'OWNER_EXPLICIT_ACTION_AUTHORIZATION_REQUIRED'});
   assert.equal(f.count('POST','/v2/checkout/orders/OWNERPILOT1/capture'),0);
   f.state.authorize=true;
   const premature=await s.captureOwnerOrder(f.input());
   assert.equal(premature.status,'BUYER_APPROVAL_PENDING');
   assert.equal(f.count('POST','/v2/checkout/orders/OWNERPILOT1/capture'),0);
   f.state.buyerApproved=true;
   const paid=await s.captureOwnerOrder(f.input());
   assert.equal(paid.status,'PAID');
   assert.equal(paid.paymentState,'VERIFIED_BY_GET');
   assert.equal(paid.captureId,'CAPTUREPILOT1');
   assert.equal(f.count('POST','/v2/checkout/orders/OWNERPILOT1/capture'),1);
   assert.equal((await s.reconcileOwnerCapture(f.input())).status,'PAID');
   assert.equal((await s.captureOwnerOrder(f.input())).status,'PAID');
   assert.equal(f.count('POST','/v2/checkout/orders/OWNERPILOT1/capture'),1);
   assert.deepEqual(f.authorizations.map(a=>a.operation).filter(x=>x==='CAPTURE_SANDBOX_ORDER'),
     Array(4).fill('CAPTURE_SANDBOX_ORDER'));
 }));
test('ambiguous CREATE remains durable UNKNOWN, repeat never re-POSTs',
 withFixture({createLost:true},async f=>{
   const s=f.service();
   const first=await s.openOwnerOrder(f.input());
   assert.equal(first.status,'UNKNOWN');
   assert.equal(first.retryPost,false);
   const again=await s.openOwnerOrder(f.input());
   assert.equal(again.status,'UNKNOWN');
   assert.equal(f.count('POST','/v2/checkout/orders'),1);
   assert.equal((await f.ledger.listAttempts('owner-pilot'))[0].state,'UNKNOWN');
 }));
test('ambiguous CAPTURE can only reconcile with provider GET, no repeat POST',
 withFixture({captureLost:true},async f=>{
   const s=f.service();
   await s.openOwnerOrder(f.input());
   f.state.buyerApproved=true;
   const paid=await s.captureOwnerOrder(f.input());
   assert.equal(paid.status,'PAID');
   assert.equal(f.count('POST','/v2/checkout/orders/OWNERPILOT1/capture'),1);
   assert.equal((await s.captureOwnerOrder(f.input())).status,'PAID');
   assert.equal(f.count('POST','/v2/checkout/orders/OWNERPILOT1/capture'),1);
 }));
test('revoked checkout proof blocks refresh and capture even if order was created',
 withFixture({},async f=>{
   const s=f.service();
   await s.openOwnerOrder(f.input());
   await f.revoke();
   const prior=f.calls.length;
   await assert.rejects(s.refreshOwnerOrder(f.input()),
     {code:'PILOT_SESSION_NOT_VERIFIED'});
   await assert.rejects(s.captureOwnerOrder(f.input()),
     {code:'PILOT_SESSION_NOT_VERIFIED'});
   assert.equal(f.calls.length,prior);
   assert.equal(f.count('POST','/v2/checkout/orders/OWNERPILOT1/capture'),0);
 }));
test('wrong merchant in provider GET never persists approval or false payment',
 withFixture({badMerchant:true},async f=>{
   const s=f.service();
   assert.equal((await s.openOwnerOrder(f.input())).status,'UNKNOWN');
   assert.equal(f.count('POST','/v2/checkout/orders'),1);
   assert.equal((await f.ledger.listAttempts('owner-pilot'))[0].state,'UNKNOWN');
   assert.equal((await f.ledger.listAttempts('owner-pilot'))[0].remoteId,null);
   assert.equal((await s.openOwnerOrder(f.input())).status,'UNKNOWN');
   assert.equal(f.count('POST','/v2/checkout/orders'),1);
 }));
