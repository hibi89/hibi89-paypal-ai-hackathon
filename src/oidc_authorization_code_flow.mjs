// Host-only OIDC authorization-code transport and completion coordinator.
// Never enabled by an HTTP listener; no default fetch or provider access.
// A real host must independently authorize its chosen IdP/network settings,
// pin official verification keys, preserve private client secrets and rate-limit.
const fail=code=>{const err=new Error(code);err.code=code;throw err;};
const CODE=/^[A-Za-z0-9._~+\/-]{8,2048}$/;
const VERIFIER=/^[A-Za-z0-9_-]{43}$/;
const CLIENT=/^[A-Za-z0-9._:-]{3,128}$/;

function pinnedHttps(raw){
 let u;
 try{u=new URL(raw)}catch{fail('OIDC_EXCHANGE_PINNED_HTTPS_REQUIRED')}
 if(typeof raw!=='string'||raw.length>512||u.href!==raw||
    u.protocol!=='https:'||u.username||u.password||u.search||u.hash||
    u.port||!u.hostname.includes('.')||u.hostname==='localhost'||
    u.hostname.endsWith('.localhost')||u.hostname.endsWith('.local')||
    /^(?:\d+\.){3}\d+$/.test(u.hostname))
  fail('OIDC_EXCHANGE_PINNED_HTTPS_REQUIRED');
 return u.href;
}
export function createOidcCodeExchangeTransport({
 tokenEndpoint,clientId,clientSecret,fetchImpl,networkApproved=false,
 timeoutMs=5000
}={}){
 const endpoint=pinnedHttps(tokenEndpoint);
 if(!CLIENT.test(clientId??'')||typeof clientSecret!=='string'||
    clientSecret.length<16||clientSecret.length>512||
    typeof fetchImpl!=='function'||!Number.isSafeInteger(timeoutMs)||
    timeoutMs<1000||timeoutMs>10000)
  fail('OIDC_EXCHANGE_PRIVATE_CLIENT_REQUIRED');
 // The transport is inert unless its host explicitly enables it. In offline
 // tests the injected fetch is a synthetic in-process fake, never the network.
 const allowed=networkApproved===true;
 async function exchange(ticket){
  if(!allowed)fail('OIDC_EXCHANGE_NETWORK_NOT_APPROVED');
  if(!ticket||!CODE.test(ticket.code??'')||
     !VERIFIER.test(ticket.codeVerifier??'')||
     ticket.clientId!==clientId)
   fail('OIDC_EXCHANGE_TICKET_INVALID');
  const callback=pinnedHttps(ticket.redirectUri);
  if(typeof ticket.expectedNonce!=='string'||
     !VERIFIER.test(ticket.expectedNonce))
   fail('OIDC_EXCHANGE_TICKET_INVALID');
  // Exactly one POST with explicit timeout and redirect denial: no retries,
  // no access-token persistence, no browser-controlled token endpoint.
  const body=new URLSearchParams({
   grant_type:'authorization_code',code:ticket.code,
   redirect_uri:callback,code_verifier:ticket.codeVerifier
  });
  const basic=Buffer.from(
   encodeURIComponent(clientId)+':'+encodeURIComponent(clientSecret)
  ).toString('base64');
  let res;
  try{
   res=await fetchImpl(endpoint,{
    method:'POST',redirect:'error',cache:'no-store',
    referrerPolicy:'no-referrer',credentials:'omit',
    headers:{accept:'application/json',
     'content-type':'application/x-www-form-urlencoded',
     authorization:'Basic '+basic},
    body:body.toString(),signal:AbortSignal.timeout(timeoutMs)
   });
  }catch{fail('OIDC_EXCHANGE_TRANSPORT_FAILED')}
  if(!(res instanceof Response)||res.status!==200||
     !/^application\/json(?:\s*;|$)/i.test(res.headers.get('content-type')??''))
   fail('OIDC_EXCHANGE_RESPONSE_REJECTED');
  const length=res.headers.get('content-length');
  if(length!==null&&(!/^\d{1,6}$/.test(length)||Number(length)>16000))
   fail('OIDC_EXCHANGE_RESPONSE_REJECTED');
  let data;
  try{
   // Fetch text() can buffer a large response: use a bounded streaming read.
   if(!res.body)fail('OIDC_EXCHANGE_RESPONSE_REJECTED');
   const reader=res.body.getReader(),chunks=[];
   let total=0;
   while(true){
    const {done,value}=await reader.read();
    if(done)break;
    total+=value.byteLength;
    if(total>16000){await reader.cancel();fail('OIDC_EXCHANGE_RESPONSE_REJECTED')}
    chunks.push(value);
   }
   data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }catch{fail('OIDC_EXCHANGE_RESPONSE_REJECTED')}
  if(!data||typeof data!=='object'||Array.isArray(data)||
     data.token_type!=='Bearer'||typeof data.id_token!=='string'||
     data.id_token.length<100||data.id_token.length>8192||
     data.id_token.split('.').length!==3)
   fail('OIDC_EXCHANGE_ID_TOKEN_MISSING');
  // Intentionally discard provider access_token and refresh_token (if any).
  return Object.freeze({idToken:data.id_token,expectedNonce:ticket.expectedNonce});
 }
 return Object.freeze({exchange,mode:'EXPLICITLY_ENABLED_PINNED_OIDC_CODE_EXCHANGE',
  networkEnabled:allowed,autoRetry:false,paymentAuthorized:false});
}

export function createOidcHostLoginFlow({
 challengeStore,identityVerifier,sessionStore,codeTransport,
 authorizationEndpoint,clientId
}={}){
 const endpoint=pinnedHttps(authorizationEndpoint);
 if(typeof challengeStore?.begin!=='function'||
    typeof challengeStore?.consume!=='function'||
    typeof identityVerifier?.verifyExternalIdentity!=='function'||
    typeof sessionStore?.establish!=='function'||
    typeof codeTransport?.exchange!=='function'||!CLIENT.test(clientId??''))
  fail('OIDC_FLOW_TRUSTED_COMPONENTS_REQUIRED');
 function start(request){
  const ticket=challengeStore.begin(request);
  if(ticket.clientId!==clientId||
     ticket.codeChallengeMethod!=='S256'||!VERIFIER.test(ticket.codeChallenge??'')||
     !VERIFIER.test(ticket.nonce??'')||!VERIFIER.test(ticket.state??''))
   fail('OIDC_FLOW_CHALLENGE_INVALID');
  const url=new URL(endpoint);
  url.search=new URLSearchParams({
   response_type:'code',client_id:clientId,
   redirect_uri:ticket.redirectUri,scope:'openid',
   state:ticket.state,nonce:ticket.nonce,
   code_challenge:ticket.codeChallenge,
   code_challenge_method:'S256'
  }).toString();
  return Object.freeze({authorizationUrl:url.href,setCookie:ticket.setCookie,
   expiresAtMs:ticket.expiresAtMs,loginCompleted:false,
   paymentAuthorized:false});
 }
 async function complete(request){
  // Consumed BEFORE the single permitted code exchange. Failed or ambiguous
  // exchange never retries a spent code; user must initiate a new challenge.
  const ticket=challengeStore.consume(request);
  if(ticket.clientId!==clientId)fail('OIDC_FLOW_CHALLENGE_INVALID');
  const exchanged=await codeTransport.exchange(ticket);
  if(exchanged?.expectedNonce!==ticket.expectedNonce||
     typeof exchanged?.idToken!=='string')
   fail('OIDC_FLOW_EXCHANGE_UNVERIFIED');
  const identity=await identityVerifier.verifyExternalIdentity({
   idToken:exchanged.idToken,expectedNonce:ticket.expectedNonce
  });
  if(identity?.verified!==true||identity.issuer!==ticket.issuer||
     identity.audience!==ticket.clientId)
   fail('OIDC_FLOW_IDENTITY_UNVERIFIED');
  // Session store re-verifies the same signed assertion and obtains a separate
  // server-only, preprovisioned account/merchant membership binding.
  const session=await sessionStore.establish({
   idToken:exchanged.idToken,expectedNonce:ticket.expectedNonce
  });
  if(typeof session?.setCookie!=='string'||!session.setCookie.startsWith(
     '__Host-proofline_session=')||
     typeof session?.csrfToken!=='string')
   fail('OIDC_FLOW_SESSION_UNVERIFIED');
  // Host must set both cookies on HTTPS and deliver CSRF only through a
  // non-cacheable same-origin response. This object never contains provider
  // access/refresh tokens or merchant/payment authority.
  return Object.freeze({setCookie:session.setCookie,
   clearLoginCookie:ticket.clearCookie,csrfToken:session.csrfToken,
   expiresAtMs:session.expiresAtMs,
   roleSessionReady:true,merchantOwnershipVerified:false,
   paymentAuthorized:false});
 }
 return Object.freeze({start,complete,
  mode:'HOST_ONLY_OIDC_CODE_PKCE_ID_TOKEN_SESSION_FLOW',
  publicListenerEnabled:false,merchantOwnershipVerified:false,
  paypalOrdersEnabled:false,paymentAuthorized:false});
}
