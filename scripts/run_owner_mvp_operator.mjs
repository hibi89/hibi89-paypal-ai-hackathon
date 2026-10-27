// Genuine external providers ONLY after independent local approvals.
// This terminal E2E is NOT a public application or a hosted callback handler.
// Default: dry-run, no env or provider credentials read, no DB created.
import {stdin,stderr,stdout,argv,env} from 'node:process';
import {createInterface} from 'node:readline/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {mkdirSync} from 'node:fs';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createPilotCheckoutSessionStore} from '../src/pilot_checkout_session_store.mjs';
import {createMarketplaceAiBudgetStore} from '../src/marketplace_ai_budget.mjs';
import {createGeminiMarketplaceSkillProvider} from '../src/gemini_marketplace_provider.mjs';
import {createSandboxTransport} from '../src/paypal_sandbox_transport.mjs';
import {createOwnerMvpFlow,MVP_BRIEF} from '../src/owner_mvp_flow.mjs';
import {validateMarketplaceBrief} from '../src/gemini_marketplace_provider.mjs';
import {startOwnerMvpCallbackLanding} from '../src/owner_mvp_callback_landing.mjs';

const required=['--execute','--owner-authorized','--free-tier-confirmed',
  '--sandbox-only','--buyer-is-sandbox-personal'];
const flags=argv.slice(2),set=new Set(flags);
if(flags.length!==required.length||set.size!==required.length||
   !required.every(x=>set.has(x))||!stdin.isTTY||!stderr.isTTY){
  stdout.write(JSON.stringify({status:'DRY_RUN_EXPLICIT_FLAGS_AND_TTY_REQUIRED',
    providerCalls:0,paymentPosts:0})+'\n');
  process.exitCode=2;
}else{
  const rl=createInterface({input:stdin,output:stderr,terminal:true});
  const confirm=async(phrase,message)=>{
    const line=await rl.question(message+' Type '+phrase+': ');
    return line===phrase;
  };
  // Require real interactive consent BEFORE reading private environment.
  let approved=await confirm('START PRIVATE MVP',
    'No Live payments. Real Gemini API and virtual PayPal Sandbox requests follow separate confirmations.');
  if(!approved){
    stdout.write(JSON.stringify({status:'OWNER_DECLINED',providerCalls:0,paymentPosts:0})+'\n');
    process.exitCode=2;
  }else{
    const id=env.PAYPAL_SANDBOX_MERCHANT_ID;
    const origin=env.PAYPAL_PILOT_PUBLIC_ORIGIN;
    const cid=env.PAYPAL_SANDBOX_CLIENT_ID;
    const sec=env.PAYPAL_SANDBOX_CLIENT_SECRET;
    const apiKey=env.GEMINI_API_KEY;
    if(!/^[A-Za-z0-9]{13}$/.test(id??'')||
       !cid||!sec||!apiKey||!origin){
      stdout.write(JSON.stringify({status:'PRIVATE_PROVIDER_CONFIG_MISSING',
        providerCalls:0,paymentPosts:0})+'\n');
      process.exitCode=2;
    }else{
      // One durable fixed quote/order per private project directory.
      const folder=join(homedir(),'.paypal-ai-mvp-private');
      let ledger=null,sessionStore=null,aiStore=null,landing=null;
      let publicState='NOT_STARTED';
      try{
        const supplied=await rl.question(
          'FICTIONAL task description, 8-500 chars (Enter = fixed synthetic demo): ');
        const brief=supplied.trim()?supplied:MVP_BRIEF;
        validateMarketplaceBrief(brief);
        const configuredPort=env.PAYPAL_PILOT_CALLBACK_PORT??'8787';
        if(!/^(?:0|[1-9][0-9]{0,4})$/.test(configuredPort)||
          Number(configuredPort)<1024||Number(configuredPort)>65535)
          throw Error('INVALID_CALLBACK_LOCAL_PORT');
        landing=await startOwnerMvpCallbackLanding({
          port:Number(configuredPort),publicOrigin:origin
        });
        stderr.write('Local navigation callback: '+landing.localUrl+'\n');
        stderr.write('Public HTTPS return/cancel must proxy to local callback:\n'+
          origin+'/checkout/paypal/return\n'+
          origin+'/checkout/paypal/cancel\n');
        if(!await confirm('PROBE OWNER HTTPS CALLBACK',
          'Send two read-only HTTPS GET probes to the configured public return/cancel URLs (no Gemini/PayPal calls).'))
          throw Error('CALLBACK_PROBE_NOT_AUTHORIZED');
        const proof=await landing.verifyPublicIngress({fetchImpl:globalThis.fetch});
        if(proof.returnAndCancelReachable!==true)
          throw Error('CALLBACK_PUBLIC_HTTPS_NOT_REACHABLE');
        stderr.write('Verified BOTH HTTPS paths route to this local listener; NOT buyer or payment proof.\n');
        // No SQLite allocations before brief validation or callback preflight.
        mkdirSync(folder,{recursive:true,mode:0o700});
        ledger=createSqliteLedger({filename:join(folder,'checkout.sqlite')});
        sessionStore=createPilotCheckoutSessionStore({
          filename:join(folder,'checkout_sessions.sqlite')});
        aiStore=createMarketplaceAiBudgetStore({
          filename:join(folder,'gemini_skills.sqlite')});
        const provider=createGeminiMarketplaceSkillProvider({
          apiKey,fetchImpl:globalThis.fetch,ownerAuthorized:true,
          freeTierConfirmed:true});
        const transport=createSandboxTransport({
          clientId:cid,clientSecret:sec,fetchImpl:globalThis.fetch});
        const flow=createOwnerMvpFlow({
          ledger,sessionStore,aiStore,geminiProvider:provider,
          paypalTransport:transport,merchantId:id,publicOrigin:origin,
          brief,authorizeStage:async action=>{
            if(action.action==='GEMINI_SKILL_CLASSIFICATION_ONCE')
              return confirm('SEND SYNTHETIC GEMINI','Gemini Free-tier one-shot skills classification.');
            if(action.action==='APPROVE_SYNTHETIC_USD_1_50')
              return confirm('APPROVE USD 1.50',
                'Approve $1.50 human-set quote for '+action.selectedProfileId+
                ', missing skills: '+(action.missingSkills?.join(', ')||'none')+
                '. Price is NOT AI predicted.');
            if(action.action==='ISSUE_OWNER_SANDBOX_CHECKOUT_SESSION')
              return confirm('ISSUE SANDBOX SESSION','Create a private 15-minute checkout proof.');
            if(action.operation==='CREATE_SANDBOX_ORDER')
              return confirm('CREATE SANDBOX ORDER','Send ONE virtual USD 1.50 Orders CREATE.');
            if(action.operation==='CAPTURE_SANDBOX_ORDER')
              return confirm('CAPTURE SANDBOX USD 1.50',
                'Buyer must have approved in distinct Sandbox Personal account.');
            return false;
          }
        });
        const match=await flow.classify();
        publicState='GEMINI_SKILLS_VERIFIED';
        stderr.write('Validated skills: '+match.skills.join(', ')+
          '; selected SYNTHETIC profile: '+match.selectedSyntheticProfile+
          '; missing skills: '+(match.missingSkills.join(', ')||'none')+'\n');
        await flow.approveQuote();
        const order=await flow.createOrder();
        publicState=order.status;
        if(!['BUYER_APPROVAL_PENDING','ORDER_APPROVED'].includes(order.status)||
           !order.approvalUrl)throw Error('ORDER_UNVERIFIED_NO_REPEAT');
        // Only local terminal prints the one-time Sandbox approval URL.
        stderr.write('Open in distinct SANDBOX Personal buyer browser: '+
          order.approvalUrl+'\n');
        const done=await confirm('BUYER APPROVED IN SANDBOX',
          'Finish Sandbox buyer authorization in the browser first.');
        if(!done)throw Error('BUYER_NOT_APPROVED_DO_NOT_CAPTURE');
        const refreshed=await flow.refresh();
        publicState=refreshed.status;
        if(refreshed.status!=='ORDER_APPROVED')
          throw Error('PAYPAL_GET_HAS_NO_BUYER_APPROVAL');
        const capture=await flow.capture();
        const final=await flow.reconcile();
        publicState=final.status;
        stdout.write(JSON.stringify({
          status:final.status==='PAID'&&final.paymentState==='VERIFIED_BY_GET'
            ?'SANDBOX_PAYMENT_VERIFIED_BY_PROVIDER_GET':'SANDBOX_NOT_VERIFIED',
          paymentState:final.paymentState,aiSkills:match.skills,
          syntheticSellers:match.eligibleProfiles,
          aiPricePrediction:false,externalProviderWorkflowAttempted:true,
          realMoneyUsed:false,productionAuthVerified:false,
          providerGetVerified:final.status==='PAID',autoRetry:false})+'\n');
        if(final.status!=='PAID')process.exitCode=2;
      }catch{
        // Never put private response, credentials, order tokens, or prompts in logs.
        stdout.write(JSON.stringify({
          status:'MVP_STOPPED_REVIEW_PRIVATE_LEDGER_NO_AUTORETRY',
          lastVerifiedStage:publicState,autoRetry:false,
          paymentVerified:false})+'\n');
        process.exitCode=2;
      }finally{
        try{sessionStore?.close()}catch{}
        try{aiStore?.close()}catch{}
        try{ledger?.close()}catch{}
        try{await landing?.close()}catch{}
      }
    }
  }
  rl.close();
}
