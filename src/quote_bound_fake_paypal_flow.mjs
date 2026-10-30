// The SAME approved quote drives the real pure PayPal Orders, Capture and
// reconciliation DOMAIN FUNCTIONS, but all PayPal responses below are
// deliberately fabricated in memory. NO network, claims, DB writes or money.
// This is NOT the owner-operated Sandbox and never counts as payment proof.
import {approvedAmount,planOrder,planCapture,reconcileCapture} from './payment_contract.mjs';

export function deriveQuoteBoundFakePayPalFlow(quote){
 const cents=approvedAmount(quote);
 const orderPlan=planOrder(quote);
 const amount=(cents/100).toFixed(2);
 if(orderPlan?.body?.purchase_units?.length!==1||
   orderPlan.body.purchase_units[0]?.amount?.value!==amount||
   orderPlan.body.purchase_units[0]?.reference_id!==quote.id||
   orderPlan.body.purchase_units[0]?.payee?.merchant_id!==quote.merchantId)
   throw Error('FAKE_ORDER_PLAN_BINDING_MISMATCH');
 const id='FICTIONAL_ORDER_NO_PROVIDER_REQUEST';
 const pending={id,status:'PAYER_ACTION_REQUIRED'};
 let prematureCaptureBlocked=false;
 try{planCapture(quote,pending);}
 catch(e){if(e?.code==='PAYPAL_APPROVAL_REQUIRED')prematureCaptureBlocked=true;else throw e;}
 if(!prematureCaptureBlocked)throw Error('PREMATURE_CAPTURE_GATE_BYPASSED');
 const plan=planCapture(quote,{id,status:'APPROVED'});
 if(plan.action!=='CAPTURE_ONCE'||plan.method!=='POST'||
    plan.path!=='/v2/checkout/orders/'+id+'/capture')
   throw Error('FAKE_CAPTURE_PLAN_INVALID');
 const completed={id,status:'COMPLETED'};
 const fakeCapture={id:'FICTIONAL_CAPTURE_NOT_PAID',orderId:id,
   amount:{currency_code:'USD',value:amount},status:'COMPLETED'};
 let mismatchedAmountBlocked=false;
 try{reconcileCapture(quote,completed,{
   ...fakeCapture,amount:{currency_code:'USD',value:'0.01'}});}
 catch(e){if(e?.code==='CAPTURE_AMOUNT_MISMATCH')mismatchedAmountBlocked=true;else throw e;}
 if(!mismatchedAmountBlocked)throw Error('FAKE_AMOUNT_MISMATCH_GATE_BYPASSED');
 const matched=reconcileCapture(quote,completed,fakeCapture);
 if(matched.status!=='PAID'||matched.captureId!==fakeCapture.id)
   throw Error('FAKE_DOMAIN_RECONCILE_INVALID');
 return Object.freeze({
   mode:'PURE_DOMAIN_FAKE_PAYPAL_EVENTS_NO_HTTP',
   quoteId:quote.id,quoteVersion:quote.version,amountMinor:cents,
   amount,currency:'USD',
   steps:Object.freeze([
     'STORED_HUMAN_APPROVAL',
     'ORDER_CREATE_PLANNED_NOT_SENT',
     'FICTIONAL_BUYER_PENDING',
     'EARLY_CAPTURE_BLOCKED',
     'FICTIONAL_BUYER_APPROVED',
     'CAPTURE_PLANNED_NOT_SENT',
     'FICTIONAL_GET_COMPLETED',
     'FOREIGN_AMOUNT_BLOCKED',
     'FAKE_DOMAIN_RECONCILIATION_MATCHED'
   ]),
   blockedPrematureCapture:true,
   blockedMismatchedCapture:true,
   fakeDomainReconcilePassed:true,
   providerCalls:0,paymentPosts:0,ledgerMutations:0,
   buyerApprovalWasReal:false,paymentWasReal:false,
   liveAIUsed:false,productionReady:false
 });
}
