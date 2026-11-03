// Owner-approved server-only read-only Orders GET transport.
// Production network use still requires explicit operator authorization.
// This factory pins the official Sandbox endpoint and has no POST or retry path.
const SANDBOX='https://api-m.sandbox.paypal.com';
const ORDER=/^[A-Za-z0-9_-]{1,64}$/;
const TOKEN=/^[A-Za-z0-9._~+\-]{8,4096}$/;
const MAX_BYTES=32768;
const pinned=new WeakSet();
const error=code=>{const e=new Error(code);e.code=code;return e;};
export function isPinnedPayPalSandboxGetTransport(t){
 return !!t&&typeof t==='object'&&pinned.has(t);
}
export function createPinnedPayPalSandboxGetTransport({
 enabled=false,fetchImpl,getAccessToken,timeoutMs=8000
}={}){
 if(enabled!==true||typeof fetchImpl!=='function'||
    typeof getAccessToken!=='function'||
    !Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>10000)
  throw error('SANDBOX_GET_TRANSPORT_EXPLICIT_SETUP_REQUIRED');
 const transport=Object.freeze({
  mode:'PAYPAL_SANDBOX_READ_ONLY',networkEnabled:true,
  paymentPostsEnabled:false,
  async getOrder(orderId){
   if(typeof orderId!=='string'||!ORDER.test(orderId))
    throw error('SANDBOX_ORDER_ID_INVALID');
   const url=SANDBOX+'/v2/checkout/orders/'+encodeURIComponent(orderId);
   let token;
   try{token=await getAccessToken();}
   catch{throw error('SANDBOX_GET_TOKEN_UNAVAILABLE_NO_RETRY');}
   if(typeof token!=='string'||!TOKEN.test(token))
    throw error('SANDBOX_GET_TOKEN_UNAVAILABLE_NO_RETRY');
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),timeoutMs);
   let response;
   try{
    response=await fetchImpl(url,{method:'GET',redirect:'error',
     headers:{authorization:'Bearer '+token,accept:'application/json'},
     signal:controller.signal});
    if(!(response instanceof Response)||response.redirected===true||
       (response.url&&response.url!==url))
     throw error('SANDBOX_GET_REDIRECT_OR_SOURCE_UNTRUSTED');
    if(response.status===429)throw error('SANDBOX_GET_RATE_LIMITED_NO_RETRY');
    if(response.status===401||response.status===403)
     throw error('SANDBOX_GET_AUTH_REJECTED_NO_RETRY');
    if(response.status>=500)throw error('SANDBOX_GET_PROVIDER_UNAVAILABLE_NO_RETRY');
    if(response.status!==200)throw error('SANDBOX_GET_UNEXPECTED_STATUS_NO_RETRY');
    if(!/^application\/json(?:\s*;.*)?$/i.test(response.headers.get('content-type')??''))
     throw error('SANDBOX_GET_RESPONSE_TYPE_INVALID');
    const length=response.headers.get('content-length');
    if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_BYTES))
     throw error('SANDBOX_GET_RESPONSE_TOO_LARGE');
    if(!response.body)throw error('SANDBOX_GET_RESPONSE_EMPTY');
    const reader=response.body.getReader();let total=0;const chunks=[];
    try{for(;;){
     const {done,value}=await reader.read();if(done)break;
     if(!(value instanceof Uint8Array)||(total+=value.byteLength)>MAX_BYTES)
      throw error('SANDBOX_GET_RESPONSE_TOO_LARGE');
     chunks.push(value);
    }}finally{try{await reader.cancel()}catch{}try{reader.releaseLock()}catch{}}
    const data=new Uint8Array(total);let offset=0;
    for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}
    try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));}
    catch{throw error('SANDBOX_GET_INVALID_JSON');}
   }catch(e){
    if(e?.code)throw e;
    if(controller.signal.aborted)throw error('SANDBOX_GET_TIMEOUT_NO_RETRY');
    throw error('SANDBOX_GET_NETWORK_UNAVAILABLE_NO_RETRY');
   }finally{clearTimeout(timeout);}
  }
 });
 pinned.add(transport);
 return transport;
}
