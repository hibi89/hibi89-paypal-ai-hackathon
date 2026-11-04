// Explicit owner-only GET of an EXISTING PayPal Sandbox order after restart.
// Pure immutable SQLite reader; no new session, order/capture POST or file write.
// Without exact flags + private TTY: zero network, zero env inspection.
import {stdin,stderr,stdout,argv,env} from 'node:process';
import {createInterface} from 'node:readline/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {createSandboxTransport} from '../src/paypal_sandbox_transport.mjs';
import {createExistingSandboxGetOnlyFetch}
 from '../src/sandbox_existing_get_only_fetch.mjs';
import {createOwnerExistingSandboxGetRecovery}
 from '../src/owner_sandbox_existing_get_recovery.mjs';

const flags=['--execute','--owner-authorized','--sandbox-only','--get-existing-only'];
const supplied=argv.slice(2);
const exact=supplied.length===flags.length&&
 new Set(supplied).size===flags.length&&flags.every(x=>supplied.includes(x));
const report=(status,more={})=>stdout.write(JSON.stringify({
 status,mode:'OWNER_EXISTING_SANDBOX_READ_ONLY_RECOVERY',
 paymentPostPermitted:false,localLedgerMutated:false,retryPost:false,
 ...more
})+'\n');
if(!exact){
 report('DRY_RUN_EXPLICIT_FLAGS_REQUIRED',{networkRequests:0,fileWrites:0});
 process.exitCode=2;
}else if(!stdin.isTTY||!stderr.isTTY){
 report('PRIVATE_INTERACTIVE_TTY_REQUIRED',{networkRequests:0,fileWrites:0});
 process.exitCode=2;
}else{
 const rl=createInterface({input:stdin,output:stderr,terminal:true});
 const confirm=async(phrase,prompt)=>
  (await rl.question(prompt+' Type '+phrase+': '))===phrase;
 let firewall=null;
 try{
  if(!await confirm('REVIEW EXISTING SANDBOX ORDER',
   'Read only the existing private owner quote and PayPal Sandbox order'))
   throw Object.assign(new Error('DECLINED'),{code:'OWNER_GET_CONSENT_DECLINED'});
  // No local session, AI budget or checkout db opened in writable mode.
  const merchantId=env.PAYPAL_SANDBOX_MERCHANT_ID;
  const clientId=env.PAYPAL_SANDBOX_CLIENT_ID;
  const clientSecret=env.PAYPAL_SANDBOX_CLIENT_SECRET;
  if(!/^[A-Za-z0-9]{13}$/.test(merchantId??'')||
     typeof clientId!=='string'||!clientId||
     typeof clientSecret!=='string'||!clientSecret)
   throw Object.assign(new Error('CONFIG'),{code:'PRIVATE_SANDBOX_CONFIG_REQUIRED'});
  firewall=createExistingSandboxGetOnlyFetch({
   fetchImpl:(...args)=>globalThis.fetch(...args),
   maxOrderGets:3,maxOauthPosts:3
  });
  const transport=createSandboxTransport({clientId,clientSecret,
   fetchImpl:firewall.fetch});
  const owner=createOwnerExistingSandboxGetRecovery({
   directory:join(homedir(),'.paypal-ai-mvp-private'),merchantId,transport,
   authorizeRead:()=>confirm('AUTHORIZE ONE SANDBOX GET',
    'OAuth POST plus existing-order GET may occur; Orders/Capture POST forbidden')
  });
  const state=owner.inspect();
  if(state.status!=='EXISTING_ORDER_AVAILABLE_FOR_AUTHORIZED_GET')
   throw Object.assign(new Error('NOT_READY'),{code:'EXISTING_ORDER_NOT_READY'});
  const result=await owner.refresh();
  report(result.status,{
   ...firewall.status(),freshSandboxOrderGet:result.freshSandboxOrderGet??false,
   paymentVerifiedByFreshGet:result.paymentVerifiedByFreshGet??false,
   independentAttestation:false,fileWrites:0
  });
  if(result.freshSandboxOrderGet!==true)process.exitCode=2;
 }catch(e){
  report('SANDBOX_GET_ONLY_MANUAL_REVIEW_REQUIRED',{
   errorClass:typeof e?.code==='string'&&/^[A-Z0-9_]{3,90}$/.test(e.code)
    ?e.code:'PRIVATE_RECOVERY_NOT_VERIFIED',
   ...(firewall?.status()??{oauthPostRequests:0,orderGetRequests:0,
    orderCreatePosts:0,capturePosts:0}),
   providerResultUnverified:true,fileWrites:0
  });
  process.exitCode=2;
 }finally{rl.close()}
}
