// Server-only PayPal Sandbox OAuth2 client_credentials token source.
// NEVER enable a real network connection without explicit owner approval.
// No payment endpoints; token POST is solely for authenticating read-only GET.
// Reference: https://developer.paypal.com/api/rest/authentication
import {createPinnedPayPalSandboxGetTransport} from './worker_pinned_paypal_sandbox_get.mjs';

const OAUTH_URL='https://api-m.sandbox.paypal.com/v1/oauth2/token';
const CLIENT=/^[\x21-\x7e]{8,256}$/;
const SECRET=/^[\x21-\x7e]{8,512}$/;
const BEARER=/^[A-Za-z0-9._~+\-]{8,4096}$/;
const MAX_BODY=8192;
const branded=new WeakSet();
const fail=code=>{const e=new Error(code);e.code=code;return e;};

export const isPinnedSandboxOAuthTokenSource=value=>
 !!value&&typeof value==='object'&&branded.has(value);

async function guardedRead(response,deadline){
 if(!(response instanceof Response)||response.redirected||
    (response.url&&response.url!==OAUTH_URL))
  throw fail('SANDBOX_OAUTH_REDIRECT_OR_SOURCE_REJECTED');
 if(response.status===429)throw fail('SANDBOX_OAUTH_RATE_LIMIT_NO_RETRY');
 if(response.status===401||response.status===403)
  throw fail('SANDBOX_OAUTH_CREDENTIALS_REJECTED');
 if(response.status!==200)throw fail('SANDBOX_OAUTH_PROVIDER_UNAVAILABLE_NO_RETRY');
 if(!/^application\/json(?:\s*;.*)?$/i.test(response.headers.get('content-type')??''))
  throw fail('SANDBOX_OAUTH_RESPONSE_INVALID');
 const declared=response.headers.get('content-length');
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>MAX_BODY))
  throw fail('SANDBOX_OAUTH_RESPONSE_INVALID');
 if(!response.body)throw fail('SANDBOX_OAUTH_RESPONSE_INVALID');
 const reader=response.body.getReader(),pieces=[];let count=0;
 try{
  for(;;){
   const {value,done}=await deadline(()=>reader.read());
   if(done)break;
   if(!(value instanceof Uint8Array)||(count+=value.byteLength)>MAX_BODY)
    throw fail('SANDBOX_OAUTH_RESPONSE_INVALID');
   pieces.push(value);
  }
 }finally{
  // Cancellation is best effort: never wait for a broken remote stream.
  try{const result=reader.cancel();result?.catch?.(()=>{});}catch{}
  try{reader.releaseLock();}catch{}
 }
 const raw=new Uint8Array(count);let offset=0;
 for(const item of pieces){raw.set(item,offset);offset+=item.byteLength;}
 let payload;
 try{payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}
 catch{throw fail('SANDBOX_OAUTH_RESPONSE_INVALID');}
 if(!payload||Array.isArray(payload)||typeof payload!=='object'||
    payload.token_type!=='Bearer'||typeof payload.access_token!=='string'||
    !BEARER.test(payload.access_token)||
    !Number.isSafeInteger(payload.expires_in)||
    payload.expires_in<1||payload.expires_in>86400)
  throw fail('SANDBOX_OAUTH_RESPONSE_INVALID');
 return {token:payload.access_token,expiresIn:payload.expires_in};
}

export function createPinnedSandboxOAuthTokenSource({
 enabled=false,clientId,clientSecret,fetchImpl=fetch,
 now=Date.now,timeoutMs=5000
}={}){
 if(enabled!==true||typeof clientId!=='string'||!CLIENT.test(clientId)||
    clientId.includes(':')||typeof clientSecret!=='string'||!SECRET.test(clientSecret)||
    typeof fetchImpl!=='function'||typeof now!=='function'||
    !Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>10000)
  throw fail('SANDBOX_OAUTH_EXPLICIT_CONFIG_REQUIRED');
 // Do not leak ID/secret through toString(), exceptions or responses.
 const basic=btoa(clientId+':'+clientSecret);
 let cached=null,expiresAt=0,pending=null;
 async function fetchNewToken(){
  const controller=new AbortController();let timer;
  const expired=new Promise((_,reject)=>{
   timer=setTimeout(()=>{
    controller.abort();reject(fail('SANDBOX_OAUTH_TIMEOUT_NO_RETRY'));
   },timeoutMs);
  });
  const deadline=fn=>Promise.race([Promise.resolve().then(fn),expired]);
  try{
   const response=await deadline(()=>fetchImpl(OAUTH_URL,{
    method:'POST',redirect:'error',signal:controller.signal,
    headers:{authorization:'Basic '+basic,
     accept:'application/json','content-type':'application/x-www-form-urlencoded'},
    body:'grant_type=client_credentials'
   }));
   const result=await guardedRead(response,deadline);
   const timestamp=now();
   if(!Number.isSafeInteger(timestamp)||timestamp<1)
    throw fail('SANDBOX_OAUTH_CLOCK_INVALID');
   const ttl=result.expiresIn*1000;
   const early=Math.min(60000,Math.max(1,Math.floor(ttl/5)));
   cached=result.token;
   expiresAt=timestamp+ttl-early;
   return result.token;
  }catch(e){
   if(controller.signal.aborted)throw fail('SANDBOX_OAUTH_TIMEOUT_NO_RETRY');
   if(e?.code)throw e;
   throw fail('SANDBOX_OAUTH_NETWORK_UNAVAILABLE_NO_RETRY');
  }finally{clearTimeout(timer);}
 }
 function withCallerAbort(work,signal){
  if(signal?.aborted)return Promise.reject(fail('SANDBOX_OAUTH_CALLER_ABORTED'));
  if(!signal)return work;
  let listener;
  const aborted=new Promise((_,reject)=>{
   listener=()=>reject(fail('SANDBOX_OAUTH_CALLER_ABORTED'));
   signal.addEventListener('abort',listener,{once:true});
  });
  return Promise.race([work,aborted]).finally(()=>{
   signal.removeEventListener('abort',listener);
  });
 }
 const source=Object.freeze({
  async getAccessToken({signal}={}){
   if(signal?.aborted)throw fail('SANDBOX_OAUTH_CALLER_ABORTED');
   const timestamp=now();
   if(!Number.isSafeInteger(timestamp)||timestamp<1)
    throw fail('SANDBOX_OAUTH_CLOCK_INVALID');
   if(cached&&timestamp<expiresAt)return cached;
   if(!pending){
    pending=fetchNewToken().finally(()=>{pending=null;});
   }
   return withCallerAbort(pending,signal);
  }
 });
 branded.add(source);
 return source;
}

// Safer composition: same pinned Sandbox client handles OAuth token POST and
// the subsequent GET. There is no PayPal Orders CREATE/CAPTURE code here.
export function createPinnedSandboxGetWithOAuth({
 enabled=false,clientId,clientSecret,fetchImpl=fetch,
 now=Date.now,tokenTimeoutMs=5000,orderTimeoutMs=8000
}={}){
 const source=createPinnedSandboxOAuthTokenSource({enabled,clientId,clientSecret,
  fetchImpl,now,timeoutMs:tokenTimeoutMs});
 return createPinnedPayPalSandboxGetTransport({enabled,fetchImpl,
  getAccessToken:source.getAccessToken,timeoutMs:orderTimeoutMs});
}
