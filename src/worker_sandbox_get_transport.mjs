// Internal, opt-in Cloudflare Worker-compatible PayPal SANDBOX OAuth + Orders GET.
// No create/capture endpoint, no global fetch, no retries, no Live PayPal support.
// OAuth token exchange is POST, but NEVER a money/order POST. Network requires
// a separately approved host and injected fetch implementation.
const BASE='https://api-m.sandbox.paypal.com';
const ORDER=/^[A-Za-z0-9_-]{1,64}$/;
const ASCII=/^[\x21-\x7e]{1,128}$/;
const TOKEN=/^[A-Za-z0-9._~+/-]{8,2048}$/;
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
async function boundedJson(response,max,deadline,expectedUrl){
 if(!(response instanceof Response)||response.status!==200||response.redirected||
    (response.url&&response.url!==expectedUrl)||
    !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??''))
  fail('SANDBOX_RESPONSE_REJECTED');
 const len=response.headers.get('content-length');
 if(len!==null&&(!/^\d{1,6}$/.test(len)||Number(len)>max))
  fail('SANDBOX_RESPONSE_REJECTED');
 if(!response.body)fail('SANDBOX_RESPONSE_REJECTED');
 const parts=[];let size=0,reader=response.body.getReader();
 try{
  while(true){
   const {value,done}=await deadline(()=>reader.read());if(done)break;
   if(!(value instanceof Uint8Array)||(size+=value.length)>max)
    fail('SANDBOX_RESPONSE_REJECTED');
   parts.push(value);
  }
 }catch{fail('SANDBOX_RESPONSE_REJECTED')}
 finally{try{reader.cancel()?.catch?.(()=>{})}catch{}try{reader.releaseLock()}catch{}}
 const bytes=new Uint8Array(size);let offset=0;
 for(const p of parts){bytes.set(p,offset);offset+=p.length}
 let value;
 try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}
 catch{fail('SANDBOX_RESPONSE_REJECTED')}
 if(!value||typeof value!=='object'||Array.isArray(value))
  fail('SANDBOX_RESPONSE_REJECTED');
 return value;
}
export function createWorkerSandboxOrderGetTransport({
 clientId,clientSecret,fetchImpl,networkApproved=false,timeoutMs=5000
}={}){
 if(!ASCII.test(clientId??'')||!ASCII.test(clientSecret??'')||
    typeof fetchImpl!=='function'||!Number.isSafeInteger(timeoutMs)||
    timeoutMs<1000||timeoutMs>10000)
  fail('SANDBOX_GET_TRANSPORT_CONFIG_REQUIRED');
 const credentials=btoa(clientId+':'+clientSecret);
 const allowed=networkApproved===true;

 // One absolute deadline per request, spanning headers AND the complete body.
 // AbortSignal alone cannot bound an injected fetch or a non-cooperative stream.
 async function remoteJson(url,opts,max){
  const controller=new AbortController();let timer;
  const deadlineExceeded=new Promise((_,reject)=>{
   timer=setTimeout(()=>{
    controller.abort();
    const e=new Error('SANDBOX_PROVIDER_TIMEOUT_NO_RETRY');
    e.code='SANDBOX_PROVIDER_TIMEOUT_NO_RETRY';reject(e);
   },timeoutMs);
  });
  const deadline=fn=>Promise.race([Promise.resolve().then(fn),deadlineExceeded]);
  try{
   const response=await deadline(()=>fetchImpl(url,{...opts,redirect:'error',cache:'no-store',
    credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal}));
   return await boundedJson(response,max,deadline,url);
  }catch(e){
   if(controller.signal.aborted)fail('SANDBOX_PROVIDER_TIMEOUT_NO_RETRY');
   if(e?.code==='SANDBOX_RESPONSE_REJECTED')throw e;
   fail('SANDBOX_PROVIDER_UNAVAILABLE');
  }finally{clearTimeout(timer)}
 }
 return Object.freeze({
  mode:'PAYPAL_SANDBOX_READ_ONLY',
  networkEnabled:allowed,paymentPostsEnabled:false,autoRetry:false,
  async getOrder(orderId){
   if(!allowed)fail('SANDBOX_GET_NETWORK_NOT_AUTHORIZED');
   if(!ORDER.test(orderId??''))fail('SANDBOX_ORDER_ID_INVALID');
   const tokens=await remoteJson(BASE+'/v1/oauth2/token',{
    method:'POST',headers:{authorization:'Basic '+credentials,
     'content-type':'application/x-www-form-urlencoded',accept:'application/json'},
    body:'grant_type=client_credentials'
   },4096);
   if(tokens.token_type!=='Bearer'||!TOKEN.test(tokens.access_token??''))
    fail('SANDBOX_OAUTH_INVALID');
   // Exactly one read-only Orders GET. No create, capture, approval or redirect.
   return remoteJson(BASE+'/v2/checkout/orders/'+encodeURIComponent(orderId),{
    method:'GET',headers:{authorization:'Bearer '+tokens.access_token,
      accept:'application/json'}
   },32768);
  }
 });
}
