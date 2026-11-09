// Same-quote private A2A → human consent → PayPal-shaped Sandbox flow.
// All HTTP provider functions are injected fakes. No external network, card,
// real Gemini inference, PayPal transaction or permission to auto-pay.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createOwnerPrivateGeminiInnovationLab} from '../src/owner_private_gemini_innovation_lab.mjs';
import {createMarketplaceIdentityPolicy} from '../src/marketplace_identity_policy.mjs';
import {createCrossPartReviewBridge} from '../src/cross_part_review_bridge.mjs';
import {createPilotCheckoutSessionStore} from '../src/pilot_checkout_session_store.mjs';
import {createSandboxTransport} from '../src/paypal_sandbox_transport.mjs';
import {createOwnerPilotCheckoutCoordinator} from '../src/owner_pilot_checkout_coordinator.mjs';

const actor='owner',merchant='A1B2C3D4E5F6G',quoteId='a2a-pilot';
const fakeGemini=(action,amountMinor)=>new Response(JSON.stringify({
 candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({
  action,amountMinor
 })}]}}],
 usageMetadata:{totalTokenCount:40}
}),{status:200,headers:{'content-type':'application/json'}});

test('same $1.50 private AI agreement, human approval and fake Sandbox GET-proof share ONE quote',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'worknova-same-quote-pilot-'));
 let ledger,lab,bridge,sessions;
 let aiCalls=0,authorizationCalls=0,allowed=false;
 const remote={buyerApproved:false,captured:false};
 const providerCalls=[];
 try{
  lab=createOwnerPrivateGeminiInnovationLab({
   filename:join(dir,'part2.sqlite'),budgetFilename:join(dir,'quota.sqlite'),
   scope:{actor,merchant,job:'sandbox_pilot_job'},
   apiKey:'FICTIONAL_KEY_NOT_REAL_PROVIDER',
   fetchImpl:async(_url,init)=>{
    aiCalls++;
    assert.equal(init.method,'POST');
    assert.equal(init.redirect,'error');
    return fakeGemini(aiCalls===1?'OFFER':'ACCEPT',150);
   },ownerAuthorized:true,freeTierConfirmed:true,operatorConfirmed:true,
   sandboxPilotSellerFloorMinor:150
  });
  const consent=lab.delegate({key:'single_approved_mandate',
   maxMinor:150,expiresInMinutes:15});
  const deal=await lab.negotiate({key:'single_agreement',consentId:consent.consentId});
  assert.equal(deal.status,'SYNTHETIC_AGREEMENT');
  assert.equal(deal.agreedMinor,150);
  assert.equal(deal.paymentAuthorized,false);
  assert.equal(deal.realGemini,false);
  assert.equal(deal.providerCalls,'NOT_ATTESTED');
  assert.equal(aiCalls,2);

  ledger=createSqliteLedger({filename:join(dir,'part1.sqlite')});
  await ledger.provisionLocalMember({actorId:actor,merchantId:merchant,role:'buyer'});
  await ledger.insertQuote({id:quoteId,ownerId:actor,merchantId:merchant});
  await ledger.approve({id:quoteId,actorId:actor,expectedVersion:1,
   amountMinor:deal.agreedMinor});
  const sessionHandle=Object.freeze(Object.create(null));
  const trusted=new WeakMap([[sessionHandle,{verified:true,actorId:actor,
   merchantId:merchant}]]);
  const identityPolicy=createMarketplaceIdentityPolicy({
   resolveTrustedSession:async handle=>trusted.get(handle),
   resolveMembership:async id=>ledger.getLocalMember(id)
  });
  bridge=createCrossPartReviewBridge({
   filename:join(dir,'bridge.sqlite'),ledger,
   innovationStore:{state:scope=>{
    assert.equal(scope.actor,actor);
    assert.equal(scope.merchant,merchant);
    return lab.state();
   }},
   identityPolicy,allowUnattestedPrivateA2A:true,
   trustedSandboxPilotSellerFloorMinor:150,
   authorizeLink:async x=>
    x.action==='LINK_UNATTESTED_PRIVATE_A2A_TO_APPROVED_QUOTE'&&
    x.quoteId===quoteId&&x.amountMinor===150&&
    x.sellerFloorMinor===150&&x.paymentAuthorized===false
  });
  sessions=createPilotCheckoutSessionStore({filename:join(dir,'session.sqlite')});
  const quote=await ledger.get(quoteId);
  const principal={verified:true,actorId:actor,merchantId:merchant};
  const token=sessions.issue({quote,principal}).token;
  const proof=sessions.verify({token,quote,principal});
  const transport=createSandboxTransport({
   clientId:'FAKE_ONLY_CLIENT',clientSecret:'FAKE_ONLY_SECRET',
   async fetchImpl(url,init){
    const path=new URL(url).pathname;
    providerCalls.push({method:init.method,path});
    if(path==='/v1/oauth2/token')return {
     status:200,json:async()=>({access_token:'SYNTHETIC_TOKEN',
      token_type:'Bearer'})
    };
    if(path==='/v2/checkout/orders'&&init.method==='POST')
     return {status:201,json:async()=>({
      id:'A2APILOTORDER',status:'PAYER_ACTION_REQUIRED',
      links:[{rel:'payer-action',
       href:'https://www.sandbox.paypal.com/checkoutnow?token=A2APILOTORDER'}]
     })};
    if(path==='/v2/checkout/orders/A2APILOTORDER'&&init.method==='GET')
     return {status:200,json:async()=>({
      id:'A2APILOTORDER',intent:'CAPTURE',
      status:remote.captured?'COMPLETED':
       remote.buyerApproved?'APPROVED':'PAYER_ACTION_REQUIRED',
      purchase_units:[{
       reference_id:quoteId,payee:{merchant_id:merchant},
       amount:{currency_code:'USD',value:'1.50'},
       ...(remote.captured?{payments:{captures:[{
        id:'A2APILOTCAPTURE',status:'COMPLETED',
        amount:{currency_code:'USD',value:'1.50'}
       }]}}:{})
      }]
     })};
    if(path==='/v2/checkout/orders/A2APILOTORDER/capture'&&init.method==='POST'){
     remote.captured=true;
     return {status:201,json:async()=>({
      id:'A2APILOTORDER',status:'COMPLETED'
     })};
    }
    throw Error('DISALLOWED_FAKE_PATH');
   }
  });
  const guard=async ({quoteId:requested})=>bridge.inspect({
   hostHandle:sessionHandle,quoteId:requested
  });
  const coordinator=createOwnerPilotCheckoutCoordinator({
   ledger,transport,verifyPrivateA2AReview:guard,
   authorizeAction:async x=>{
    authorizationCalls++;
    assert.equal(x.quoteId,quoteId);
    assert.equal(x.amountMinor,150);
    return allowed;
   }
  });
  assert.equal(coordinator.privateA2AReviewRequired,true);
  const input={quoteId,actorId:actor,merchantId:merchant,
   sessionProof:proof,publicOrigin:'https://checkout.example.org'};

  // No cross-part evidence: zero outbound provider calls.
  await assert.rejects(coordinator.openOwnerOrder(input),{
   code:'OWNER_PILOT_PRIVATE_A2A_REVIEW_REQUIRED'
  });
  assert.equal(providerCalls.length,0);
  const linked=await bridge.link({
   hostHandle:sessionHandle,quoteId,consentId:consent.consentId
  });
  assert.equal(linked.status,'PRIVATE_UNATTESTED_A2A_REVIEW_ONLY');
  assert.equal(linked.amountMinor,deal.agreedMinor);
  assert.equal(linked.paymentAuthorized,false);
  assert.equal(linked.modelProviderAttested,false);

  // No human consent: still no outbound provider activity.
  await assert.rejects(coordinator.openOwnerOrder(input),{
   code:'OWNER_EXPLICIT_ACTION_AUTHORIZATION_REQUIRED'
  });
  assert.equal(providerCalls.length,0);
  allowed=true;
  const opened=await coordinator.openOwnerOrder(input);
  assert.equal(opened.status,'BUYER_APPROVAL_PENDING');
  assert.equal(opened.paymentState,'NOT_PAID');
  assert.equal(providerCalls.filter(x=>x.method==='POST'&&
   x.path==='/v2/checkout/orders').length,1);
  assert.equal((await coordinator.captureOwnerOrder(input)).status,
   'BUYER_APPROVAL_PENDING');
  assert.equal(remote.captured,false);
  // Independent fictional sandbox buyer action, NOT AI autonomous payment.
  remote.buyerApproved=true;
  const paid=await coordinator.captureOwnerOrder(input);
  assert.equal(paid.status,'PAID');
  assert.equal(paid.paymentState,'VERIFIED_BY_GET');
  assert.equal(paid.orderId,'A2APILOTORDER');
  assert.equal(providerCalls.filter(x=>x.method==='POST'&&
   x.path==='/v2/checkout/orders/A2APILOTORDER/capture').length,1);
  assert.equal((await coordinator.captureOwnerOrder(input)).status,'PAID');
  assert.equal(providerCalls.filter(x=>x.method==='POST'&&
   x.path==='/v2/checkout/orders/A2APILOTORDER/capture').length,1);
  assert.equal(aiCalls,2);

  // Revoking cross-part evidence prevents further pilot operations even though
  // it cannot reverse a historical synthetic completed capture.
  await bridge.revoke({hostHandle:sessionHandle,quoteId});
  const prior=providerCalls.length;
  await assert.rejects(coordinator.refreshOwnerOrder(input),{
   code:'OWNER_PILOT_PRIVATE_A2A_REVIEW_REQUIRED'
  });
  assert.equal(providerCalls.length,prior);
  assert.ok(authorizationCalls>=3);
 }finally{
  sessions?.close();bridge?.close();ledger?.close();lab?.close();
  rmSync(dir,{recursive:true,force:true});
 }
});

test('private A2A review callback cannot be replaced by browser-like payment claims',()=>{
 assert.throws(()=>createOwnerPilotCheckoutCoordinator({
  authorizeAction:()=>true,verifyPrivateA2AReview:{verified:true}
 }),{code:'TRUSTED_PRIVATE_A2A_REVIEW_CALLBACK_REQUIRED'});
});
