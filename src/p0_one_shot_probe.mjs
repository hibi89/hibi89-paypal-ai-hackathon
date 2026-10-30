// P0 one-shot owner-operated evidence probe. NOT called by CI or the app.
// Default: NO NETWORK. Real calls require two explicit CLI flags and private env.
// Only Sandbox OAuth POST or one synthetic Gemini free-project generateContent POST.
// Zero provider calls, Live, checkout create/capture, secret printing, log bodies, or retries.
const PAYPAL_URL='https://api-m.sandbox.paypal.com/v1/oauth2/token';
import {GEMINI_P0_MODEL,GEMINI_P0_ENDPOINT} from './gemini_p0_model.mjs';
const PROMPT='Write one short sentence about a fictional website landing page design task.';
const has=x=>typeof x==='string'&&x.trim().length>0;
const ok=(provider,status,other={})=>Object.freeze({provider,status,networkCalls:0,
  externalEvidence:false,accountFreeTierVerified:false,credentialsReported:false,...other});
export async function runP0OneShotProbe({
  provider,execute=false,ownerAuthorized=false,freeTierConfirmed=false,
  env={},fetchImpl,reserveAttempt
}={}){
 if(!['paypal','gemini'].includes(provider))return ok('unspecified','INVALID_PROVIDER');
 if(!execute||!ownerAuthorized)return ok(provider,'DRY_RUN_OWNER_APPROVAL_REQUIRED');
 if(provider==='gemini'&&!freeTierConfirmed)
   return ok(provider,'FREE_TIER_OWNER_CONFIRMATION_REQUIRED');
 if(!env||typeof env!=='object')return ok(provider,'LOCAL_ENV_UNAVAILABLE');
 const missing=provider==='paypal'
   ?!has(env.PAYPAL_SANDBOX_CLIENT_ID)||!has(env.PAYPAL_SANDBOX_CLIENT_SECRET)
   :!has(env.GEMINI_API_KEY);
 if(missing)return ok(provider,'PRIVATE_CREDENTIALS_NOT_CONFIGURED');
 if(typeof fetchImpl!=='function')return ok(provider,'EXPLICIT_FETCH_REQUIRED');
 // Owner CLI injects a durable one-shot reservation before any remote HTTP.
 if(reserveAttempt!==undefined){
  if(typeof reserveAttempt!=='function')
   return ok(provider,'PROBE_RESERVATION_UNAVAILABLE');
  let result;
  try{result=await reserveAttempt(provider);}
  catch{return ok(provider,'PROBE_RESERVATION_UNAVAILABLE');}
  if(result!=='CLAIMED')
   return ok(provider,result==='ALREADY_CLAIMED'
    ?'PROBE_ALREADY_CLAIMED_NO_RETRY':'PROBE_RESERVATION_UNAVAILABLE');
 }
 // No retry, no redirects, fixed allowlisted endpoint, no arbitrary payload/model.
 const url=provider==='paypal'?PAYPAL_URL:GEMINI_P0_ENDPOINT;
 const options=provider==='paypal'?{
  method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
  headers:{
   'accept':'application/json',
   'content-type':'application/x-www-form-urlencoded',
   authorization:'Basic '+Buffer.from(
    env.PAYPAL_SANDBOX_CLIENT_ID+':'+env.PAYPAL_SANDBOX_CLIENT_SECRET
   ).toString('base64')
  },body:'grant_type=client_credentials'
 }:{
  method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
  headers:{
   'accept':'application/json','content-type':'application/json',
   'x-goog-api-key':env.GEMINI_API_KEY
  },body:JSON.stringify({
   contents:[{role:'user',parts:[{text:PROMPT}]}],
   generationConfig:{maxOutputTokens:96}
  })
 };
 let response;
 try{response=await fetchImpl(url,options)}
 catch{return ok(provider,'REMOTE_NETWORK_FAILED',{networkCalls:1});}
 const httpStatus=Number.isInteger(response?.status)?response.status:null;
 // Never emit provider error JSON, which may embed keys, prompts, or personal details.
 if(httpStatus===null||httpStatus<200||httpStatus>=300)
   return ok(provider,'REMOTE_HTTP_NOT_SUCCESS',{networkCalls:1,
     httpStatus:httpStatus!==null&&httpStatus>=100&&httpStatus<600?httpStatus:null});
 let body;
 try{body=await response.json()}
 catch{return ok(provider,'REMOTE_JSON_INVALID',{networkCalls:1,httpStatus});}
 if(provider==='paypal'){
  if(!has(body?.access_token)||body?.token_type!=='Bearer'||
     !Number.isFinite(body?.expires_in)||body.expires_in<=0)
    return ok(provider,'SANDBOX_OAUTH_RESPONSE_INVALID',{networkCalls:1,httpStatus});
  // No token, scopes, app ID, account ID or provider content ever printed.
  return ok(provider,'SANDBOX_OAUTH_REACHED',{networkCalls:1,httpStatus,
   externalEvidence:true,evidenceKind:'SANDBOX_OAUTH_RESPONSE_SHAPE_ONLY'});
 }
 const parts=body?.candidates?.[0]?.content?.parts;
 const text=Array.isArray(parts)?parts.filter(x=>typeof x?.text==='string')
   .map(x=>x.text).join(''):'';
 const finish=body?.candidates?.[0]?.finishReason;
 if(!has(text)||finish!=='STOP')
  return ok(provider,'GEMINI_GENERATION_RESPONSE_INVALID',{networkCalls:1,httpStatus});
 // No generated text, token counts, request IDs, or private quota/billing IDs.
 return ok(provider,'GEMINI_TEXT_GENERATED',{networkCalls:1,httpStatus,
  externalEvidence:true,evidenceKind:'SINGLE_SYNTHETIC_TEXT_RESPONSE',
  model:GEMINI_P0_MODEL,
  accountFreeTierVerified:false
 });
}

export function parseP0ProbeArgs(argv=[]){
 const args=new Set(argv);
 const provider=args.has('--paypal')&&!args.has('--gemini')?'paypal':
   args.has('--gemini')&&!args.has('--paypal')?'gemini':'unspecified';
 // Unknown flags fail closed (avoid accidental invocation with typos).
 const known=new Set(['--paypal','--gemini','--execute','--owner-authorized',
   '--free-tier-confirmed']);
 return Object.freeze({
  provider:argv.some(x=>!known.has(x))?'unspecified':provider,
  execute:args.has('--execute'),ownerAuthorized:args.has('--owner-authorized'),
  freeTierConfirmed:args.has('--free-tier-confirmed')
 });
}
