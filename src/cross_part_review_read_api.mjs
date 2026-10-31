// Opt-in trusted-host read-only projection. Not mounted on demo/public server.
// No browser-provided role, consent, merchant or payment authorization.
import {reply} from './quote_api.mjs';
const ID=/^[A-Za-z0-9_-]{1,64}$/;
export function createCrossPartReviewReadApi({bridge}={}){
 if(typeof bridge?.inspect!=='function'||bridge.publicHttpEnabled!==false||
    bridge.autoPaymentAuthorized!==false)
  throw new TypeError('PRIVATE_REVIEW_BRIDGE_REQUIRED');
 return async function handle(request){
  if(!(request instanceof Request))return reply({error:'REQUEST_REQUIRED'},400);
  const url=new URL(request.url);
  if(url.pathname!=='/api/private/cross-part/review')
   return reply({error:'NOT_FOUND'},404);
  if(request.method!=='GET')
   return reply({error:'METHOD_NOT_ALLOWED'},405,{allow:'GET'});
  const keys=[...url.searchParams.keys()];
  if(keys.length!==1||keys[0]!=='quoteId'||
     !ID.test(url.searchParams.get('quoteId')??''))
   return reply({error:'INVALID_QUOTE_ID'},400);
  try{
   const review=await bridge.inspect({hostHandle:request,quoteId:url.searchParams.get('quoteId')});
   if(review?.paymentAuthorized!==false||review?.paypalOrderCreated!==false||
      review?.paypalCapturePerformed!==false||review?.realProviderEvidence!==false)
    return reply({error:'REVIEW_EVIDENCE_UNAVAILABLE'},503);
   return reply({review,readOnly:true,providerCalls:0,
     mode:'PRIVATE_SYNTHETIC_REVIEW_ONLY'},200,{'cache-control':'no-store'});
  }catch{
   // No tenant, role, quote existence or internal error details to unauthorized clients.
   return reply({error:'REVIEW_NOT_FOUND'},404,{'cache-control':'no-store'});
  }
 };
}
