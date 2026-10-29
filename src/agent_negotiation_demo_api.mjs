// Offline, read-only proposal endpoint. Does not authorize payments or call AI/PayPal.
import {negotiateBoundedPrice} from './agent_negotiation_policy.mjs';
import {reply,parseSmallJson,QuoteApiError} from './quote_api.mjs';
export function createNegotiationDemoApi({resolveSession,repository}={}){
 if(typeof resolveSession!=='function'||typeof repository?.get!=='function')throw new TypeError('TRUSTED_DEPENDENCIES_REQUIRED');
 return async function(request){
  try{
   if(request.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405,{allow:'POST'});
   const url=new URL(request.url);
   if(url.pathname!=='/api/demo/negotiate')return reply({error:'NOT_FOUND'},404);
   const session=await resolveSession(request);
   if(!session?.verified||!session.actorId||!session.csrfToken)return reply({error:'AUTHENTICATION_REQUIRED'},401);
   if(request.headers.get('origin')!==url.origin||request.headers.get('x-csrf-token')!==session.csrfToken)
    return reply({error:'CSRF_REQUIRED'},403);
   const data=await parseSmallJson(request);
   if(typeof data.quoteId!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(data.quoteId))return reply({error:'INVALID_QUOTE_ID'},400);
   const quote=await repository.get(data.quoteId);
   if(!quote||quote.ownerId!==session.actorId||quote.merchantId!==session.merchantId)return reply({error:'QUOTE_NOT_FOUND'},404);
   if(quote.status!=='PROPOSED'||quote.version!==data.expectedVersion||quote.rejection)return reply({error:'QUOTE_NOT_NEGOTIABLE'},409);
   const result=negotiateBoundedPrice({buyerMaxMinor:data.buyerMaxMinor,sellerMinMinor:data.sellerMinMinor,openingMinor:data.openingMinor,currency:quote.currency});
   return reply({quoteId:quote.id,quoteVersion:quote.version,source:'OFFLINE_POLICY',...result});
  }catch(e){if(e instanceof QuoteApiError)return reply({error:e.code},e.status);
   if(e instanceof TypeError)return reply({error:'INVALID_NEGOTIATION_INPUT'},400);
   return reply({error:'INTERNAL_ERROR'},500);
  }
 };
}
