// Opt-in recovery of an EXISTING owner Sandbox order after terminal restart.
// NEW Orders/Capture POST never allowed, including in the final fetch boundary.
// Default invocation: no env read, disk write, network or provider call.
import {stdin,stderr,stdout,argv,env} from 'node:process';
import {createInterface} from 'node:readline/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createPilotCheckoutSessionStore} from '../src/pilot_checkout_session_store.mjs';
import {createMarketplaceAiBudgetStore} from '../src/marketplace_ai_budget.mjs';
import {createSandboxTransport} from '../src/paypal_sandbox_transport.mjs';
import {createOwnerMvpFlow} from '../src/owner_mvp_flow.mjs';
import {inspectOwnerMvpLocalState} from '../src/owner_mvp_local_status.mjs';

const flags=['--execute','--owner-authorized','--sandbox-only','--get-existing-only'];
const requested=argv.slice(2),exact=requested.length===flags.length&&
 new Set(requested).size===flags.length&&flags.every(x=>requested.includes(x));
const report=(status,extra={})=>stdout.write(JSON.stringify({
 status,mode:'PRIVATE_OWNER_EXISTING_SANDBOX_GET_ONLY',
 newOrderPostAllowed:false,capturePostAllowed:false,
 ...extra
})+'\n');
if(!exact){
 report('DRY_RUN_EXPLICIT_FLAGS_REQUIRED',{networkRequests:0,localWrites:0});
 process.exitCode=2;
}else if(!stdin.isTTY||!stderr.isTTY){
 report('PRIVATE_INTERACTIVE_TTY_REQUIRED',{networkRequests:0,localWrites:0});
 process.exitCode=2;
}else{
 const rl=createInterface({input:stdin,output:stderr,terminal:true});
 const confirm=async(text,msg)=>(await rl.question(msg+' Type '+text+': '))===text;
 let ledger=null,sessions=null,ai=null;
 const count={oauthPost:0,orderGet:0};
 try{
  // No private env read until a human gives explicit consent.
  if(!await confirm('REVIEW EXISTING SANDBOX ORDER',
    'Review ONLY the previously recorded Sandbox order. No create or capture'))
   throw Object.assign(new Error('DECLINED'),{code:'OWNER_GET_CONSENT_DECLINED'});
  const dir=join(homedir(),'.paypal-ai-mvp-private');
  const previous=inspectOwnerMvpLocalState({directory:dir});
  if(previous.files.checkout!=='PRESENT'||previous.files.session!=='PRESENT'||
     previous.files.gemini!=='PRESENT'||previous.states.quote!=='APPROVED'||
     !['APPROVED','UNKNOWN'].includes(previous.states.create))
   throw Object.assign(new Error('PREVIOUS'),{code:'EXISTING_SANDBOX_STATE_NOT_READY'});
  const merchantId=env.PAYPAL_SANDBOX_MERCHANT_ID;
  const clientId=env.PAYPAL_SANDBOX_CLIENT_ID;
  const clientSecret=env.PAYPAL_SANDBOX_CLIENT_SECRET;
  const publicOrigin=env.PAYPAL_PILOT_PUBLIC_ORIGIN;
  if(!/^[A-Za-z0-9]{13}$/.test(merchantId??'')||
     typeof clientId!=='string'||!clientId||
     typeof clientSecret!=='string'||!clientSecret||
     typeof publicOrigin!=='string'||!publicOrigin)
   throw Object.assign(new Error('CONFIG'),{code:'PRIVATE_SANDBOX_CONFIG_REQUIRED'});
  // OAuth grant POST is needed to authenticate a fresh sandbox GET.
  // The fetch boundary NEVER permits Orders CREATE or Capture, regardless
  // of which internal method is accidentally called.
  const guardedFetch=async(url,init)=>{
   const request=new URL(url);
   const method=init?.method??'GET';
   if(request.origin!=='https://api-m.sandbox.paypal.com'||
      (method==='POST'&&request.pathname!=='/v1/oauth2/token')||
      (method==='GET'&&!/^\/v2\/checkout\/orders\/[A-Za-z0-9_-]{1,64}$/.test(request.pathname))||
      !['GET','POST'].includes(method)||request.search||request.hash)
    throw Object.assign(new Error('BLOCKED'),{code:'RECOVERY_PAYMENT_POST_FORBIDDEN'});
   if(method==='POST')count.oauthPost++;
   else count.orderGet++;
   return globalThis.fetch(url,init);
  };
  ledger=createSqliteLedger({filename:join(dir,'checkout.sqlite')});
  sessions=createPilotCheckoutSessionStore({filename:join(dir,'checkout_sessions.sqlite')});
  ai=createMarketplaceAiBudgetStore({filename:join(dir,'gemini_skills.sqlite')});
  const transport=createSandboxTransport({clientId,clientSecret,
   fetchImpl:guardedFetch});
  const authorizeStage=async action=>{
   if(action?.action==='REAUTHORIZE_EXISTING_SANDBOX_GET_ONLY')
    return confirm('REAUTHORIZE EXISTING ORDER',
     'Rebind existing quote after inspecting saved PayPal order ID privately');
   if(action?.action==='ISSUE_OWNER_SANDBOX_CHECKOUT_SESSION')
    return confirm('ISSUE NEW LOCAL SESSION',
     'This writes one LOCAL private checkout session; no provider request');
   if(action?.action==='GET_EXISTING_SANDBOX_ORDER_ONLY')
    return confirm('AUTHORIZE ONE SANDBOX GET',
     'PayPal Sandbox OAuth POST and authenticated GET may occur; no payment POST');
   return false; // Never issue fresh Orders or Capture permission.
  };
  const flow=createOwnerMvpFlow({
   ledger,aiStore:ai,sessionStore:sessions,
   geminiProvider:async()=>{throw Error('GEMINI_RECONCILE_FORBIDDEN')},
   paypalTransport:transport,merchantId,publicOrigin,authorizeStage
  });
  const prepared=await flow.resumeExistingOrderGetOnly();
  if(prepared.status!=='EXISTING_SANDBOX_GET_ONLY_READY')
   throw Object.assign(new Error('SCOPE'),{code:'EXISTING_SANDBOX_REBIND_DENIED'});
  const result=await flow.refresh();
  report('SANDBOX_GET_ONLY_COMPLETED',{
   paymentState:result.paymentState??'NOT_CONFIRMED',
   remoteStatus:result.status??'UNKNOWN',
   localSessionWritten:true,orderGetRequests:count.orderGet,
   oauthPostRequests:count.oauthPost,orderCreatePosts:0,capturePosts:0,
   paymentVerifiedByFreshGet:result.status==='PAID'&&
    result.paymentState==='VERIFIED_BY_GET',
   externallyIndependentlyAttested:false,retryPost:false
  });
 }catch(e){
  // Never print errors with response details, order IDs or env values.
  report('SANDBOX_GET_ONLY_REVIEW_REQUIRED',{
   errorClass:typeof e?.code==='string'&&/^[A-Z0-9_]{3,90}$/.test(e.code)
    ?e.code:'PRIVATE_RECOVERY_FAILED',
   orderGetRequests:count.orderGet,oauthPostRequests:count.oauthPost,
   orderCreatePosts:0,capturePosts:0,
   providerResultUnverified:true,retryPost:false
  });
  process.exitCode=2;
 }finally{
  try{ai?.close()}catch{}
  try{sessions?.close()}catch{}
  try{ledger?.close()}catch{}
  rl.close();
 }
}
