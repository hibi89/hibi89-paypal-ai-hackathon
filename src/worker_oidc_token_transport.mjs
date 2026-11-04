// Server-only Cloudflare Workers OIDC authorization-code token transport.
// Inert by default. This module never discovers an IdP or calls global fetch.
// Approval and the trusted fetch executor must be injected by the host.
// Upstream coordinator MUST reserve the one-time D1 PKCE challenge before POST.
export class WorkerOidcTokenTransportError extends Error {
 constructor(code){super(code);this.name='WorkerOidcTokenTransportError';this.code=code;}
}
const deny=code=>{throw new WorkerOidcTokenTransportError(code)};
const CLIENT=/^[A-Za-z0-9._:-]{1,128}$/;
const VERIFIER=/^[A-Za-z0-9_-]{43}$/;
const CODE=/^[A-Za-z0-9._~-]{1,512}$/;
const JWT=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const MAX_BYTES=16384;
function trustedHttps(raw,{callback=false,allowLocalCallback=false}={}){
 let url;
 try{url=new URL(raw)}catch{deny('WORKER_OIDC_TRUST_CONFIG_REQUIRED')}
 const testLocalCallback=callback&&allowLocalCallback===true&&
   url.hostname==='127.0.0.1'&&url.port!==''&&
   Number.isSafeInteger(Number(url.port))&&Number(url.port)>=1024;
 if(typeof raw!=='string'||raw.length>512||url.protocol!=='https:'||
    url.username||url.password||url.search||url.hash||
    url.href!==raw||(!testLocalCallback&&url.port!=='')||
    (!testLocalCallback&&!url.hostname.includes('.'))||
    !/^[A-Za-z0-9.-]+$/.test(url.hostname)||
    (!testLocalCallback&&/^(?:\d+\.){3}\d+$/.test(url.hostname))||
    /(^|\.)(?:localhost|local|internal)$/.test(url.hostname)||
    (callback&&url.pathname!=='/api/auth/oidc/callback'))
   deny('WORKER_OIDC_TRUST_CONFIG_REQUIRED');
 return url.href;
}
function validSecret(secret){
 if(typeof secret!=='string'||secret.length<16||secret.length>512||
    /[\x00-\x1f\x7f]/.test(secret))return false;
 // Do not silently substitute U+FFFD for an invalid UTF-16 credential.
 try{encodeURIComponent(secret);return true}catch{return false}
}
export function createWorkerOidcTokenTransport({
 tokenEndpoint,redirectUri,clientId,clientSecret,
 fetchImpl,networkApproved=false,timeoutMs=5000,allowLocalCallback=false
}={}){
 const endpoint=trustedHttps(tokenEndpoint);
 const callback=trustedHttps(redirectUri,{callback:true,allowLocalCallback});
 if(!CLIENT.test(clientId??'')||!validSecret(clientSecret)||
    typeof fetchImpl!=='function'||!Number.isSafeInteger(timeoutMs)||
    timeoutMs<1000||timeoutMs>10000)
  deny('WORKER_OIDC_TRANSPORT_CONFIG_REQUIRED');
 const enabled=networkApproved===true;
 // RFC 6749 2.3.1: form-encode each credential as UTF-8 BEFORE Basic.
 // encodeURIComponent is not form encoding: it leaves !'() unescaped
 // and turns spaces into %20 rather than +.
 const formEncode=value=>new URLSearchParams({value}).toString().slice(6);
 const basic=btoa(formEncode(clientId)+':'+formEncode(clientSecret));
 return Object.freeze({
  async exchange(ticket){
   if(!enabled)deny('WORKER_OIDC_NETWORK_NOT_APPROVED');
   if(!ticket||ticket.tokenEndpoint!==endpoint||
      ticket.redirectUri!==callback||ticket.clientId!==clientId||
      !CODE.test(ticket.code??'')||!VERIFIER.test(ticket.codeVerifier??''))
    deny('WORKER_OIDC_TICKET_REJECTED');
   // No browser-controlled endpoint, callback or client credentials.
   // The D1-backed coordinator must have consumed the state before calling.
   const body=new URLSearchParams({
    grant_type:'authorization_code',code:ticket.code,
    redirect_uri:callback,code_verifier:ticket.codeVerifier
   });
   // The SAME absolute clock covers fetch, response headers and every body chunk.
   // Some third-party fetch/ReadableStream implementations ignore abort/cancel.
   const controller=new AbortController();let timer;
   const deadline=new Promise((_,reject)=>{
    timer=setTimeout(()=>{
     controller.abort();
     reject(new WorkerOidcTokenTransportError('WORKER_OIDC_EXCHANGE_FAILED'));
    },timeoutMs);
   });
   const bounded=fn=>Promise.race([Promise.resolve().then(fn),deadline]);
   try{
   let response;
   try{
    response=await bounded(()=>fetchImpl(endpoint,{
     method:'POST',redirect:'error',cache:'no-store',
     credentials:'omit',referrerPolicy:'no-referrer',
     headers:{'content-type':'application/x-www-form-urlencoded',
       accept:'application/json',authorization:'Basic '+basic},
     body:body.toString(),signal:controller.signal
    }));
   }catch{deny('WORKER_OIDC_EXCHANGE_FAILED')}
   if(!(response instanceof Response)||response.status!==200||
      !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??''))
    deny('WORKER_OIDC_RESPONSE_REJECTED');
   const advertised=response.headers.get('content-length');
   if(advertised!==null&&(!/^\d{1,6}$/.test(advertised)||
      Number(advertised)>MAX_BYTES))
    deny('WORKER_OIDC_RESPONSE_REJECTED');
   let tokenResponse;
   try{
    if(!response.body)deny('WORKER_OIDC_RESPONSE_REJECTED');
    const reader=response.body.getReader();
    let length=0;const chunks=[];
    try{
     while(true){
      const {done,value}=await bounded(()=>reader.read());
      if(done)break;
      if(!(value instanceof Uint8Array))deny('WORKER_OIDC_RESPONSE_REJECTED');
      length+=value.byteLength;
      if(length>MAX_BYTES)deny('WORKER_OIDC_RESPONSE_REJECTED');
      chunks.push(value);
     }
    }finally{
     // Broken streams can ignore cancel forever. Never await cancellation.
     try{const cancelled=reader.cancel();cancelled?.catch?.(()=>{});}catch{}
     try{reader.releaseLock()}catch{}
    }
    const bytes=new Uint8Array(length);
    let offset=0;
    for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength;}
    tokenResponse=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
   }catch{deny('WORKER_OIDC_RESPONSE_REJECTED')}
   if(!tokenResponse||typeof tokenResponse!=='object'||
      Array.isArray(tokenResponse)||tokenResponse.token_type!=='Bearer'||
      typeof tokenResponse.id_token!=='string'||
      tokenResponse.id_token.length<100||tokenResponse.id_token.length>8192||
      !JWT.test(tokenResponse.id_token))
    deny('WORKER_OIDC_ID_TOKEN_MISSING');
   // Never retain access/refresh tokens from a provider response.
   // Signature, issuer, audience, nonce and bindings are checked by D1 authority.
   return Object.freeze({idToken:tokenResponse.id_token});
   }finally{clearTimeout(timer);}
  },
  mode:'EXPLICIT_ONLY_WORKER_OIDC_TOKEN_EXCHANGE',
  networkEnabled:enabled,autoRetry:false,paymentAuthorized:false
 });
}
