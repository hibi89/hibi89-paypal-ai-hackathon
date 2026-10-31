// Offline, non-authoritative configuration preflight for a future trusted HTTPS
// OIDC host. NEVER interprets operator strings as proof of an actual provider,
// HTTPS reachability, merchant ownership, network approval, or deployment.
// No HTTP listener, discovery request, credentials, database write, or tokens.
const CLIENT=/^[A-Za-z0-9._:-]{3,128}$/;
const HOST=/^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const deny=()=>null;
function https(raw,{originOnly=false}={}){
 if(typeof raw!=='string'||raw.length>512)return deny();
 let u;
 try{u=new URL(raw)}catch{return deny()}
 if(u.protocol!=='https:'||u.username||u.password||u.port||
    u.search||u.hash||!HOST.test(u.hostname)||
    /^(?:\d+\.){3}\d+$/.test(u.hostname)||
    u.hostname.endsWith('.localhost')||
    u.hostname.endsWith('.local')||
    u.hostname.endsWith('.internal')||
    u.hostname.endsWith('.example')||
    u.hostname.endsWith('.invalid')||
    u.hostname.endsWith('.test'))return deny();
 if(originOnly){
  if(u.origin!==raw||u.pathname!=='/'||u.href!==raw+'/')return deny();
 }else if(u.href!==raw)return deny();
 return u;
}
const has=(obj,key)=>obj!==null&&typeof obj==='object'&&typeof obj[key]==='function';
export function inspectOidcHostReadiness({
 publicOrigin,startUri,redirectUri,issuer,
 authorizationEndpoint,tokenEndpoint,jwksUri,
 clientId,approvedProviderOrigins,
 clientSecretPresent=false,challengeKeyPresent=false,
 bindingPepperPresent=false,
 components={},hostPolicy={}
}={}){
 // Do not echo supplied values. Some hosts accidentally pass actual secrets,
 // URLs with embedded basic auth, user IDs or tokens: the result stays codes-only.
 const issues=[];
 const issue=code=>{if(!issues.includes(code))issues.push(code)};
 const publicUrl=https(publicOrigin,{originOnly:true});
 if(!publicUrl)issue('HOST_PUBLIC_ORIGIN_INVALID');
 const start=https(startUri),redirect=https(redirectUri);
 if(!start||!publicUrl||start.href!==publicOrigin+'/api/auth/oidc/start')
  issue('HOST_OIDC_START_ROUTE_MISMATCH');
 if(!redirect||!publicUrl||
    redirect.href!==publicOrigin+'/api/auth/oidc/callback')
  issue('HOST_OIDC_CALLBACK_ROUTE_MISMATCH');
 const idp=https(issuer),auth=https(authorizationEndpoint);
 const token=https(tokenEndpoint),keys=https(jwksUri);
 if(!idp)issue('OIDC_ISSUER_INVALID');
 if(!auth||auth.pathname==='/')issue('OIDC_AUTHORIZATION_ENDPOINT_INVALID');
 if(!token||token.pathname==='/')issue('OIDC_TOKEN_ENDPOINT_INVALID');
 if(!keys||keys.pathname==='/')issue('OIDC_JWKS_URI_INVALID');
 if(auth&&token&&auth.href===token.href)
  issue('OIDC_AUTH_AND_TOKEN_ENDPOINT_COLLISION');
 if(auth&&keys&&auth.href===keys.href)
  issue('OIDC_AUTH_AND_JWKS_ENDPOINT_COLLISION');
 if(token&&keys&&token.href===keys.href)
  issue('OIDC_TOKEN_AND_JWKS_ENDPOINT_COLLISION');
 if(!CLIENT.test(clientId??''))issue('OIDC_CLIENT_ID_INVALID');
 const providerOrigins=Array.isArray(approvedProviderOrigins)&&
  approvedProviderOrigins.length>=1&&approvedProviderOrigins.length<=4&&
  approvedProviderOrigins.every(x=>https(x,{originOnly:true}))&&
  new Set(approvedProviderOrigins).size===approvedProviderOrigins.length?
  new Set(approvedProviderOrigins):null;
 if(!providerOrigins)issue('OIDC_PROVIDER_ORIGIN_ALLOWLIST_INVALID');
 if(providerOrigins&&[idp,auth,token,keys].some(u=>u&&!providerOrigins.has(u.origin)))
  issue('OIDC_PROVIDER_ENDPOINT_NOT_ALLOWLISTED');
 if(publicUrl&&providerOrigins&&providerOrigins.has(publicUrl.origin))
  issue('OIDC_HOST_AND_PROVIDER_ORIGIN_COLLISION');
 // Merely having keys and a client secret is not approval to use them or proof
 // that the external provider controls the alleged issuer and key material.
 if(clientSecretPresent!==true)issue('OIDC_PRIVATE_CLIENT_CREDENTIAL_UNAVAILABLE');
 if(challengeKeyPresent!==true)issue('OIDC_BROWSER_CHALLENGE_KEY_UNAVAILABLE');
 if(bindingPepperPresent!==true)issue('OIDC_ACCOUNT_BINDING_PEPPER_UNAVAILABLE');
 if(!has(components.challengeStore,'begin')||
    !has(components.challengeStore,'consume'))
  issue('OIDC_CHALLENGE_STORE_NOT_CONNECTED');
 if(!has(components.codeTransport,'exchange'))
  issue('OIDC_CODE_EXCHANGE_NOT_CONNECTED');
 if(!has(components.jwksTrust,'verifyExternalIdentity')||
    !has(components.jwksTrust,'status'))
  issue('OIDC_MANAGED_JWKS_NOT_CONNECTED');
 else{
  let state;
  try{state=components.jwksTrust.status()}catch{}
  if(state?.active!==true||state?.autoRefreshEnabled!==false)
   issue('OIDC_PINNED_JWKS_NOT_ACTIVE');
 }
 if(!has(components.accountBindings,'lookupExternalAccount'))
  issue('OIDC_PRIVATE_ACCOUNT_BINDING_NOT_CONNECTED');
 if(!has(components.sessionStore,'establish')||
    !has(components.sessionStore,'resolveRequest'))
  issue('OIDC_HOST_SESSION_NOT_CONNECTED');
 if(!has(components.ledger,'getLocalMember'))
  issue('OIDC_MEMBER_LEDGER_NOT_CONNECTED');
 if(hostPolicy.trustsUnverifiedForwardedHeaders!==false)
  issue('HOST_PROXY_TRUST_POLICY_NOT_LOCKED');
 if(hostPolicy.automaticallyReplaysPaymentPost!==false)
  issue('HOST_PAYPAL_POST_REPLAY_POLICY_NOT_LOCKED');
 if(hostPolicy.publicSelfRegistration!==false)
  issue('HOST_REGISTRATION_POLICY_NOT_LOCKED');
 if(hostPolicy.credentialLoggingEnabled!==false)
  issue('HOST_CREDENTIAL_LOG_POLICY_NOT_LOCKED');
 const codes=Object.freeze(issues.sort());
 return Object.freeze({
  status:codes.length?'OFFLINE_CONFIGURATION_BLOCKED':
    'OFFLINE_CONFIGURATION_CONSISTENT_ONLY',
  configurationConsistent:codes.length===0,
  issues:codes,
  // Never promote this preflight into an authorization, enrollment or release
  // certificate. A host must independently verify each real-world boundary.
  independentlyVerifiedProvider:false,
  independentlyVerifiedTls:false,
  independentlyVerifiedMerchant:false,
  realBrowserLoginTested:false,
  productionReady:false,
  externalNetworkCalls:0,
  paymentAuthorized:false
 });
}
