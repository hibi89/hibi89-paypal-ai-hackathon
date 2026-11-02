// Internal-only Cloudflare-compatible OIDC authorization-code + PKCE coordinator.
// NOT wired to a public Worker. No fetch, provider discovery, keys or enrollment.
// The injected backend-only codeTransport must be explicitly configured and approved.
// Server-owned D1 authority pins issuer/JWKS, verifies RS256+nonce, and checks
// preprovisioned subject bindings before issuing a secure session cookie.
export class WorkerOidcPkceError extends Error {
 constructor(code){super(code);this.name='WorkerOidcPkceError';this.code=code;}
}
const bad=code=>{throw new WorkerOidcPkceError(code)};
const BASE64URL=/^[A-Za-z0-9_-]{43}$/;
const CLIENT=/^[A-Za-z0-9._:-]{1,128}$/;
const headers={
 'cache-control':'no-store, max-age=0','pragma':'no-cache',
 'referrer-policy':'no-referrer','x-content-type-options':'nosniff',
 'x-frame-options':'DENY',
 'content-security-policy':"default-src 'none'; frame-ancestors 'none'"
};
const response=(code,error,extra={})=>new Response(JSON.stringify({error,paymentAuthorized:false}),
 {status:code,headers:{...headers,'content-type':'application/json; charset=utf-8',...extra}});
function endpoint(value){
 try {
  const u=new URL(value);
  if(typeof value!=='string'||u.protocol!=='https:'||u.username||u.password||
    u.hash||u.search||u.origin==='null'||!u.hostname||
    (u.href!==value&&u.origin!==value))bad('OIDC_PKCE_TRUST_CONFIG_REQUIRED');
  return u;
 }catch{bad('OIDC_PKCE_TRUST_CONFIG_REQUIRED')}
}
function token(){
 const bytes=crypto.getRandomValues(new Uint8Array(32));
 return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function challenge(verifier){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
 return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
const STATE='__Host-proofline_oidc_state',PKCE='__Host-proofline_oidc_pkce';
const cookie=(name,value,age)=>name+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age='+age;
const clear=()=>[cookie(STATE,'',0),cookie(PKCE,'',0)];
function getCookies(req){
 const raw=req.headers.get('cookie')??'';
 if(raw.length>4096)bad('OIDC_PKCE_STATE_REJECTED');
 const pairs=raw.split(';').map(v=>v.trim());
 const get=name=>{
  const found=pairs.filter(x=>x.startsWith(name+'='));
  if(found.length!==1)bad('OIDC_PKCE_STATE_REJECTED');
  const value=found[0].slice(name.length+1);
  if(!BASE64URL.test(value))bad('OIDC_PKCE_STATE_REJECTED');
  return value;
 };
 return {state:get(STATE),verifier:get(PKCE)};
}
function allowedRequest(request,origin,path,method){
 if(!(request instanceof Request)||request.method!==method)bad('OIDC_PKCE_REQUEST_REJECTED');
 let url;
 try{url=new URL(request.url)}catch{bad('OIDC_PKCE_REQUEST_REJECTED')}
 if(url.origin!==origin||url.pathname!==path||url.hash)bad('OIDC_PKCE_REQUEST_REJECTED');
 return url;
}
// The private authority beginChallenge() must durably save nonce + challenge hash
// to first-primary D1. issue() must consume the challenge atomically before mint.
export function createWorkerOidcPkceCoordinator({authority,codeTransport,
 allowedOrigin,issuer,clientId,authorizationEndpoint,tokenEndpoint}={}){
 const pub=endpoint(allowedOrigin);
 if(pub.origin!==allowedOrigin||pub.pathname!=='/'||!CLIENT.test(clientId??'')||
    typeof authority?.beginChallenge!=='function'||
    typeof authority?.reserveExchange!=='function'||typeof authority?.issue!=='function'||
    typeof codeTransport?.exchange!=='function')bad('OIDC_PKCE_DEPENDENCIES_REQUIRED');
 const trusted=endpoint(issuer);
 if(trusted.origin!==issuer||trusted.pathname!=='/')bad('OIDC_PKCE_TRUST_CONFIG_REQUIRED');
 // Endpoints may legitimately use different HTTPS hosts from the issuer;
 // both are explicit, immutable operator-supplied URLs, never request inputs.
 const auth=endpoint(authorizationEndpoint),exchangeEndpoint=endpoint(tokenEndpoint);
 const redirectUri=allowedOrigin+'/api/auth/oidc/callback';
 return Object.freeze({
  // Start is a same-origin POST with no body, never a cross-origin GET login CSRF.
  async start(request){
   try{
    const url=allowedRequest(request,allowedOrigin,'/api/auth/oidc/start','POST');
    if(url.search||request.headers.get('origin')!==allowedOrigin||
       !['same-origin','none'].includes(request.headers.get('sec-fetch-site')))
     bad('OIDC_PKCE_REQUEST_REJECTED');
    const {challengeId,nonce}=await authority.beginChallenge();
    if(!BASE64URL.test(challengeId??'')||!BASE64URL.test(nonce??''))
     bad('OIDC_PKCE_AUTHORITY_REJECTED');
    const verifier=token(),codeChallenge=await challenge(verifier);
    const uri=new URL(auth);
    const params={response_type:'code',client_id:clientId,redirect_uri:redirectUri,
      scope:'openid',state:challengeId,nonce,code_challenge:codeChallenge,
      code_challenge_method:'S256'};
    for(const [k,v] of Object.entries(params))uri.searchParams.set(k,v);
    const out=new Response(null,{status:303,headers:{...headers,location:uri.href}});
    out.headers.append('set-cookie',cookie(STATE,challengeId,300));
    out.headers.append('set-cookie',cookie(PKCE,verifier,300));
    return out;
   }catch{return response(503,'OIDC_PKCE_START_UNAVAILABLE')}
  },
  // IdP redirects cross-site GET; state+verifier must both be HttpOnly cookies.
  // The trusted codeTransport runs only after exact code/state validation.
  async callback(request){
   try{
    const url=allowedRequest(request,allowedOrigin,'/api/auth/oidc/callback','GET');
    const keys=[...url.searchParams.keys()];
    if(keys.length!==2||!['code','state'].every(k=>url.searchParams.getAll(k).length===1))
     bad('OIDC_PKCE_CALLBACK_REJECTED');
    const code=url.searchParams.get('code'),state=url.searchParams.get('state');
    if(typeof code!=='string'||code.length<1||code.length>512||
       !/^[A-Za-z0-9._~-]+$/.test(code)||!BASE64URL.test(state??''))
      bad('OIDC_PKCE_CALLBACK_REJECTED');
    const cookies=getCookies(request);
    if(cookies.state!==state)bad('OIDC_PKCE_STATE_REJECTED');
    // D1 CAS MUST win before any non-idempotent provider code POST.
    // The one-time capability never comes from the request and cannot be
    // replayed across isolates, even when an exchange times out.
    const exchangeProof=await authority.reserveExchange({challengeId:state});
    const exchanged=await codeTransport.exchange(Object.freeze({
      code,codeVerifier:cookies.verifier,tokenEndpoint:exchangeEndpoint.href,
      redirectUri,clientId
    }));
    if(typeof exchanged?.idToken!=='string'||exchanged.idToken.length>8192)
      bad('OIDC_PKCE_PROVIDER_UNAVAILABLE');
    const result=await authority.issue({challengeId:state,idToken:exchanged.idToken,exchangeProof});
    if(!/^__Host-proofline_session=[A-Za-z0-9_-]{43}; Secure; HttpOnly; Path=\/; SameSite=Strict; Max-Age=\d+$/.test(result?.setCookie??''))
      bad('OIDC_PKCE_AUTHORITY_REJECTED');
    const out=new Response(JSON.stringify({status:'SESSION_ESTABLISHED',
      paymentAuthorized:false}),{status:200,headers:{...headers,
      'content-type':'application/json; charset=utf-8'}});
    for(const c of clear())out.headers.append('set-cookie',c);
    out.headers.append('set-cookie',result.setCookie);
    return out;
   }catch{
    const out=response(401,'OIDC_PKCE_CALLBACK_REJECTED');
    for(const c of clear())out.headers.append('set-cookie',c);
    return out;
   }
  },
  mode:'PRIVATE_OIDC_PKCE_NO_PUBLIC_ROUTE_NO_PROVIDER_BY_DEFAULT',
  providerCallsPerformedByModule:false,paymentAuthorized:false
 });
}
