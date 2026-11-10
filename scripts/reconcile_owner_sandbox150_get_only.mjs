// Owner-local SAME-$1.50 recovery. Default never reads credentials or files.
// Explicit real GET requires private TTY + one typed consent, and a separate
// independent firewall that *cannot* make PayPal Orders CREATE/CAPTURE POST.
import {argv,stdin,stderr,stdout,env} from 'node:process';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {resolveOwnerSandbox150QuoteScope}
 from '../src/owner_private_a2a_quote_binding.mjs';
import {inspectOwnerSandbox150ExistingOrder,
 createOwnerSandbox150GetRecovery}
 from '../src/owner_sandbox_150_get_recovery.mjs';
import {createExistingSandboxGetOnlyFetch}
 from '../src/sandbox_existing_get_only_fetch.mjs';
import {createSandboxTransport} from '../src/paypal_sandbox_transport.mjs';

const flags=argv.slice(2);
const exact=['--execute','--owner-authorized',
 '--sandbox-only','--get-existing-only'];
const execute=flags.length===exact.length&&
 new Set(flags).size===exact.length&&exact.every(x=>flags.includes(x));
const inspect=flags.length===1&&flags[0]==='--inspect';
const report=(status,extra={})=>stdout.write(JSON.stringify({
 status,mode:'OWNER_150_SANDBOX_EXISTING_GET_RECOVERY',
 paymentPostPermitted:false,localLedgerMutated:false,
 retryPost:false,...extra
})+'\n');
if(!inspect&&!execute){
 report('DRY_RUN_NO_FILE_NO_NETWORK',{
  requiredFlags:exact,readOnlyFlag:'--inspect',
  networkRequests:0,fileWrites:0
 });process.exitCode=2;
}else if(execute&&(!stdin.isTTY||!stderr.isTTY)){
 report('PRIVATE_INTERACTIVE_TTY_REQUIRED',{
  networkRequests:0,fileWrites:0
 });process.exitCode=2;
}else{
 let firewall;
 try{
  const base=join(homedir(),'.paypal-ai-pilot-private');
  const quoteScope=resolveOwnerSandbox150QuoteScope({
   environment:env,privateDirectory:base
  });
  // Never allow env override to point to another ledger or historical pilot.
  if(resolve(quoteScope.filename)!==
     resolve(join(base,'owner-sandbox150-part1.sqlite')))
   throw Object.assign(new Error('DIR'),{
    code:'OWNER150_GET_DEDICATED_LEDGER_REQUIRED'
   });
  const preflight=inspectOwnerSandbox150ExistingOrder(quoteScope);
  if(inspect){
   report(preflight.status,{existingOrderIdSaved:true,
    localCreateState:preflight.localCreateState,
    localCaptureState:preflight.localCaptureState,
    networkRequests:0,fileWrites:0
   });
  }else{
   const rl=createInterface({input:stdin,output:stderr,terminal:true});
   let consent=false;
   try{
    const phrase='READ EXISTING WORKNOVA SANDBOX 150 ORDER';
    consent=(await rl.question(
     'GET only for an EXISTING approved USD $1.50 Sandbox order. '+
     'OAuth credential POST + up to two Order GETs; '+
     'no CREATE/CAPTURE, no retry or ledger write. Type '+phrase+': '
    ))===phrase;
   }finally{rl.close()}
   if(!consent)
    throw Object.assign(new Error('DECLINED'),{
     code:'OWNER150_GET_OPERATOR_DECLINED'
    });
   const clientId=env.PAYPAL_SANDBOX_CLIENT_ID;
   const secret=env.PAYPAL_SANDBOX_CLIENT_SECRET;
   if(typeof clientId!=='string'||!clientId.trim()||
      typeof secret!=='string'||!secret.trim())
    throw Object.assign(new Error('CONFIG'),{
     code:'OWNER150_GET_CREDENTIALS_UNAVAILABLE'
    });
   firewall=createExistingSandboxGetOnlyFetch({
    fetchImpl:(...args)=>globalThis.fetch(...args),
    maxOauthPosts:2,maxOrderGets:2
   });
   const transport=createSandboxTransport({
    clientId,clientSecret:secret,fetchImpl:firewall.fetch
   });
   const recovery=createOwnerSandbox150GetRecovery({
    quoteScope,transport,authorizeRead:grant=>(
     grant.quoteId===quoteScope.quoteId&&
     grant.actorId===quoteScope.actorId&&
     grant.merchantId===quoteScope.merchantId&&
     grant.amountMinor===150&&grant.paymentPostPermitted===false
    )
   });
   const state=await recovery.refresh();
   report(state.status,{...firewall.status(),
    freshSandboxOrderGet:state.freshSandboxOrderGet,
    paymentVerifiedByFreshGet:state.paymentVerifiedByFreshGet,
    fileWrites:0
   });
   if(state.freshSandboxOrderGet!==true||
      state.paymentVerifiedByFreshGet!==true)
    process.exitCode=2;
  }
 }catch(e){
  report('OWNER150_SANDBOX_GET_OPERATOR_REVIEW_REQUIRED',{
   errorClass:typeof e?.code==='string'&&/^OWNER150_[A-Z0-9_]{3,100}$/.test(e.code)
    ?e.code:'OWNER150_GET_UNVERIFIED',
   ...(firewall?.status()??{networkRequests:0}),
   fileWrites:0,localLedgerMutated:false
  });
  process.exitCode=2;
 }
}
