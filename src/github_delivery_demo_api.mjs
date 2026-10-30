// Synthetic delivery-review endpoint: accepts only explicitly labeled, unverified fixtures.
import {assessGithubDelivery} from './github_delivery_review.mjs';
import {reply,parseSmallJson,QuoteApiError} from './quote_api.mjs';
export function createGithubDeliveryDemoApi({resolveSession}={}){
 if(typeof resolveSession!=='function')throw new TypeError('SESSION_REQUIRED');
 return async request=>{
  try{
   if(request.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405,{allow:'POST'});
   const url=new URL(request.url);
   if(url.pathname!=='/api/demo/github-delivery')return reply({error:'NOT_FOUND'},404);
   const session=await resolveSession(request);
   if(!session?.verified||session.actorId!=='synthetic-owner'||session.merchantId!=='synthetic-merchant'||!session.csrfToken)return reply({error:'OWNER_ONLY'},403);
   if(request.headers.get('origin')!==url.origin||request.headers.get('x-csrf-token')!==session.csrfToken)return reply({error:'CSRF_REQUIRED'},403);
   const data=await parseSmallJson(request);
   if(data.acknowledgeSynthetic!==true)return reply({error:'SYNTHETIC_ACK_REQUIRED'},403);
   const result=assessGithubDelivery(data);
   return reply(result);
  }catch(e){
   if(e instanceof QuoteApiError)return reply({error:e.code},e.status);
   if(e instanceof TypeError)return reply({error:'INVALID_DELIVERY_INPUT'},400);
   return reply({error:'INTERNAL_ERROR'},500);
  }
 };
}
