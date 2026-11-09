import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createPrivateOidcMarketplaceHost} from '../src/private_oidc_marketplace_host.mjs';
import {createPilotCheckoutSessionStore} from '../src/pilot_checkout_session_store.mjs';
import {createOwnerCheckoutHostSession} from '../src/owner_checkout_host_session.mjs';

const origin='https://checkout.example.org';
const issuer='https://accounts.example.org';
const clientId='worknova-oidc-offline-buyer';
const merchant='A1B2C3D4E5F6G';
const quoteId='same_quote_150';
const actor='owner';
const request=(path,{method='GET',cookie}={})=>new Request(origin+path,{
 method,headers:{...(method==='POST'?{origin}:{}),...(cookie?{cookie}:{})}
});
test('genuine signed offline OIDC login -> private same-$1.50 checkout proof -> revoked binding blocks reuse',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'worknova-oidc-checkout-'));
 let ledger,oidc,sessions,auth;let calls=0;
 try{
  ledger=createSqliteLedger({filename:join(dir,'ledger.sqlite')});
  await ledger.insertQuote({id:quoteId,ownerId:actor,merchantId:merchant});
  await ledger.approve({id:quoteId,actorId:actor,expectedVersion:1,amountMinor:150});
  await ledger.provisionLocalMember({actorId:actor,merchantId:merchant,role:'buyer'});
  await ledger.provisionLocalMember({actorId:'reviewer',merchantId:merchant,role:'reviewer'});
  const keys=generateKeyPairSync('rsa',{modulusLength:2048});
  const jwk={...keys.publicKey.export({format:'jwk'}),
   kid:'LOCAL_OIDC_TEST_SIGNER',alg:'RS256',use:'sig'};
  const token=(nonce,subject)=>{
   const n=Math.floor(Date.now()/1000);
   const h=Buffer.from(JSON.stringify({alg:'RS256',kid:jwk.kid,typ:'JWT'})).toString('base64url');
   const p=Buffer.from(JSON.stringify({iss:issuer,aud:clientId,sub:subject,
    nonce,iat:n-2,auth_time:n-2,exp:n+180,
    actorId:'FORGED_ADMIN',merchantId:'FORGED_MERCHANT'})).toString('base64url');
   return h+'.'+p+'.'+sign('RSA-SHA256',Buffer.from(h+'.'+p),
    keys.privateKey).toString('base64url');
  };
  oidc=createPrivateOidcMarketplaceHost({
   files:{challenge:join(dir,'challenge.sqlite'),jwks:join(dir,'jwks.sqlite'),
    bindings:join(dir,'bindings.sqlite'),sessions:join(dir,'verified.sqlite')},
   publicOrigin:origin,issuer,clientId,authorizationEndpoint:issuer+'/authorize',
   tokenEndpoint:issuer+'/token',jwksUri:issuer+'/keys',
   approvedProviderOrigins:[issuer],challengeKey:randomBytes(32),
   subjectPepper:randomBytes(32),ledger,
   authorizeTrustUpdate:()=>true,authorizeOperatorProvisioning:()=>true,
   codeTransport:{exchange:async ticket=>{
    calls++;if(ticket.code!=='FAKE_AUTH_CODE_123456789')throw Error('FAKE_ONLY');
    return {idToken:token(ticket.expectedNonce,'external-buyer'),
     expectedNonce:ticket.expectedNonce};
   }}
  });
  await oidc.operator.stagePublicKeys({jwks:{keys:[jwk]},
   expectedRevision:0,validUntilMs:Date.now()+600000});
  await oidc.operator.activatePublicKeys({expectedRevision:0});
  await oidc.operator.provisionIdentity({subject:'external-buyer',
   actorId:actor,merchantId:merchant});
  const start=await oidc.handle(request('/api/auth/oidc/start',{method:'POST'}));
  assert.equal(start.status,303);
  const state=new URL(start.headers.get('location')).searchParams.get('state');
  const loginCookie=start.headers.getSetCookie()[0].split(';')[0];
  const callback=await oidc.handle(request('/api/auth/oidc/callback?code=FAKE_AUTH_CODE_123456789&state='+state,{
   cookie:loginCookie
  }));
  assert.equal(callback.status,200);
  const cookie=callback.headers.getSetCookie()[0].split(';')[0];
  const authenticated=request('/api/auth/oidc/session',{cookie});
  const checkoutHandle=await oidc.beginCheckoutLogin(authenticated);
  assert.equal(calls,1);
  const p=await oidc.resolveCheckoutPrincipal(checkoutHandle);
  assert.deepEqual({actorId:p.actorId,merchantId:p.merchantId,role:p.role},
   {actorId:actor,merchantId:merchant,role:'buyer'});
  assert.equal(p.verified,true);
  assert.equal(await oidc.resolveCheckoutPrincipal({verified:true,actorId:actor}),null);
  assert.equal(await oidc.resolveCheckoutPrincipal(null),null);
  await assert.rejects(oidc.beginCheckoutLogin(request('/api/marketplace/quotes/'+quoteId,{cookie})),
   {code:'PRIVATE_CHECKOUT_AUTH_REQUIRED'});
  await assert.rejects(oidc.beginCheckoutLogin(request('/api/auth/oidc/session')),
   {code:'PRIVATE_CHECKOUT_VERIFIED_BUYER_REQUIRED'});
  sessions=createPilotCheckoutSessionStore({filename:join(dir,'checkout.sqlite')});
  let explicitlyApproved=false,requests=0;
  auth=createOwnerCheckoutHostSession({ledger,sessionStore:sessions,
   resolveTrustedPrincipal:handle=>oidc.resolveCheckoutPrincipal(handle),
   authorizeSessionIssue:async detail=>{
    requests++;
    assert.equal(detail.quoteId,quoteId);
    assert.equal(detail.amountMinor,150);
    return explicitlyApproved;
   }});
  await assert.rejects(auth.issue({hostLoginHandle:checkoutHandle,quoteId}),
   {code:'CHECKOUT_ISSUANCE_AUTHORIZATION_REQUIRED'});
  explicitlyApproved=true;
  const issued=await auth.issue({hostLoginHandle:checkoutHandle,quoteId});
  const verified=await auth.resolveTrustedCheckout(issued.handle);
  assert.equal(verified.quoteId,quoteId);
  assert.equal(verified.actorId,actor);
  assert.equal(verified.merchantId,merchant);
  assert.ok(verified.sessionProof);
  assert.equal(requests,2);
  assert.equal((await oidc.handle(request('/api/paypal/orders',{method:'POST'})).status),404);
  assert.equal((await ledger.listAttempts(quoteId)).length,0);
  assert.equal((await oidc.operator.revokeIdentity({subject:'external-buyer'})).revoked,true);
  assert.equal(await oidc.resolveCheckoutPrincipal(checkoutHandle),null);
  await assert.rejects(auth.resolveTrustedCheckout(issued.handle),
   {code:'TRUSTED_HOST_LOGIN_REQUIRED'});
  await assert.rejects(auth.issue({hostLoginHandle:checkoutHandle,quoteId}),
   {code:'TRUSTED_HOST_LOGIN_REQUIRED'});
  assert.equal((await ledger.listAttempts(quoteId)).length,0);
  assert.equal(calls,1);
 }finally{
  oidc?.close();sessions?.close();ledger?.close();
  rmSync(dir,{recursive:true,force:true});
 }
});
