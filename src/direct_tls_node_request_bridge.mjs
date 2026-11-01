// Direct Node HTTPS IncomingMessage/ServerResponse -> existing trusted Request
// router. Does NOT create a server, bind a port or trust reverse proxies.
// TLS termination MUST be direct: HTTP and X-Forwarded-* cannot imply TLS.
// External login/merchant/PayPal actions remain controlled by the injected router.
const SAFE_INBOUND=new Set(['accept','content-type','cookie','origin','x-csrf-token']);
const SAFE_OUTBOUND=new Set([
 'cache-control','pragma','content-type','content-security-policy',
 'referrer-policy','x-content-type-options','x-frame-options','vary',
 'allow','location'
]);
const SINGLETON=new Set(['host','origin','cookie','content-length',
 'transfer-encoding','x-csrf-token','content-type']);
const fail=code=>{const err=new Error(code);err.code=code;throw err};
const REJECTION_HEADERS={
 'cache-control':'private, no-store, max-age=0',
 'pragma':'no-cache','content-type':'application/json; charset=utf-8',
 'x-content-type-options':'nosniff','x-frame-options':'DENY',
 'referrer-policy':'no-referrer',
 'content-security-policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
 'vary':'Cookie'
};
function failReply(res,status,reason){
 if(res.headersSent||res.writableEnded)return;
 res.writeHead(status,REJECTION_HEADERS);
 res.end(JSON.stringify({error:reason,paymentAuthorized:false}));
}
function rawHeaders(req){
 const r=req.rawHeaders;
 if(!Array.isArray(r)||r.length%2!==0||r.length>100)
  fail('INGRESS_AMBIGUOUS_HEADERS');
 const seen=new Set();
 for(let i=0;i<r.length;i+=2){
  const name=r[i],value=r[i+1];
  if(typeof name!=='string'||typeof value!=='string')
   fail('INGRESS_AMBIGUOUS_HEADERS');
  const key=name.toLowerCase();
  if(!/^[a-z0-9-]+$/.test(key)||key.startsWith('x-forwarded-')||
     key==='forwarded'||key.startsWith('x-original-')||key==='x-real-ip'||
     key==='proxy-authorization'||key==='proxy-connection')
   fail('INGRESS_UNTRUSTED_PROXY_HEADERS');
  if(SINGLETON.has(key)&&seen.has(key))fail('INGRESS_DUPLICATE_SECURITY_HEADER');
  seen.add(key);
 }
}
export function createDirectTlsNodeRequestBridge({
 publicOrigin,routeHandler,maxBodyBytes=65_536,maxReplyBytes=1_048_576
}={}){
 let u;
 try{u=new URL(publicOrigin)}catch{fail('INGRESS_CANONICAL_HTTPS_ORIGIN_REQUIRED')}
 if(typeof publicOrigin!=='string'||u.origin!==publicOrigin||
    u.protocol!=='https:'||u.port||u.username||u.password||
    u.search||u.hash||u.pathname!=='/'||
    !/^[a-z0-9.-]+$/.test(u.hostname)||!u.hostname.includes('.')||
    u.hostname==='localhost'||u.hostname.endsWith('.localhost')||
    u.hostname.endsWith('.local')||u.hostname.endsWith('.internal')||
    /^(?:\d+\.){3}\d+$/.test(u.hostname))
  fail('INGRESS_CANONICAL_HTTPS_ORIGIN_REQUIRED');
 if(typeof routeHandler?.handle!=='function'||
    !Number.isSafeInteger(maxBodyBytes)||maxBodyBytes<1024||maxBodyBytes>262144||
    !Number.isSafeInteger(maxReplyBytes)||maxReplyBytes<4096||maxReplyBytes>2097152)
  fail('INGRESS_PRIVATE_ROUTER_REQUIRED');
 const origin=u.origin,host=u.host;
 async function handle(req,res){
  // No listen(), TLS server creation, dynamic host header fallback or proxy trust.
  try{
   if(!req||!res||typeof res.writeHead!=='function'||typeof res.end!=='function')
    fail('INGRESS_REQUEST_RESPONSE_REQUIRED');
   if(req.socket?.encrypted!==true||req.httpVersionMajor!==1)
    return failReply(res,403,'DIRECT_TLS_REQUIRED');
   if(req.socket.servername && req.socket.servername!==u.hostname)
    return failReply(res,421,'HOST_SNI_MISMATCH');
   rawHeaders(req);
   if(req.headers?.host!==host)
    return failReply(res,421,'HOST_MISMATCH');
   if(req.method!=='GET'&&req.method!=='POST')
    return failReply(res,405,'METHOD_NOT_ALLOWED');
   if(typeof req.url!=='string'||req.url.length>4096||
      !req.url.startsWith('/')||req.url.startsWith('//')||
      /[\\#\r\n\x00]/.test(req.url))
    return failReply(res,400,'INVALID_REQUEST_TARGET');
   const rawLength=req.headers['content-length'];
   if(rawLength!==undefined&&(!/^(0|[1-9]\d{0,8})$/.test(rawLength)||
      Number(rawLength)>maxBodyBytes))
    return failReply(res,413,'REQUEST_TOO_LARGE');
   if(req.headers['transfer-encoding']!==undefined&&
      req.headers['content-length']!==undefined)
    return failReply(res,400,'AMBIGUOUS_BODY_FRAMING');
   if(req.method==='GET'&&
      (Number(rawLength??0)>0||req.headers['transfer-encoding']!==undefined))
    return failReply(res,400,'BODY_NOT_ALLOWED');
   const headers=new Headers();
   for(const name of SAFE_INBOUND){
    const value=req.headers[name];
    if(value!==undefined){
     if(typeof value!=='string'||value.length>8192)
      return failReply(res,400,'INVALID_SECURITY_HEADER');
     headers.set(name,value);
    }
   }
   let body;
   if(req.method==='POST'){
    const chunks=[];
    let total=0;
    for await(const chunk of req){
     const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
     total+=b.length;
     if(total>maxBodyBytes)return failReply(res,413,'REQUEST_TOO_LARGE');
     chunks.push(b);
    }
    if(rawLength!==undefined&&Number(rawLength)!==total)
     return failReply(res,400,'REQUEST_FRAMING_MISMATCH');
    if(total>0)body=Buffer.concat(chunks,total);
   }
   const request=new Request(origin+req.url,{method:req.method,headers,
    ...(body?{body}:{})});
   const response=await routeHandler.handle(request);
   if(!(response instanceof Response))
    return failReply(res,503,'INGRESS_BACKEND_UNAVAILABLE');
   // Never materialize an untrusted backend response before checking its
   // maximum size. A malicious/buggy stream may be huge or never terminate.
   const declared=response.headers.get('content-length');
   if(declared!==null&&(!/^(0|[1-9]\d{0,8})$/.test(declared)||
      Number(declared)>maxReplyBytes))
    return failReply(res,502,'RESPONSE_TOO_LARGE');
   const chunks=[];
   let total=0;
   if(response.body){
    const reader=response.body.getReader();
    try{
     while(true){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>maxReplyBytes){
       await reader.cancel();
       return failReply(res,502,'RESPONSE_TOO_LARGE');
      }
      chunks.push(Buffer.from(value));
     }
    }finally{reader.releaseLock()}
   }
   const data=Buffer.concat(chunks,total);
   if(declared!==null&&Number(declared)!==total)
    return failReply(res,502,'RESPONSE_FRAMING_MISMATCH');
   const out={};
   for(const key of SAFE_OUTBOUND){
    const val=response.headers.get(key);
    if(val!==null)out[key]=val;
   }
   const cookies=response.headers.getSetCookie();
   if(cookies.length>0){
    if(cookies.length>4||cookies.some(s=>
      s.length>4096||!s.startsWith('__Host-proofline_')||
      !/;\s*Secure(?:;|$)/i.test(s)||!/;\s*HttpOnly(?:;|$)/i.test(s)))
     return failReply(res,503,'INGRESS_BACKEND_UNAVAILABLE');
    out['set-cookie']=cookies;
   }
   const location=out.location;
   if(location!==undefined){
    let target;
    try{target=new URL(location)}catch{}
    if(response.status!==303||!target||target.protocol!=='https:'||
       target.username||target.password||target.hash)
     return failReply(res,503,'INGRESS_BACKEND_UNAVAILABLE');
   }
   out['content-length']=String(data.length);
   res.writeHead(response.status,out);
   res.end(data);
  }catch{
   failReply(res,503,'INGRESS_BACKEND_UNAVAILABLE');
  }
 }
 return Object.freeze({handle,mode:'DIRECT_TLS_NODE_HTTPS_INCOMING_BRIDGE',
  createsListener:false,acceptsProxyTLS:false,trustsForwardedHeaders:false,
  providerNetworkEnabled:false,publicRegistrationEnabled:false,
  paymentAuthorized:false});
}
