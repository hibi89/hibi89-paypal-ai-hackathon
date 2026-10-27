import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createPilotCheckoutSessionStore} from '../src/pilot_checkout_session_store.mjs';
import {createMarketplaceAiBudgetStore} from '../src/marketplace_ai_budget.mjs';
import {createGeminiMarketplaceSkillProvider} from '../src/gemini_marketplace_provider.mjs';
import {createSandboxTransport} from '../src/paypal_sandbox_transport.mjs';
import {createOwnerMvpFlow,MVP_BRIEF} from '../src/owner_mvp_flow.mjs';

const merchantId='A1B2C3D4E5F6G';
function fixture(){
  const folder=mkdtempSync(join(tmpdir(),'paypal-mvp-e2e-'));
  const ledger=createSqliteLedger({filename:join(folder,'payments.sqlite')});
  const sessionStore=createPilotCheckoutSessionStore({filename:join(folder,'session.sqlite')});
  const aiStore=createMarketplaceAiBudgetStore({filename:join(folder,'ai.sqlite')});
  const calls=[],state={buyerApproved:false,captured:false,createLost:false,allow:true,
    canGemini:true,canQuote:true,canCreate:true,canCapture:true};
  const fetchImpl=async(url,o)=>{
    const path=new URL(url).pathname;
    calls.push({path,method:o.method,url});
    if(url.startsWith('https://generativelanguage.googleapis.com/')){
      if(state.geminiLost)throw Error('SYNTHETIC_GEMINI_UNKNOWN');
      return {status:200,json:async()=>({candidates:[{finishReason:'STOP',
        content:{parts:[{text:'{"skills":["web","payments","qa"]}'}]}}]})};
    }
    if(path==='/v1/oauth2/token')
      return {status:200,json:async()=>({access_token:'MOCK_TOKEN',token_type:'Bearer'})};
    if(path==='/v2/checkout/orders'&&o.method==='POST'){
      if(state.createLost)throw Error('SYNTHETIC_CREATE_UNKNOWN');
      const data=JSON.parse(o.body);
      assert.equal(data.purchase_units[0].amount.value,'1.50');
      return {status:201,json:async()=>({id:'MVPORDER1',status:'PAYER_ACTION_REQUIRED',
        links:[{rel:'payer-action',
          href:'https://www.sandbox.paypal.com/checkoutnow?token=MVPORDER1'}]})};
    }
    if(path==='/v2/checkout/orders/MVPORDER1'&&o.method==='GET'){
      const status=state.captured?'COMPLETED':
        state.buyerApproved?'APPROVED':'PAYER_ACTION_REQUIRED';
      return {status:200,json:async()=>({id:'MVPORDER1',status,intent:'CAPTURE',
        purchase_units:[{reference_id:'operator_mvp_01',
          payee:{merchant_id:merchantId},
          amount:{currency_code:'USD',value:'1.50'},
          ...(state.captured?{payments:{captures:[{
            id:'MVPCAPTURE1',status:'COMPLETED',
            amount:{currency_code:'USD',value:'1.50'}
          }]}}:{})}]})};
    }
    if(path==='/v2/checkout/orders/MVPORDER1/capture'&&o.method==='POST'){
      state.captured=true;
      return {status:201,json:async()=>({id:'MVPORDER1',status:'COMPLETED'})};
    }
    throw Error('UNEXPECTED_STUB_'+path);
  };
  const provider=createGeminiMarketplaceSkillProvider({
    apiKey:'SYNTHETIC_NON_SECRET',ownerAuthorized:true,
    freeTierConfirmed:true,fetchImpl});
  const transport=createSandboxTransport({
    clientId:'FAKE_CLIENT',clientSecret:'FAKE_SECRET',fetchImpl});
  const authorizations=[];
  const create=()=>createOwnerMvpFlow({
    ledger,sessionStore,aiStore,geminiProvider:provider,paypalTransport:transport,
    merchantId,publicOrigin:'https://checkout.example.org',
    authorizeStage:async action=>{
      authorizations.push(action);
      if(action.action==='GEMINI_SKILL_CLASSIFICATION_ONCE')return state.canGemini;
      if(action.action==='APPROVE_SYNTHETIC_USD_1_50')return state.canQuote;
      if(action.operation==='CREATE_SANDBOX_ORDER')return state.canCreate;
      if(action.operation==='CAPTURE_SANDBOX_ORDER')return state.canCapture;
      return state.allow;
    }
  });
  return {ledger,sessionStore,aiStore,calls,state,authorizations,create,
    close(){aiStore.close();sessionStore.close();ledger.close();
      rmSync(folder,{recursive:true,force:true});}};
}
const withFixture=fn=>async()=>{const f=fixture();try{await fn(f)}finally{f.close()}};
const posts=(calls,path)=>calls.filter(c=>c.path===path&&c.method==='POST').length;

test('bounded one-process MVP: Gemini skills -> explicit quote -> Sandbox buyer -> CAPTURE -> GET PAID',withFixture(async f=>{
 const s=f.create();
 const match=await s.classify();
 assert.deepEqual(match.skills,['web','payments','qa']);
 assert.equal(match.priceSource,'HUMAN_FIXED_SYNTHETIC_AMOUNT_NOT_AI');
 assert.equal(match.selectedSyntheticProfile,'synthetic-web');
 assert.equal(match.selectedProfileEligible,false);
 assert.deepEqual(match.missingSkills,['qa']);
 assert.deepEqual(match.eligibleProfiles,[]);
 assert.equal(match.paypalActionPerformed,false);
 await assert.rejects(s.createOrder(),{code:'MVP_HUMAN_APPROVAL_REQUIRED'});
 const approved=await s.approveQuote();
 assert.equal(approved.amountMinor,150);
 const consent=f.authorizations.find(x=>x.action==='APPROVE_SYNTHETIC_USD_1_50');
 assert.equal(consent.selectedProfileId,'synthetic-web');
 assert.deepEqual(consent.missingSkills,['qa']);
 assert.equal((await f.ledger.get('operator_mvp_01')).approval.amountMinor,150);
 const order=await s.createOrder();
 assert.equal(order.status,'BUYER_APPROVAL_PENDING');
 assert.match(order.approvalUrl,/sandbox.paypal.com/);
 assert.equal((await s.refresh()).status,'BUYER_APPROVAL_PENDING');
 const pending=await s.capture();
 assert.equal(pending.capturePerformed,false);
 assert.equal(posts(f.calls,'/v2/checkout/orders/MVPORDER1/capture'),0);
 f.state.buyerApproved=true;
 assert.equal((await s.refresh()).status,'ORDER_APPROVED');
 const paid=await s.capture();
 assert.equal(paid.status,'PAID');
 assert.equal(paid.paymentState,'VERIFIED_BY_GET');
 assert.equal((await s.reconcile()).status,'PAID');
 assert.equal(posts(f.calls,'/v2/checkout/orders'),1);
 assert.equal(posts(f.calls,'/v2/checkout/orders/MVPORDER1/capture'),1);
 assert.equal(f.calls.filter(c=>c.url.startsWith('https://generativelanguage')).length,1);
 assert.equal(f.authorizations.filter(a=>a.operation==='CAPTURE_SANDBOX_ORDER').length,1);
 assert.equal(f.ledger.get('operator_mvp_01') instanceof Promise,true);
}));
test('a declined Gemini user action has zero provider calls and no PayPal',withFixture(async f=>{
 f.state.canGemini=false;
 await assert.rejects(f.create().classify(),{code:'MARKETPLACE_AI_CONSENT_REQUIRED'});
 assert.equal(f.calls.length,0);
 assert.equal(f.aiStore.status({actorId:'local_operator',merchantId,brief:MVP_BRIEF}),null);
}));
test('Gemini transport UNKNOWN blocks checkout and follow-up auto retry',withFixture(async f=>{
 f.state.geminiLost=true;
 const s=f.create();
 await assert.rejects(s.classify(),{code:'MARKETPLACE_AI_RESULT_UNKNOWN_NO_AUTO_RETRY'});
 assert.equal(posts(f.calls,'/v2/checkout/orders'),0);
 assert.equal(f.aiStore.status({actorId:'local_operator',merchantId,brief:MVP_BRIEF}).state,'UNKNOWN');
 await assert.rejects(f.create().classify(),{code:'MVP_EXISTING_QUOTE_REVIEW_REQUIRED'});
}));
test('price or Create consent denial does not create PayPal order',withFixture(async f=>{
 const s=f.create();await s.classify();
 f.state.canQuote=false;
 await assert.rejects(s.approveQuote(),{code:'MVP_PRICE_HUMAN_APPROVAL_REQUIRED'});
 assert.equal(posts(f.calls,'/v2/checkout/orders'),0);
 f.state.canQuote=true;await s.approveQuote();
 f.state.canCreate=false;
 await assert.rejects(s.createOrder(),{code:'OWNER_EXPLICIT_ACTION_AUTHORIZATION_REQUIRED'});
 assert.equal(posts(f.calls,'/v2/checkout/orders'),0);
}));
test('no CAPTURE without distinct approval, and consent denial never claims CAPTURE',withFixture(async f=>{
 const s=f.create();await s.classify();await s.approveQuote();await s.createOrder();
 assert.equal((await s.capture()).status,'BUYER_APPROVAL_PENDING');
 f.state.buyerApproved=true;f.state.canCapture=false;
 await assert.rejects(s.capture(),{code:'OWNER_EXPLICIT_ACTION_AUTHORIZATION_REQUIRED'});
 assert.equal(posts(f.calls,'/v2/checkout/orders/MVPORDER1/capture'),0);
 assert.equal((await f.ledger.listAttempts('operator_mvp_01')).length,1);
}));
test('ambiguous Orders CREATE is never retried and the quote remains approved',withFixture(async f=>{
 const s=f.create();await s.classify();await s.approveQuote();
 f.state.createLost=true;
 const result=await s.createOrder();
 assert.equal(result.status,'UNKNOWN');
 assert.equal(posts(f.calls,'/v2/checkout/orders'),1);
 assert.equal((await f.ledger.listAttempts('operator_mvp_01'))[0].state,'UNKNOWN');
 await assert.rejects(s.refresh(),{code:'MVP_ORDER_NOT_OPENED'});
}));
test('fail closed with unsafe callback or forged merchant before provider network',withFixture(async f=>{
 const s=createOwnerMvpFlow;
 await assert.rejects(async()=>s({ledger:f.ledger,aiStore:f.aiStore,
   sessionStore:f.sessionStore,geminiProvider:()=>{},paypalTransport:{},
   merchantId:'BAD',publicOrigin:'http://localhost:3000',
   authorizeStage:async()=>true}),{code:'MVP_OPERATOR_CONFIGURATION_REQUIRED'});
 assert.equal(f.calls.length,0);
}));

test('operator CLI without flags is a dry run and reads no private credentials',async()=>{
 const {spawnSync}=await import('node:child_process');
 const cli=new URL('../scripts/run_owner_mvp_operator.mjs',import.meta.url);
 const run=spawnSync(process.execPath,['--experimental-sqlite',cli.pathname],{
  encoding:'utf8',env:{...process.env,GEMINI_API_KEY:'PRIVATE_DO_NOT_REPORT',
    PAYPAL_SANDBOX_CLIENT_SECRET:'PRIVATE_DO_NOT_REPORT'},timeout:10000
 });
 assert.equal(run.status,2);
 const report=JSON.parse(run.stdout.trim());
 assert.equal(report.status,'DRY_RUN_EXPLICIT_FLAGS_AND_TTY_REQUIRED');
 assert.equal(report.providerCalls,0);
 assert.equal(report.paymentPosts,0);
 assert.ok(!run.stdout.includes('PRIVATE_DO_NOT_REPORT'));
 assert.ok(!run.stderr.includes('PRIVATE_DO_NOT_REPORT'));
});
