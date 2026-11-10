import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createPrivateOidcMarketplaceHost} from '../src/private_oidc_marketplace_host.mjs';
import {createSignedOidcSandbox150Bridge}
 from '../src/signed_oidc_sandbox150_bridge.mjs';
import {prepareFreshOwnerSandbox150Quote}
 from '../src/owner_sandbox_150_quote_prepare.mjs';
import {inspectOwnerProposedA2AQuote}
 from '../src/owner_private_a2a_quote_binding.mjs';
import {approveOwnerSandbox150Quote}
 from '../src/owner_sandbox_150_quote_approval.mjs';
import {createOwnerPrivateGeminiInnovationLab}
 from '../src/owner_private_gemini_innovation_lab.mjs';
import {createPilotCheckoutSessionStore}
 from '../src/pilot_checkout_session_store.mjs';
import {createSandboxTransport} from '../src/paypal_sandbox_transport.mjs';

const origin='https://checkout.example.org';
const issuer='https://accounts.example.org';
const clientId='worknova-oidc-sandbox150-integrated-offline';
const actor='owner',merchant='A1B2C3D4E5F6G';
const quoteId='signed_oidc_bound_150';
const http=(path,{method='GET',cookie}={})=>new Request(origin+path,{
 method,headers:{...(method==='POST'?{origin}:{}),...(cookie?{cookie}:{})}
});
const model=(action,amountMinor)=>new Response(JSON.stringify({
 candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({
  action,amountMinor
 })}]}}],usageMetadata:{totalTokenCount:40}
}),{status:200,headers:{'content-type':'application/json'}});
test('bridge rejects unbranded fake OIDC host even if it perfectly mimics all method names',()=>{
 const forged={
  mode:'PRIVATE_COMPOSED_OIDC_MARKETPLACE_HOST_NO_LISTENER',
  publicListenerEnabled:false,
  beginCheckoutLogin:async()=>({}),
  resolveCheckoutPrincipal:async()=>({verified:true,
   actorId:actor,merchantId:merchant,role:'buyer'}),
  handle:async()=>new Response(null,{status:404})
 };
 assert.throws(()=>createSignedOidcSandbox150Bridge({
  oidcHost:forged,publicOrigin:origin
 }),{code:'SIGNED_OIDC_CHECKOUT_HOST_REQUIRED'});
});
test('signed OIDC buyer -> injected A2A -> exact approved $1.50 -> private CREATE/GET/APPROVED/CAPTURE/GET; revoke denies replay',async()=>{
 const root=mkdtempSync(join(tmpdir(),'worknova-signed-full-'));
 const priv=join(root,'owner-private');
 const filename=join(priv,'owner-sandbox150-part1.sqlite');
 const part2Filename=join(priv,'part2-owner-sandbox150.sqlite');
 const budgetFilename=join(priv,'part2-owner-sandbox150-quota.sqlite');
 const quoteScope={filename,actorId:actor,merchantId:merchant,quoteId};
 let ledger,lab,sessions,oidc,bridge;
 let modelCalls=0,authExchanges=0;
 const calls=[],remote={buyerApproved:false,captured:false};
 try{
  await prepareFreshOwnerSandbox150Quote({
   privateDirectory:priv,actorId:actor,merchantId:merchant,quoteId
  });
  const binding=inspectOwnerProposedA2AQuote(quoteScope);
  const labConfig={filename:part2Filename,budgetFilename,
   scope:{actor,merchant,job:'part2_sandbox_150_once'},
   apiKey:'FAKE_ONLY_NOT_A_GOOGLE_KEY',fetchImpl:async()=>{
    modelCalls++;return model(modelCalls===1?'OFFER':'ACCEPT',150);
   },quoteBinding:binding,sandboxPilotSellerFloorMinor:150,
   ownerAuthorized:true,freeTierConfirmed:true,operatorConfirmed:true
  };
  lab=createOwnerPrivateGeminiInnovationLab(labConfig);
  const consent=lab.delegate({key:'once',maxMinor:150,expiresInMinutes:15});
  assert.equal((await lab.negotiate({
   key:'once',consentId:consent.consentId
  })).accepted,true);
  lab.close();lab=null;
  const approved=await approveOwnerSandbox150Quote({
   privateDirectory:priv,quoteScope,part2Filename,budgetFilename,
   explicitOwnerConsent:true
  });
  assert.equal(approved.amountMinor,150);
  assert.equal(approved.paypalCreatePerformed,false);
  ledger=createSqliteLedger({filename});
  lab=createOwnerPrivateGeminiInnovationLab(labConfig);
  sessions=createPilotCheckoutSessionStore({filename:join(root,'checkout.sqlite')});
  const keys=generateKeyPairSync('rsa',{modulusLength:2048});
  const jwk={...keys.publicKey.export({format:'jwk'}),
   kid:'INJECTED_RSA_FOR_TEST',alg:'RS256',use:'sig'};
  function signed(nonce){
   const now=Math.floor(Date.now()/1000);
   const h=Buffer.from(JSON.stringify({
    alg:'RS256',kid:jwk.kid,typ:'JWT'
   })).toString('base64url');
   const p=Buffer.from(JSON.stringify({iss:issuer,aud:clientId,
    sub:'fake-external-buyer',nonce,iat:now-2,auth_time:now-2,
    exp:now+180,actorId:'FORGED_ADMIN',merchantId:'FORGED_TENANT'
   })).toString('base64url');
   return h+'.'+p+'.'+sign('RSA-SHA256',Buffer.from(h+'.'+p),
    keys.privateKey).toString('base64url');
  }
  oidc=createPrivateOidcMarketplaceHost({
   files:{challenge:join(root,'challenge.sqlite'),jwks:join(root,'jwks.sqlite'),
    bindings:join(root,'bindings.sqlite'),sessions:join(root,'verified.sqlite')},
   publicOrigin:origin,issuer,clientId,authorizationEndpoint:issuer+'/authorize',
   tokenEndpoint:issuer+'/token',jwksUri:issuer+'/keys',
   approvedProviderOrigins:[issuer],challengeKey:randomBytes(32),
   subjectPepper:randomBytes(32),ledger,
   authorizeTrustUpdate:()=>true,authorizeOperatorProvisioning:()=>true,
   codeTransport:{exchange:async ticket=>{
    authExchanges++;
    if(ticket.code!=='INJECTED_AUTH_CODE_123456789')throw Error('FAKE_CODE');
    return {idToken:signed(ticket.expectedNonce),
     expectedNonce:ticket.expectedNonce};
   }}
  });
  await oidc.operator.stagePublicKeys({jwks:{keys:[jwk]},
   expectedRevision:0,validUntilMs:Date.now()+600_000});
  await oidc.operator.activatePublicKeys({expectedRevision:0});
  await oidc.operator.provisionIdentity({subject:'fake-external-buyer',
   actorId:actor,merchantId:merchant});
  const first=await oidc.handle(http('/api/auth/oidc/start',{method:'POST'}));
  assert.equal(first.status,303);
  const state=new URL(first.headers.get('location')).searchParams.get('state');
  const browserCookie=first.headers.getSetCookie()[0].split(';')[0];
  const authenticated=await oidc.handle(http(
   '/api/auth/oidc/callback?code=INJECTED_AUTH_CODE_123456789&state='+state,
   {cookie:browserCookie}
  ));
  assert.equal(authenticated.status,200);
  const sessionCookie=authenticated.headers.getSetCookie()[0].split(';')[0];
  // Even a real signed OIDC host must not issue checkout authority for
  // another HTTPS origin; cookie scope / callback merchant identity differ.
  assert.throws(()=>createSignedOidcSandbox150Bridge({
   oidcHost:oidc,publicOrigin:'https://other-checkout.example.org'
  }),{code:'SIGNED_OIDC_CHECKOUT_HOST_REQUIRED'});
  assert.throws(()=>createSignedOidcSandbox150Bridge({
   oidcHost:{...oidc},publicOrigin:origin
  }),{code:'SIGNED_OIDC_CHECKOUT_HOST_REQUIRED'});
  let allowLink=false,allowIssue=false,allowPayment=false;
  let actionChecks=0,linkChecks=0,sessionChecks=0;
  const transport=createSandboxTransport({
   clientId:'FAKE_CLIENT_ONLY',clientSecret:'FAKE_SECRET_ONLY',
   async fetchImpl(url,init){
    const pathname=new URL(url).pathname;
    calls.push({pathname,method:init.method});
    if(pathname==='/v1/oauth2/token')
     return {status:200,json:async()=>({
      access_token:'INJECTED_ACCESS',token_type:'Bearer'
     })};
    if(pathname==='/v2/checkout/orders'&&init.method==='POST')
     return {status:201,json:async()=>({
      id:'SIGNEDOIDC150ORDER',status:'PAYER_ACTION_REQUIRED',
      links:[{rel:'payer-action',href:
       'https://www.sandbox.paypal.com/checkoutnow?token=SIGNEDOIDC150ORDER'}]
     })};
    if(pathname==='/v2/checkout/orders/SIGNEDOIDC150ORDER'&&init.method==='GET')
     return {status:200,json:async()=>({
      id:'SIGNEDOIDC150ORDER',intent:'CAPTURE',
      status:remote.captured?'COMPLETED':
       remote.buyerApproved?'APPROVED':'PAYER_ACTION_REQUIRED',
      purchase_units:[{reference_id:quoteId,
       payee:{merchant_id:merchant},amount:{currency_code:'USD',value:'1.50'},
       ...(remote.captured?{payments:{captures:[{
        id:'SIGNEDOIDC150CAPTURE',status:'COMPLETED',
        amount:{currency_code:'USD',value:'1.50'}
       }]}}:{})}]
     })};
    if(pathname==='/v2/checkout/orders/SIGNEDOIDC150ORDER/capture'&&init.method==='POST'){
     remote.captured=true;
     return {status:201,json:async()=>({
      id:'SIGNEDOIDC150ORDER',status:'COMPLETED'
     })};
    }
    throw Error('UNEXPECTED_INJECTED_PROVIDER_PATH');
   }
  });
  bridge=createSignedOidcSandbox150Bridge({
   oidcHost:oidc,ledger,innovationStore:{state:()=>lab.state()},
   sessionStore:sessions,transport,reviewFilename:join(root,'linked.sqlite'),
   proposedQuoteBinding:binding,publicOrigin:origin,
   authorizeReviewLink:async detail=>{
    linkChecks++;assert.equal(detail.amountMinor,150);return allowLink;
   },
   authorizeSessionIssue:async detail=>{
    sessionChecks++;assert.equal(detail.amountMinor,150);return allowIssue;
   },
   authorizePaymentAction:async detail=>{
    actionChecks++;assert.equal(detail.amountMinor,150);return allowPayment;
   }
  });
  assert.equal(bridge.publicHttpEnabled,false);
  assert.equal(bridge.paymentAuthorized,false);
  await assert.rejects(bridge.beginBuyer({verified:true,actorId:actor}),{
   code:'PRIVATE_CHECKOUT_AUTH_REQUIRED'
  });
  await assert.rejects(bridge.beginBuyer(http('/api/auth/oidc/session')),{
   code:'PRIVATE_CHECKOUT_VERIFIED_BUYER_REQUIRED'
  });
  const login=await bridge.beginBuyer(http('/api/auth/oidc/session',{
   cookie:sessionCookie
  }));
  assert.equal(await oidc.resolveCheckoutPrincipal({verified:true}),null);
  assert.equal((await oidc.resolveCheckoutPrincipal(login)).actorId,actor);
  await assert.rejects(bridge.linkReview({
   hostLoginHandle:login,consentId:consent.consentId
  }),{code:'CROSS_PART_EXPLICIT_REVIEW_REQUIRED'});
  assert.equal(linkChecks,1);
  allowLink=true;
  const review=await bridge.linkReview({
   hostLoginHandle:login,consentId:consent.consentId
  });
  assert.equal(review.status,'PRIVATE_UNATTESTED_A2A_REVIEW_ONLY');
  assert.equal(review.paymentAuthorized,false);
  await assert.rejects(bridge.issueCheckout({hostLoginHandle:login}),{
   code:'CHECKOUT_ISSUANCE_AUTHORIZATION_REQUIRED'
  });
  allowIssue=true;
  const issued=await bridge.issueCheckout({hostLoginHandle:login});
  await assert.rejects(bridge.openOwnerOrder(issued.serverHandle),{
   code:'OWNER_EXPLICIT_ACTION_AUTHORIZATION_REQUIRED'
  });
  assert.equal(calls.length,0);
  allowPayment=true;
  assert.equal((await bridge.openOwnerOrder(issued.serverHandle)).status,
   'BUYER_APPROVAL_PENDING');
  assert.equal((await bridge.captureOwnerOrder(issued.serverHandle)).status,
   'BUYER_APPROVAL_PENDING');
  remote.buyerApproved=true;
  assert.equal((await bridge.refreshOwnerOrder(issued.serverHandle)).status,
   'ORDER_APPROVED');
  const paid=await bridge.captureOwnerOrder(issued.serverHandle);
  assert.equal(paid.status,'PAID');
  assert.equal(paid.paymentState,'VERIFIED_BY_GET');
  assert.equal((await bridge.reconcileOwnerCapture(issued.serverHandle)).status,
   'PAID');
  assert.equal((await bridge.captureOwnerOrder(issued.serverHandle)).status,
   'PAID');
  const writes=calls.filter(x=>x.method==='POST'&&x.pathname.startsWith('/v2/checkout/orders'));
  assert.deepEqual(writes.map(x=>x.pathname),[
   '/v2/checkout/orders',
   '/v2/checkout/orders/SIGNEDOIDC150ORDER/capture'
  ]);
  assert.equal((await oidc.handle(http('/api/paypal/orders',{
   method:'POST'
  }))).status,404);
  assert.equal(modelCalls,2);
  assert.equal(authExchanges,1);
  assert.ok(actionChecks>=2&&linkChecks===2&&sessionChecks===2);
  // The same authenticated signed OIDC buyer can withdraw the private
  // A2A review without creating/capturing a second payment.
  const countBeforeRevoke=calls.length;
  await assert.rejects(bridge.revokeReview({
   hostLoginHandle:{verified:true,actorId:actor}
  }));
  const withdrawn=await bridge.revokeReview({hostLoginHandle:login});
  assert.equal(withdrawn.status,'SYNTHETIC_REVIEW_REVOKED');
  assert.equal(withdrawn.paymentAuthorized,false);
  await assert.rejects(bridge.refreshOwnerOrder(issued.serverHandle),{
   code:'OWNER_PILOT_PRIVATE_A2A_REVIEW_REQUIRED'
  });
  assert.equal(calls.length,countBeforeRevoke);
  const count=calls.length;
  assert.equal((await oidc.operator.revokeIdentity({
   subject:'fake-external-buyer'
  })).revoked,true);
  await assert.rejects(bridge.refreshOwnerOrder(issued.serverHandle),{
   code:'TRUSTED_HOST_LOGIN_REQUIRED'
  });
  await assert.rejects(bridge.captureOwnerOrder(issued.serverHandle),{
   code:'TRUSTED_HOST_LOGIN_REQUIRED'
  });
  await assert.rejects(bridge.beginBuyer(http('/api/auth/oidc/session',{
   cookie:sessionCookie
  })),{code:'PRIVATE_CHECKOUT_VERIFIED_BUYER_REQUIRED'});
  assert.equal(calls.length,count);
  bridge.close();
  await assert.rejects(bridge.beginBuyer(http('/api/auth/oidc/session',{
   cookie:sessionCookie
  })),{code:'SIGNED_OIDC_CHECKOUT_BRIDGE_CLOSED'});
 }finally{
  bridge?.close();oidc?.close();sessions?.close();ledger?.close();lab?.close();
  rmSync(root,{recursive:true,force:true});
 }
});
