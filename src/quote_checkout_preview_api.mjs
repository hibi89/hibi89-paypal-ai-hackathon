// Local synthetic quote -> genuine pure PayPal Orders v2 planning code.
// GET only; no credentials, external PayPal/Gemini calls, order or capture.
import {planOrder,approvedAmount} from './payment_contract.mjs';
const reply=(status,value,extra={})=>new Response(JSON.stringify(value),{
 status,headers:{'content-type':'application/json; charset=utf-8',
 'cache-control':'no-store','x-content-type-options':'nosniff',...extra}});
export function createQuoteCheckoutPreviewApi({repository,resolveSession,quoteId='sample-project'}={}){
 if(typeof repository?.get!=='function'||typeof resolveSession!=='function'||
    !/^[A-Za-z0-9_-]{1,64}$/.test(quoteId))
   throw TypeError('PREVIEW_DEPENDENCIES_REQUIRED');
 return async request=>{
  if(!(request instanceof Request))return reply(400,{error:'REQUEST_REQUIRED'});
  if(request.method!=='GET')return reply(405,{error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
  if(new URL(request.url).pathname!=='/api/demo/quote-checkout-preview')
    return reply(404,{error:'NOT_FOUND'});
  try{
   const session=await resolveSession(request);
   if(session?.verified!==true||session.actorId!=='synthetic-owner'||
      session.merchantId!=='synthetic-merchant')
     return reply(404,{error:'LOCAL_OWNER_QUOTE_NOT_FOUND'});
   const quote=await repository.get(quoteId);
   if(!quote||quote.id!==quoteId||quote.ownerId!==session.actorId||
      quote.merchantId!==session.merchantId)
     return reply(404,{error:'LOCAL_OWNER_QUOTE_NOT_FOUND'});
   if(quote.status!=='APPROVED'||quote.approval?.actorId!==quote.ownerId)
     return reply(409,{error:'HUMAN_QUOTE_APPROVAL_REQUIRED'});
   const amountMinor=approvedAmount(quote);
   const plan=planOrder(quote),unit=plan.body?.purchase_units?.[0];
   if(plan.method!=='POST'||plan.path!=='/v2/checkout/orders'||
     plan.body?.intent!=='CAPTURE'||plan.body.purchase_units.length!==1||
     unit.reference_id!==quote.id||unit.payee?.merchant_id!==quote.merchantId||
     unit.amount?.value!==(amountMinor/100).toFixed(2))
     throw Error('ORDER_PLAN_MISMATCH');
   // No outgoing request, IDs, idempotency header, merchant ID or raw payload.
   return reply(200,{status:'LOCAL_APPROVED_QUOTE_PAYPAL_PLAN_ONLY',
     source:'PERSISTED_SYNTHETIC_SQLITE_APPROVAL',
     quoteId:quote.id,quoteVersion:quote.version,amountMinor,
     currency:'USD',amount:unit.amount.value,
     plannedMethod:'POST_NOT_SENT',plannedPath:plan.path,
     sandboxMerchantConnected:false,buyerApprovalObserved:false,
     orderCreated:false,capturePerformed:false,externalProviderCalls:0,
     executionAuthorized:false,liveCheckout:false});
  }catch{return reply(503,{error:'LOCAL_ORDER_PREVIEW_NOT_VERIFIED'});}
 };
}
