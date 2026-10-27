import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createPilotCheckoutSessionStore,
  boundServerSessionFromStoredProof} from '../src/pilot_checkout_session_store.mjs';
import {createOwnerCheckoutHostSession} from '../src/owner_checkout_host_session.mjs';
import {createOwnerBuyerReturnInquiry} from '../src/owner_buyer_return_inquiry.mjs';

const merchantId='A1B2C3D4E5F6G',quoteId='checkout_owner_q1';
const origin='https://checkout.example.org';
async function fixture(){
  const folder=mkdtempSync(join(tmpdir(),'host-bridge-'));
  const ledger=createSqliteLedger({filename:join(folder,'ledger.sqlite')});
  let clock=1800000000000;
  const sessions=createPilotCheckoutSessionStore({
    filename:join(folder,'sessions.sqlite'),now:()=>clock
  });
  await ledger.insertQuote({id:quoteId,ownerId:'owner1',merchantId,version:2});
  await ledger.approve({id:quoteId,actorId:'owner1',expectedVersion:2,amountMinor:150});
  await ledger.insertQuote({id:'other_quote',ownerId:'other',merchantId:'Z1Y2X3W4V5U6T'});
  await ledger.approve({id:'other_quote',actorId:'other',expectedVersion:1,amountMinor:150});
  const state={login:true,authorized:true,actorId:'owner1',merchantId,
    assertions:[],hostReads:0};
  const bridge=createOwnerCheckoutHostSession({
    ledger,sessionStore:sessions,
    resolveTrustedPrincipal:async handle=>{
      state.hostReads++;
      if(handle!=='trusted-login'||!state.login)return null;
      return {verified:true,actorId:state.actorId,merchantId:state.merchantId};
    },
    authorizeSessionIssue:async decision=>{
      state.assertions.push(decision);
      return state.authorized;
    }
  });
  return {
    ledger,sessions,state,bridge,
    login:()=>bridge.issue({hostLoginHandle:'trusted-login',quoteId}),
    changeClock:value=>{clock=value},
    close(){sessions.close();ledger.close();rmSync(folder,{recursive:true,force:true})}
  };
}
const withFixture=fn=>async()=>{const f=await fixture();try{await fn(f)}finally{f.close()}};

test('internal host bridge rejects missing trusted callbacks and exposes no public route',()=>{
  assert.throws(()=>createOwnerCheckoutHostSession({}),
    {code:'TRUSTED_CHECKOUT_HOST_DEPENDENCIES_REQUIRED'});
});
test('separate explicit session-issuance authorization before writing a durable token',withFixture(async f=>{
  f.state.authorized=false;
  await assert.rejects(f.login(),{code:'CHECKOUT_ISSUANCE_AUTHORIZATION_REQUIRED'});
  assert.equal(f.state.assertions.length,1);
  assert.equal(f.state.assertions[0].action,'ISSUE_OWNER_SANDBOX_CHECKOUT_SESSION');
  f.state.authorized=true;
  const issued=await f.login();
  assert.equal(f.bridge.mode,'INTERNAL_TRUSTED_HOST_CHECKOUT_IDENTITY_BRIDGE');
  assert.equal(f.bridge.publicHttpEnabled,false);
  assert.equal(f.bridge.productionAuthImplemented,false);
  assert.equal(f.bridge.bearerTokenExposed,false);
  assert.equal(issued.mode,'INTERNAL_SERVER_ONLY_NO_PUBLIC_SESSION');
  assert.equal(Object.getOwnPropertyNames(issued.handle).length,0);
  assert.equal(JSON.stringify(issued).includes('token'),false);
  assert.equal(JSON.stringify(issued).includes('merchantId'),false);
  assert.equal(JSON.stringify(issued).includes('quoteId'),false);
  const result=await f.bridge.resolveTrustedCheckout(issued.handle);
  const quote=await f.ledger.get(quoteId);
  const proof=boundServerSessionFromStoredProof(result.sessionProof,quote);
  assert.equal(proof.actorId,'owner1');
  assert.equal(proof.merchantId,merchantId);
  assert.equal(result.quoteId,quoteId);
  await assert.rejects(f.login(),{code:'PILOT_SESSION_ALREADY_ISSUED'});
}));
test('browser-crafted empty handles, object copies and session strings are not valid server capabilities',withFixture(async f=>{
  const issued=await f.login();
  for(const fake of [null,'trusted-login','token=FORGED',{},Object.freeze({}),
    JSON.parse(JSON.stringify(issued.handle))]){
    await assert.rejects(f.bridge.resolveTrustedCheckout(fake),
      {code:'CHECKOUT_SERVER_HANDLE_REQUIRED'});
  }
  assert.equal((await f.bridge.resolveTrustedCheckout(issued.handle)).verified,true);
  assert.equal(f.state.assertions.length,1);
}));
test('session resolver rechecks host login on every read; logout/reassignment blocks stale proof',withFixture(async f=>{
  const {handle}=await f.login();
  assert.equal((await f.bridge.resolveTrustedCheckout(handle)).verified,true);
  f.state.login=false;
  await assert.rejects(f.bridge.resolveTrustedCheckout(handle),
    {code:'TRUSTED_HOST_LOGIN_REQUIRED'});
  f.state.login=true;
  f.state.actorId='other';
  await assert.rejects(f.bridge.resolveTrustedCheckout(handle),
    {code:'TRUSTED_HOST_LOGIN_CHANGED'});
  f.state.actorId='owner1';
  f.state.merchantId='Z1Y2X3W4V5U6T';
  await assert.rejects(f.bridge.resolveTrustedCheckout(handle),
    {code:'TRUSTED_HOST_LOGIN_CHANGED'});
}));
test('session expiry and explicit revocation do not reissue or refresh token',withFixture(async f=>{
  const {handle}=await f.login();
  assert.equal((await f.bridge.revoke(handle)).revoked,true);
  await assert.rejects(f.bridge.resolveTrustedCheckout(handle),
    {code:'CHECKOUT_SERVER_HANDLE_REQUIRED'});
  await assert.rejects(f.login(),{code:'PILOT_SESSION_ALREADY_ISSUED'});
}));
test('expired 15 minute session cannot be reused even with still authenticated login',withFixture(async f=>{
  const {handle}=await f.login();
  f.changeClock(1800000000000+15*60*1000+1);
  await assert.rejects(f.bridge.resolveTrustedCheckout(handle),
    {code:'PILOT_SESSION_NOT_VERIFIED'});
  await assert.rejects(f.login(),{code:'PILOT_SESSION_ALREADY_ISSUED'});
}));
test('owner cannot issue checkout for another tenant or a malformed ID',withFixture(async f=>{
  await assert.rejects(f.bridge.issue({hostLoginHandle:'trusted-login',quoteId:'other_quote'}),
    {code:'TRUSTED_APPROVED_QUOTE_REQUIRED'});
  await assert.rejects(f.bridge.issue({hostLoginHandle:'trusted-login',quoteId:'../../hidden'}),
    {code:'CHECKOUT_QUOTE_REQUIRED'});
  assert.equal(f.state.assertions.length,0);
}));
test('quote revision after issuance invalidates original merchant/version proof',withFixture(async f=>{
  const {handle}=await f.login();
  await f.ledger.revise({id:quoteId,actorId:'owner1',expectedVersion:2,
    scope:'Change scope after approval invalidates original checkout session',
    suggestedMinor:150,suggestionSource:'OFFLINE_MOCK'});
  await assert.rejects(f.bridge.resolveTrustedCheckout(handle),
    {code:'TRUSTED_APPROVED_QUOTE_REQUIRED'});
}));
test('buyer GET inquiry accepts internally minted host capability, no callback capture',withFixture(async f=>{
  const {handle}=await f.login();
  let refreshes=0;
  const gateway=createOwnerBuyerReturnInquiry({
    publicOrigin:origin,
    resolveTrustedCheckout:f.bridge.resolveTrustedCheckout,
    coordinator:{
      mode:'INTERNAL_OWNER_SANDBOX_PILOT_ONLY',publicHttpEnabled:false,
      async refreshOwnerOrder(input){
        refreshes++;
        const quote=await f.ledger.get(quoteId);
        assert.equal(input.quoteId,quoteId);
        assert.equal(input.actorId,'owner1');
        assert.equal(input.merchantId,merchantId);
        assert.equal(boundServerSessionFromStoredProof(
          input.sessionProof,quote).actorId,'owner1');
        return {status:'BUYER_APPROVAL_PENDING',paymentState:'NOT_PAID'};
      }
    }
  });
  const browserUrl=origin+'/checkout/paypal/return?status=COMPLETED&PayerID=FORGED';
  const good=await gateway.handle({
    request:new Request(browserUrl),serverSessionHandle:handle
  });
  assert.equal(good.status,200);
  const body=await good.json();
  assert.equal(body.paymentVerifiedByTrustedGet,false);
  assert.equal(body.providerPostPerformed,false);
  assert.equal(body.capturePerformedByCallback,false);
  assert.equal(refreshes,1);
  const wrong=await gateway.handle({
    request:new Request(browserUrl),serverSessionHandle:{}
  });
  assert.equal(wrong.status,401);
  assert.equal(refreshes,1);
  f.state.login=false;
  const logout=await gateway.handle({
    request:new Request(browserUrl),serverSessionHandle:handle
  });
  assert.equal(logout.status,401);
  assert.equal(refreshes,1);
}));
