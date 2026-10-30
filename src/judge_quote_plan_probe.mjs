// Reproduce approved quote -> pure PayPal Orders/Capture/GET domain planning
// on the REAL loopback SQLite demo for each marketplace category independently.
// All buyer/order/capture responses are fabricated in memory. Never calls real
// PayPal/Gemini, reads owner private data, or sends a payment request.
import {startOfflineDemo} from './offline_demo_server.mjs';

const requireProof=(ok,code)=>{if(!ok)throw Error(code)};
const FLOW_STAGES=Object.freeze([
 'STORED_HUMAN_APPROVAL','ORDER_CREATE_PLANNED_NOT_SENT',
 'FICTIONAL_BUYER_PENDING','EARLY_CAPTURE_BLOCKED',
 'FICTIONAL_BUYER_APPROVED','CAPTURE_PLANNED_NOT_SENT',
 'FICTIONAL_GET_COMPLETED','FOREIGN_AMOUNT_BLOCKED',
 'FAKE_DOMAIN_RECONCILIATION_MATCHED'
]);
const CASES=Object.freeze([
 {vertical:'ai_work',brief:'Build an ecommerce website with PayPal checkout',
   scope:'Synthetic website with PayPal checkout integration',
   expectedProfile:'synthetic-web',amountMinor:1500},
 {vertical:'general_services',brief:'Design a new logo and brand identity',
   scope:'Synthetic logo and brand identity design',
   expectedProfile:'synthetic-creative',amountMinor:2900}
]);
async function fetchLocal(url,{method='GET',csrfToken,body}={}){
 const base={method,redirect:'error',signal:AbortSignal.timeout(8000)};
 if(method==='POST'){
   const origin=new URL(url).origin;
   base.headers={'origin':origin,'content-type':'application/json',
      'x-csrf-token':csrfToken};
   base.body=JSON.stringify(body);
 }
 return fetch(url,base);
}
export function verifyQuoteBoundJudgeProof(preview,{amountMinor,version=2}={}){
 requireProof(preview&&typeof preview==='object'&&!Array.isArray(preview),
   'JUDGE_QUOTE_PREVIEW_MISSING');
 requireProof(preview.status==='LOCAL_APPROVED_QUOTE_PAYPAL_PLAN_ONLY'&&
   preview.source==='PERSISTED_SYNTHETIC_SQLITE_APPROVAL'&&
   preview.quoteId==='sample-project'&&preview.quoteVersion===version&&
   preview.amountMinor===amountMinor&&preview.currency==='USD'&&
   preview.amount===(amountMinor/100).toFixed(2)&&
   preview.plannedMethod==='POST_NOT_SENT'&&
   preview.plannedPath==='/v2/checkout/orders'&&
   preview.externalProviderCalls===0&&
   preview.orderCreated===false&&preview.capturePerformed===false&&
   preview.executionAuthorized===false&&
   preview.sandboxMerchantConnected===false,
   'JUDGE_QUOTE_PLAN_MISMATCH');
 const flow=preview.quoteBoundFakeFlow;
 requireProof(flow?.mode==='PURE_DOMAIN_FAKE_PAYPAL_EVENTS_NO_HTTP'&&
   flow.quoteId===preview.quoteId&&
   flow.quoteVersion===preview.quoteVersion&&
   flow.amountMinor===amountMinor&&flow.amount===preview.amount&&
   flow.currency==='USD'&&
   Array.isArray(flow.steps)&&
   JSON.stringify(flow.steps)===JSON.stringify(FLOW_STAGES)&&
   flow.blockedPrematureCapture===true&&
   flow.blockedMismatchedCapture===true&&
   flow.fakeDomainReconcilePassed===true&&
   flow.providerCalls===0&&flow.paymentPosts===0&&
   flow.ledgerMutations===0&&
   flow.buyerApprovalWasReal===false&&flow.paymentWasReal===false&&
   flow.liveAIUsed===false&&flow.productionReady===false,
   'JUDGE_QUOTE_FAKE_FLOW_MISMATCH');
 // The returned projection MUST omit private merchant binding, transport IDs,
 // provider tokens and raw order payload, even with fake data.
 const raw=JSON.stringify(preview);
 requireProof(!/synthetic-merchant|requestId|merchantId|access_token|client_secret|checkoutnow|PayerID/i.test(raw),
   'JUDGE_SENSITIVE_ORDER_PROJECTION');
 return Object.freeze({
   quoteVersion:preview.quoteVersion,approvedAmount:preview.amount,
   amountSource:'LOCAL_SQLITE_HUMAN_APPROVAL_FIXTURE',
   planSource:'EXISTING_PURE_PAYPAL_ORDER_CAPTURE_RECONCILIATION_FUNCTIONS',
   fakeDomainStages:flow.steps.length,
   prematureCaptureBlocked:true,foreignAmountBlocked:true,
   actualProviderCalls:0,paymentPosts:0,
   buyerApprovalReal:false,paymentReal:false
 });
}
export async function reproduceQuoteBoundJudgeFlow(){
 const results=[];
 for(const scenario of CASES){
  const app=await startOfflineDemo();
  try{
   requireProof(/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(app.url),
     'JUDGE_LOOPBACK_REQUIRED');
   const sessionResp=await fetchLocal(app.url+'/demo/session');
   requireProof(sessionResp.status===200,'JUDGE_SESSION_UNAVAILABLE');
   const session=await sessionResp.json();
   requireProof(session.mode==='OFFLINE_MOCK'&&session.role==='owner'&&
      session.quoteId==='sample-project'&&
      typeof session.csrfToken==='string'&&session.csrfToken.length>20,
      'JUDGE_SYNTHETIC_OWNER_REQUIRED');
   const planUrl=app.url+'/api/demo/quote-checkout-preview';
   const preflight=await fetchLocal(planUrl);
   requireProof(preflight.status===409,'JUDGE_UNAPPROVED_ORDER_PLAN_MUST_DENY');
   const send=async(path,body)=>{
     const response=await fetchLocal(app.url+path,{
       method:'POST',csrfToken:session.csrfToken,body});
     requireProof(response.status===200,'JUDGE_LOCAL_POST_FAILED');
     return response.json();
   };
   const market=await send('/api/demo/marketplace',{
      vertical:scenario.vertical,brief:scenario.brief});
   requireProof(market.vertical===scenario.vertical&&
     market.mode==='OFFLINE_SYNTHETIC_NO_AI'&&
     market.profiles?.[0]?.id===scenario.expectedProfile&&
     market.paypal?.status==='NOT_CONNECTED',
     'JUDGE_SYNTHETIC_MATCH_MISMATCH');
   const draft=await send('/api/quotes/sample-project/draft',{
     expectedVersion:1,scope:scenario.scope});
   requireProof(draft.provider==='OFFLINE_MOCK'&&draft.quote?.version===2&&
     draft.quote?.status==='PROPOSED',
     'JUDGE_LOCAL_DRAFT_INVALID');
   const approved=await send('/api/quotes/sample-project/approve',{
     expectedVersion:2,confirmed:true,amountMinor:scenario.amountMinor});
   requireProof(approved.quote?.version===2&&
     approved.quote?.status==='APPROVED'&&
     approved.quote.approval?.amountMinor===scenario.amountMinor,
     'JUDGE_LOCAL_APPROVAL_INVALID');
   const planResp=await fetchLocal(planUrl);
   requireProof(planResp.status===200,'JUDGE_LOCAL_ORDER_PLAN_FAILED');
   const verified=verifyQuoteBoundJudgeProof(await planResp.json(),{
     version:2,amountMinor:scenario.amountMinor});
   const original=(await (await fetchLocal(app.url+'/api/quotes/sample-project')).json()).quote;
   requireProof(original.version===2&&
     original.approval?.amountMinor===scenario.amountMinor,
     'JUDGE_QUOTE_APPROVAL_NOT_PERSISTED');
   const payment=await fetchLocal(app.url+'/api/quotes/sample-project/payment');
   requireProof(payment.status===503,'JUDGE_OFFLINE_PAYMENT_MUST_BE_DISABLED');
   const after=(await (await fetchLocal(planUrl)).json());
   verifyQuoteBoundJudgeProof(after,{version:2,amountMinor:scenario.amountMinor});
   results.push(Object.freeze({
     vertical:scenario.vertical,syntheticProfile:scenario.expectedProfile,
     ...verified,localMarketplacePosts:1,localDraftPosts:1,
     localHumanApprovalFixturePosts:1,localPaymentPosts:0,
     realProviderCalls:0,paymentEndpointStatus:503
   }));
  }finally{await app.close();}
 }
 return Object.freeze({
  status:'TWO_APPROVED_QUOTE_PLANS_REPRODUCED_SYNTHETIC_ONLY',
  source:'TWO_ISOLATED_REAL_LOOPBACK_SQLITE_SESSIONS',
  categories:Object.freeze(results),
  totalPureFakeDomainStages:18,
  realGeminiCalls:0,realPayPalCalls:0,actualPaymentPosts:0,
  ownerPrivateReceiptRead:false,providerPaymentVerified:false,
  realSellersVerified:false,publicDeploymentVerified:false
 });
}
