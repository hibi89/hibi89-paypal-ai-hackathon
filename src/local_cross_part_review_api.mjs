// Synthetic loopback-only host route for an explicit user-requested
// cross-part review association. Never a PayPal checkout or provider permission.
import {QuoteApiError,parseSmallJson,reply} from './quote_api.mjs';
const ID=/^[A-Za-z0-9_-]{1,64}$/;
const bad=(code,status)=>{throw new QuoteApiError(code,status);};
const blocked=new Set(['CROSS_PART_APPROVED_QUOTE_REQUIRED',
 'CROSS_PART_SCOPED_CONSENT_REQUIRED','CROSS_PART_A2A_EVIDENCE_MISMATCH',
 'CROSS_PART_LINK_CONFLICT','CROSS_PART_LINK_REVOKED',
 'CROSS_PART_CONSENT_ALREADY_LINKED',
 'CROSS_PART_LINK_EXPIRED','CROSS_PART_LINK_STALE',
 'CROSS_PART_EVIDENCE_CHANGED','CROSS_PART_EXPLICIT_REVIEW_REQUIRED']);
export function createLocalCrossPartReviewApi({
 bridge,resolveSession,quoteId,buyerActorId,merchantId
}={}){
 if(bridge?.mode!=='INTERNAL_SYNTHETIC_REVIEW_ONLY'||
  bridge?.publicHttpEnabled!==false||bridge?.autoPaymentAuthorized!==false||
  bridge?.paypalProviderCalls!==0||typeof bridge?.link!=='function'||
  typeof bridge?.inspect!=='function'||typeof bridge?.revoke!=='function'||
  typeof resolveSession!=='function'||
  !ID.test(quoteId??'')||!ID.test(buyerActorId??'')||
  !ID.test(merchantId??''))
  throw new TypeError('LOCAL_CROSS_PART_TRUSTED_DEPENDENCIES_REQUIRED');
 return async function handle(request){
  try{
   if(!(request instanceof Request))bad('REQUEST_REQUIRED',400);
   const url=new URL(request.url);
   if(url.pathname!=='/api/demo/cross-part/review'||url.search!=='')
    bad('NOT_FOUND',404);
   if(!['GET','POST','DELETE'].includes(request.method))
    return reply({error:'METHOD_NOT_ALLOWED'},405,{allow:'GET, POST, DELETE'});
   // Only the server-issued session matters; ignore browser role/merchant IDs.
   const session=await resolveSession(request);
   if(session?.verified!==true||session.actorId!==buyerActorId||
      session.merchantId!==merchantId)
    bad('REVIEW_NOT_FOUND',404);
   if(request.method==='POST'||request.method==='DELETE'){
    if(request.headers.get('origin')!==url.origin||
       typeof session.csrfToken!=='string'||session.csrfToken.length<1||
       request.headers.get('x-csrf-token')!==session.csrfToken)
      bad('CSRF_OR_ORIGIN_REQUIRED',403);
   }
   if(request.method==='DELETE'){
    if(request.headers.has('content-length')&&
       request.headers.get('content-length')!=='0')
     bad('INVALID_REVIEW_REVOCATION',400);
    const withdrawal=await bridge.revoke({hostHandle:request,quoteId});
    return reply({status:'SYNTHETIC_REVIEW_REVOKED',withdrawal,
     paymentAuthorized:false,paypalCapturePerformed:false,
     providerCalls:0,realProviderEvidence:false});
   }
   if(request.method==='POST'){
    const data=await parseSmallJson(request);
    if(Object.keys(data).length!==1||!ID.test(data.consentId??''))
      bad('INVALID_REVIEW_CONSENT',400);
    // Explicit user action. The bridge rechecks the approved quote, one-use
    // consent, signed transcript hash, membership, TTL and replay constraints.
    const review=await bridge.link({hostHandle:request,quoteId,
      consentId:data.consentId});
    return reply({status:'SYNTHETIC_REVIEW_ASSOCIATED',
      review,paymentAuthorized:false,paypalCapturePerformed:false,
      providerCalls:0,realProviderEvidence:false},201);
   }
   const review=await bridge.inspect({hostHandle:request,quoteId});
   return reply({status:'SYNTHETIC_REVIEW_ASSOCIATION_READ_ONLY',
     review,paymentAuthorized:false,paypalCapturePerformed:false,
     providerCalls:0,realProviderEvidence:false});
  }catch(error){
   if(error instanceof QuoteApiError)
    return reply({error:error.code},error.status);
   if(blocked.has(error?.code))
    return reply({error:error.code},409);
   // Do not disclose tenant, membership, or internal DB state.
   return reply({error:'REVIEW_NOT_FOUND'},404);
  }
 };
}
