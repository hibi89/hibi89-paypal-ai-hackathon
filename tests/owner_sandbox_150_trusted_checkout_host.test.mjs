import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {prepareFreshOwnerSandbox150Quote} from '../src/owner_sandbox_150_quote_prepare.mjs';
import {inspectOwnerProposedA2AQuote} from '../src/owner_private_a2a_quote_binding.mjs';
import {approveOwnerSandbox150Quote} from '../src/owner_sandbox_150_quote_approval.mjs';
import {createOwnerPrivateGeminiInnovationLab} from '../src/owner_private_gemini_innovation_lab.mjs';
import {createPilotCheckoutSessionStore} from '../src/pilot_checkout_session_store.mjs';
import {createSandboxTransport} from '../src/paypal_sandbox_transport.mjs';
import {createOwnerSandbox150TrustedCheckoutHost}
 from '../src/owner_sandbox_150_trusted_checkout_host.mjs';

const actor='owner',merchant='A1B2C3D4E5F6G',quoteId='one_quote_for_both';
const fake=(action,amountMinor)=>new Response(JSON.stringify({
 candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({
  action,amountMinor
 })}]}}],usageMetadata:{totalTokenCount:40}
}),{status:200,headers:{'content-type':'application/json'}});
test('new trusted-only checkout host requires independent identity and authorization callbacks',()=>{
 assert.throws(()=>createOwnerSandbox150TrustedCheckoutHost({
  transport:{mode:'SANDBOX_ONLY'}
 }),{code:'OWNER_150_TRUSTED_HOST_CONFIG_REQUIRED'});
});
test('host-only A2A review + private checkout requires verified login and separate approvals before every Sandbox POST',async()=>{
 const root=mkdtempSync(join(tmpdir(),'worknova-trusted-host-'));
 const privateDirectory=join(root,'owner-private');
 const filename=join(privateDirectory,'owner-sandbox150-part1.sqlite');
 const part2Filename=join(privateDirectory,'part2-owner-sandbox150.sqlite');
 const budgetFilename=join(privateDirectory,'part2-owner-sandbox150-quota.sqlite');
 const quoteScope={filename,actorId:actor,merchantId:merchant,quoteId};
 let lab,ledger,sessions,host;
 const calls=[],remote={buyerApproved:false,captured:false};
 try{
  await prepareFreshOwnerSandbox150Quote({privateDirectory,
   actorId:actor,merchantId:merchant,quoteId});
  const binding=inspectOwnerProposedA2AQuote(quoteScope);
  let modelCalls=0;
  const options={filename:part2Filename,budgetFilename,
   scope:{actor,merchant,job:'part2_sandbox_150_once'},
   apiKey:'FAKE_ONLY_NOT_REAL',
   fetchImpl:async()=>{
    modelCalls++;return fake(modelCalls===1?'OFFER':'ACCEPT',150);
   },quoteBinding:binding,sandboxPilotSellerFloorMinor:150,
   ownerAuthorized:true,freeTierConfirmed:true,operatorConfirmed:true
  };
  lab=createOwnerPrivateGeminiInnovationLab(options);
  const consent=lab.delegate({key:'once',maxMinor:150,expiresInMinutes:15});
  const result=await lab.negotiate({key:'once',consentId:consent.consentId});
  assert.equal(result.accepted,true);
  lab.close();lab=null;
  await approveOwnerSandbox150Quote({
   privateDirectory,quoteScope,part2Filename,budgetFilename,
   explicitOwnerConsent:true
  });
  ledger=createSqliteLedger({filename});
  lab=createOwnerPrivateGeminiInnovationLab(options);
  sessions=createPilotCheckoutSessionStore({filename:join(root,'checkout-session.sqlite')});
  const loginHandle=Object.freeze(Object.create(null));
  const badHandle=Object.freeze(Object.create(null));
  let loginActive=true,allowLink=false,allowSession=false,allowPay=false;
  let revokeDuringPaymentConsent=false;
  let revokeDuringOAuth=false,revokeDuringBuyerGet=false;
  let authCalls=0,sessionApprovals=0,reviewApprovals=0;
  const identities=new WeakMap([[loginHandle,{verified:true,
   actorId:actor,merchantId:merchant}]]);
  const transport=createSandboxTransport({
   clientId:'FAKE_CLIENT_ONLY',clientSecret:'FAKE_SECRET_ONLY',
   async fetchImpl(url,init){
    const pathname=new URL(url).pathname;
    calls.push({pathname,method:init.method});
    if(pathname==='/v1/oauth2/token'){
     if(revokeDuringOAuth){
      revokeDuringOAuth=false;loginActive=false;
     }
     return {status:200,json:async()=>({access_token:'FAKE_TOKEN',token_type:'Bearer'})};
    }
    if(pathname==='/v2/checkout/orders'&&init.method==='POST')
     return {status:201,json:async()=>({id:'OWNER150ORDER',
      status:'PAYER_ACTION_REQUIRED',links:[{rel:'payer-action',
       href:'https://www.sandbox.paypal.com/checkoutnow?token=OWNER150ORDER'}]})};
    if(pathname==='/v2/checkout/orders/OWNER150ORDER'&&init.method==='GET'){
     if(revokeDuringBuyerGet){
      revokeDuringBuyerGet=false;loginActive=false;
     }
     return {status:200,json:async()=>({id:'OWNER150ORDER',intent:'CAPTURE',
      status:remote.captured?'COMPLETED':
       remote.buyerApproved?'APPROVED':'PAYER_ACTION_REQUIRED',
      purchase_units:[{reference_id:quoteId,payee:{merchant_id:merchant},
       amount:{currency_code:'USD',value:'1.50'},
       ...(remote.captured?{payments:{captures:[{
        id:'OWNER150CAPTURE',status:'COMPLETED',
        amount:{currency_code:'USD',value:'1.50'}
       }]}}:{})}]})};
    }
    if(pathname==='/v2/checkout/orders/OWNER150ORDER/capture'&&init.method==='POST'){
     remote.captured=true;
     return {status:201,json:async()=>({
      id:'OWNER150ORDER',status:'COMPLETED'
     })};
    }
    throw Error('DISALLOWED_INJECTED_PROVIDER_PATH');
   }
  });
  host=createOwnerSandbox150TrustedCheckoutHost({
   ledger,sessionStore:sessions,transport,
   innovationStore:{state:()=>lab.state()},
   reviewFilename:join(root,'review.sqlite'),
   proposedQuoteBinding:binding,publicOrigin:'https://checkout.example.org',
   resolveTrustedPrincipal:async h=>loginActive?identities.get(h):null,
   authorizeReviewLink:async()=>{reviewApprovals++;return allowLink},
   authorizeSessionIssue:async()=>{sessionApprovals++;return allowSession},
   authorizePaymentAction:async x=>{authCalls++;
    assert.equal(x.hostLoginHandle,loginHandle);
    assert.equal(x.amountMinor,150);
    if(revokeDuringPaymentConsent){
     revokeDuringPaymentConsent=false;
     loginActive=false;
    }
    return allowPay}
  });
  assert.equal(host.publicHttpEnabled,false);
  await assert.rejects(host.linkReview({
   hostLoginHandle:badHandle,consentId:consent.consentId
  }));
  await assert.rejects(host.issueCheckout({hostLoginHandle:loginHandle}));
  assert.equal(calls.length,0);
  await assert.rejects(host.linkReview({
   hostLoginHandle:loginHandle,consentId:consent.consentId
  }),{code:'CROSS_PART_EXPLICIT_REVIEW_REQUIRED'});
  assert.equal(reviewApprovals,1);
  allowLink=true;
  const linked=await host.linkReview({
   hostLoginHandle:loginHandle,consentId:consent.consentId
  });
  assert.equal(linked.status,'PRIVATE_UNATTESTED_A2A_REVIEW_ONLY');
  assert.equal(linked.paymentAuthorized,false);
  await assert.rejects(host.issueCheckout({hostLoginHandle:loginHandle}),{
   code:'CHECKOUT_ISSUANCE_AUTHORIZATION_REQUIRED'
  });
  assert.equal(sessionApprovals,1);
  allowSession=true;
  const issued=await host.issueCheckout({hostLoginHandle:loginHandle});
  const handle=issued.serverHandle;
  await assert.rejects(host.openOwnerOrder({}),{
   code:'OWNER_150_TRUSTED_CHECKOUT_HANDLE_REQUIRED'
  });
  await assert.rejects(host.openOwnerOrder(handle),{
   code:'OWNER_EXPLICIT_ACTION_AUTHORIZATION_REQUIRED'
  });
  assert.equal(calls.length,0);
  allowPay=true;
  // Login revoked while the independently approved human action is pending:
  // no OAuth and no Orders POST; the durable session is not authority alone.
  revokeDuringPaymentConsent=true;
  await assert.rejects(host.openOwnerOrder(handle),{
   code:'TRUSTED_HOST_LOGIN_REQUIRED'
  });
  assert.equal(calls.length,0);
  loginActive=true;
  const open=await host.openOwnerOrder(handle);
  assert.equal(open.status,'BUYER_APPROVAL_PENDING');
  assert.equal(calls.filter(x=>x.pathname==='/v2/checkout/orders'&&
   x.method==='POST').length,1);
  assert.equal((await host.captureOwnerOrder(handle)).status,'BUYER_APPROVAL_PENDING');
  remote.buyerApproved=true;
  const capturePosts=()=>calls.filter(x=>x.pathname===
   '/v2/checkout/orders/OWNER150ORDER/capture'&&x.method==='POST').length;
  const orderPosts=()=>calls.filter(x=>x.pathname==='/v2/checkout/orders'&&
   x.method==='POST').length;
  const originalOrderPosts=orderPosts();
  // PayPal OAuth response may arrive after the buyer logs out. GET is safe;
  // the subsequent Capture POST must remain impossible.
  revokeDuringOAuth=true;
  await assert.rejects(host.captureOwnerOrder(handle),{
   code:'TRUSTED_HOST_LOGIN_REQUIRED'
  });
  assert.equal(capturePosts(),0);
  assert.equal(orderPosts(),originalOrderPosts);
  loginActive=true;
  // Buyer APPROVED GET may also finish after the trusted login is revoked.
  revokeDuringBuyerGet=true;
  await assert.rejects(host.captureOwnerOrder(handle),{
   code:'TRUSTED_HOST_LOGIN_REQUIRED'
  });
  assert.equal(capturePosts(),0);
  assert.equal(orderPosts(),originalOrderPosts);
  loginActive=true;
  // Previously a GET-only refresh could return the order state after logout.
  // Final host auth must guard reads as well as payment writes.
  revokeDuringOAuth=true;
  await assert.rejects(host.refreshOwnerOrder(handle),{
   code:'TRUSTED_HOST_LOGIN_REQUIRED'
  });
  assert.equal(capturePosts(),0);
  assert.equal(orderPosts(),originalOrderPosts);
  loginActive=true;
  const paid=await host.captureOwnerOrder(handle);
  assert.equal(paid.status,'PAID');
  assert.equal(paid.paymentState,'VERIFIED_BY_GET');
  assert.equal(calls.filter(x=>x.pathname==='/v2/checkout/orders/OWNER150ORDER/capture'&&
   x.method==='POST').length,1);
  assert.equal((await host.captureOwnerOrder(handle)).status,'PAID');
  // A completed capture GET still cannot expose sensitive receipt details to
  // an external buyer whose authenticated host principal disappeared.
  revokeDuringOAuth=true;
  await assert.rejects(host.reconcileOwnerCapture(handle),{
   code:'TRUSTED_HOST_LOGIN_REQUIRED'
  });
  assert.equal(capturePosts(),1);
  loginActive=false;
  const prev=calls.length;
  await assert.rejects(host.refreshOwnerOrder(handle),{
   code:'TRUSTED_HOST_LOGIN_REQUIRED'
  });
  assert.equal(calls.length,prev);
  assert.ok(authCalls>=3);
  assert.equal(modelCalls,2);
 }finally{
  host?.close();sessions?.close();ledger?.close();lab?.close();
  rmSync(root,{recursive:true,force:true});
 }
});
