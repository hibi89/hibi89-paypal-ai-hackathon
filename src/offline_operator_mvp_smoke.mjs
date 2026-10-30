// Real minimum-viable owner orchestration exercised with explicitly injected
// fictional providers. This is an executable OFFLINE demo, NOT a Sandbox receipt.
// Never imports production credentials, sends network requests, or accepts user funds.
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createSqliteLedger} from './sqlite_ledger.mjs';
import {createMarketplaceAiBudgetStore} from './marketplace_ai_budget.mjs';
import {createPilotCheckoutSessionStore} from './pilot_checkout_session_store.mjs';
import {createGeminiMarketplaceSkillProvider} from './gemini_marketplace_provider.mjs';
import {createSandboxTransport} from './paypal_sandbox_transport.mjs';
import {createOwnerMvpFlow} from './owner_mvp_flow.mjs';
import {verifyInjectedProviderProtocol} from './synthetic_provider_trace.mjs';

const merchantId='A1B2C3D4E5F6G';
const orderId='FICTIONALORDER1';
const captureId='FICTIONALCAPTURE1';
const quoteId='operator_mvp_01';
const need=(ok,why)=>{if(!ok)throw Error('OFFLINE_MVP_'+why)};
const json=data=>({status:200,json:async()=>data});
export async function runOfflineOperatorMvpSmoke(){
  const folder=mkdtempSync(join(tmpdir(),'paypal-mvp-offline-smoke-'));
  let ledger,aiStore,sessionStore;
  let buyerApproved=false,captured=false;
  const calls=[],consents=[];
  // EXPLICIT injected transport: no global fetch, no implicit http/https.
  async function fakeFetch(url,{method='GET',body}={}){
    const address=new URL(url),path=address.pathname;
    const isGemini=address.origin==='https://generativelanguage.googleapis.com';
    const isPayPal=address.origin==='https://api-m.sandbox.paypal.com';
    need(isGemini||isPayPal,'UNAPPROVED_FAKE_HOST');
    const observed={kind:isGemini?'FAKE_GEMINI':'FAKE_PAYPAL',method,path};
    calls.push(observed);
    if(isGemini){
      need(method==='POST'&&path.includes(':generateContent'),'GEMINI_CONTRACT');
      return json({candidates:[{finishReason:'STOP',content:{
        parts:[{text:JSON.stringify({skills:['web','payments','qa']})}]}}]});
    }
    if(path==='/v1/oauth2/token'&&method==='POST')
      return json({access_token:'FICTIONAL_ACCESS_TOKEN',token_type:'Bearer'});
    if(path==='/v2/checkout/orders'&&method==='POST'){
      const p=JSON.parse(body);
      need(p.intent==='CAPTURE'&&p.purchase_units?.length===1,'ORDER_INTENT');
      need(p.purchase_units[0].reference_id===quoteId &&
        p.purchase_units[0].payee?.merchant_id===merchantId &&
        p.purchase_units[0].amount?.value==='1.50','ORDER_BINDING');
      need(p.payment_source?.paypal?.experience_context?.return_url===
        'https://checkout.example.org/checkout/paypal/return','ORDER_RETURN');
      return {status:201,json:async()=>({
        id:orderId,status:'PAYER_ACTION_REQUIRED',
        links:[{rel:'payer-action',href:
          'https://www.sandbox.paypal.com/checkoutnow?token='+orderId}]
      })};
    }
    if(path==='/v2/checkout/orders/'+orderId && method==='GET'){
      const status=captured?'COMPLETED':
        buyerApproved?'APPROVED':'PAYER_ACTION_REQUIRED';
      observed.observedStatus=status;
      return json({id:orderId,intent:'CAPTURE',status,
        purchase_units:[{reference_id:quoteId,
          payee:{merchant_id:merchantId},
          amount:{currency_code:'USD',value:'1.50'},
          ...(captured?{payments:{captures:[{
            id:captureId,status:'COMPLETED',
            amount:{currency_code:'USD',value:'1.50'}
          }]}}:{})
        }]});
    }
    if(path==='/v2/checkout/orders/'+orderId+'/capture'&&method==='POST'){
      need(buyerApproved,'FAKE_BUYER_NOT_APPROVED');
      captured=true;
      return {status:201,json:async()=>({id:orderId,status:'COMPLETED'})};
    }
    throw Error('OFFLINE_MVP_UNEXPECTED_PROVIDER_PATH');
  }
  try{
    ledger=createSqliteLedger({filename:join(folder,'quote.sqlite')});
    aiStore=createMarketplaceAiBudgetStore({filename:join(folder,'ai.sqlite')});
    sessionStore=createPilotCheckoutSessionStore({filename:join(folder,'session.sqlite')});
    const provider=createGeminiMarketplaceSkillProvider({
      apiKey:'FAKE_GEMINI_KEY_NOT_REAL',ownerAuthorized:true,
      freeTierConfirmed:true,fetchImpl:fakeFetch
    });
    const transport=createSandboxTransport({
      clientId:'FAKE_CLIENT_NOT_REAL',clientSecret:'FAKE_SECRET_NOT_REAL',
      fetchImpl:fakeFetch
    });
    const flow=createOwnerMvpFlow({
      ledger,aiStore,sessionStore,geminiProvider:provider,
      paypalTransport:transport,merchantId,
      publicOrigin:'https://checkout.example.org',
      authorizeStage:async decision=>{
        // Consent is simulated strictly for this one-shot fictional fixture.
        const name=decision.action||decision.operation;
        consents.push(name);
        return ['GEMINI_SKILL_CLASSIFICATION_ONCE',
          'APPROVE_SYNTHETIC_USD_1_50',
          'ISSUE_OWNER_SANDBOX_CHECKOUT_SESSION',
          'CREATE_SANDBOX_ORDER','CAPTURE_SANDBOX_ORDER'].includes(name);
      }
    });
    const match=await flow.classify();
    need(match.skills.join(',')==='web,payments,qa','AI_SKILLS');
    need(match.selectedProfileEligible&&match.missingSkills.length===0 &&
      match.selectedSyntheticProfile==='synthetic-commerce',
      'FULL_SKILL_MATCH_MUST_BE_ELIGIBLE');
    const approved=await flow.approveQuote();
    need(approved.amountMinor===150&&approved.amountSource==='HUMAN_ONLY','PRICE_CONSENT');
    const opened=await flow.createOrder();
    need(opened.status==='BUYER_APPROVAL_PENDING'&&opened.providerGetChecked,
      'BUYER_PENDING');
    const blocked=await flow.capture();
    need(blocked.status==='BUYER_APPROVAL_PENDING' &&
      blocked.capturePerformed===false,'PREMATURE_CAPTURE_DENIED');
    // Only this offline fixture simulates a buyer now approving in PayPal.
    buyerApproved=true;
    need((await flow.refresh()).status==='ORDER_APPROVED','BUYER_GET');
    const paid=await flow.capture();
    need(paid.status==='PAID'&&paid.paymentState==='VERIFIED_BY_GET',
      'SIMULATED_CAPTURE_RECONCILE');
    const final=await flow.reconcile();
    need(final.status==='PAID'&&final.captureId===captureId,'DURABLE_CAPTURE_GET');
    const quote=await ledger.get(quoteId);
    need(quote.status==='APPROVED'&&quote.approval?.amountMinor===150,
      'DURABLE_APPROVED_QUOTE');
    const attempts=await ledger.listAttempts(quoteId);
    need(attempts.length===2,'DURABLE_PAYMENT_CLAIMS');
    const n=(method,path)=>calls.filter(x=>x.method===method&&x.path===path).length;
    need(n('POST','/v2/checkout/orders')===1 &&
      n('POST','/v2/checkout/orders/'+orderId+'/capture')===1,'ONLY_ONE_POST_EACH');
    need(calls.filter(x=>x.kind==='FAKE_GEMINI').length===1,'ONE_GEMINI_REQUEST');
    need(consents.join('|')===
      ['GEMINI_SKILL_CLASSIFICATION_ONCE','APPROVE_SYNTHETIC_USD_1_50',
        'ISSUE_OWNER_SANDBOX_CHECKOUT_SESSION','CREATE_SANDBOX_ORDER',
        'CAPTURE_SANDBOX_ORDER'].join('|'),'EXPLICIT_STAGE_CONSENTS');
    const fakeProviderProtocol=verifyInjectedProviderProtocol({calls,consents});
    return Object.freeze({
      status:'MOCK_MVP_E2E_PASS',
      scope:'SYNTHETIC_PROVIDER_FIXTURE_ONLY',
      realGeminiCalls:0,realPayPalCalls:0,realPaymentCaptured:false,
      syntheticQuoteCurrency:'USD',syntheticQuoteAmount:'1.50',
      syntheticSkillSource:'INJECTED_FAKE_GEMINI',
      selectedProfile:match.selectedSyntheticProfile,
      missingSkills:match.missingSkills,
      simulatedBuyerApproved:true,
      mockCaptureState:'PAID_VERIFIED_BY_INJECTED_PROVIDER_GET',
      privateSqliteLedgerVerified:true,
      syntheticOperationClaims:attempts.length,
      createPostsToFakeTransport:1,capturePostsToFakeTransport:1,
      implicitNetworkAccess:false,automaticRetry:false,
      fakeProviderProtocol
    });
  }finally{
    try{sessionStore?.close()}catch{}
    try{aiStore?.close()}catch{}
    try{ledger?.close()}catch{}
    rmSync(folder,{recursive:true,force:true});
  }
}
