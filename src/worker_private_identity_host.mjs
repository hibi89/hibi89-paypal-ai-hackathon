// OPTIONAL Cloudflare Worker host: owner-only OIDC/D1 metadata surface.
// OFF by default. No deployed config, synthetic identity, PayPal or Gemini.
import {createWorkerPrivateOidcAuthority} from './worker_private_oidc_authority.mjs';
import {createWorkerOidcPkceCoordinator} from './worker_oidc_pkce_coordinator.mjs';
import {createWorkerOidcTokenTransport} from './worker_oidc_token_transport.mjs';
import {createPrivateWorkerIdentityReadRouter} from './worker_private_identity_read_router.mjs';
import {ownerSignInAsset,redirectVerifiedOwnerLogin} from './worker_private_sign_in.mjs';

const HEADERS=Object.freeze({
 'content-type':'application/json; charset=utf-8',
 'cache-control':'no-store, max-age=0','pragma':'no-cache',
 'vary':'Cookie','x-content-type-options':'nosniff',
 'x-frame-options':'DENY','referrer-policy':'no-referrer',
 'content-security-policy':"default-src 'none'; frame-ancestors 'none'"
});
const unavailable=()=>new Response(JSON.stringify({
 error:'OWNER_IDENTITY_RUNTIME_NOT_AUTHORIZED',paymentAuthorized:false
}),{status:503,headers:HEADERS});

// No IP, loopback, example/CI host, URL credentials, custom ports or discovery.
function trustedOrigin(value){
 if(typeof value!=='string'||value.length>253)throw Error('TRUST_CONFIG');
 let u;try{u=new URL(value)}catch{throw Error('TRUST_CONFIG')}
 const host=u.hostname.toLowerCase();
 if(u.protocol!=='https:'||u.origin!==value||u.port||
    u.username||u.password||u.search||u.hash||
    !/^[a-z0-9.-]+$/.test(host)||!host.includes('.')||
    /(^|\.)(localhost|local|internal|invalid|test|example)$/.test(host)||
    /(^|\.)(example\.com|example\.net|example\.org)$/.test(host)||
    /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host))
  throw Error('TRUST_CONFIG');
 return value;
}
function pinnedEndpoint(value,issuer){
 if(typeof value!=='string'||value.length>512)throw Error('TRUST_ENDPOINT');
 let u;try{u=new URL(value)}catch{throw Error('TRUST_ENDPOINT')}
 if(u.origin!==issuer||u.username||u.password||u.search||u.hash||
    u.port||u.protocol!=='https:'||u.href!==value)
  throw Error('TRUST_ENDPOINT');
 return value;
}
function pepperFromB64(value){
 // Canonical standard base64 representation of exactly 32 bytes.
 if(typeof value!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(value))
  throw Error('PEPPER_INVALID');
 let raw;try{raw=atob(value)}catch{throw Error('PEPPER_INVALID')}
 if(raw.length!==32||btoa(raw)!==value)throw Error('PEPPER_INVALID');
 return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
function jsonKeys(value){
 if(typeof value!=='string'||value.length<50||value.length>16384)
  throw Error('OIDC_JWKS_INVALID');
 let data;try{data=JSON.parse(value)}catch{throw Error('OIDC_JWKS_INVALID')}
 if(!data||typeof data!=='object'||Array.isArray(data))
  throw Error('OIDC_JWKS_INVALID');
 return data;
}
export function createPrivateWorkerIdentityHost({tokenFetch=fetch}={}){
 if(typeof tokenFetch!=='function')throw Error('TRUSTED_TOKEN_FETCH_REQUIRED');
 return Object.freeze({async fetch(request,env){
  // Independent owner and network permissions; deploying a source file alone
  // cannot activate login, token POST, private D1 reads or payment routes.
  if(env?.PRIVATE_IDENTITY_HOST_OPT_IN!=='OWNER_APPROVED_ISOLATED_D1_OIDC'||
     env?.PRIVATE_IDENTITY_IDP_NETWORK_OPT_IN!=='OWNER_APPROVED_REAL_IDP_EXCHANGE'||
     typeof env?.DB?.withSession!=='function'||
     typeof env?.PRIVATE_IDENTITY_RATE_LIMITER?.limit!=='function')return unavailable();
  try{
   if(!(request instanceof Request))return unavailable();
   const origin=trustedOrigin(env.PRIVATE_IDENTITY_ORIGIN);
   const issuer=trustedOrigin(env.PRIVATE_IDENTITY_ISSUER);
   if(origin===issuer)throw Error('SEPARATE_IDP_ORIGIN_REQUIRED');
   const authorizationEndpoint=pinnedEndpoint(
    env.PRIVATE_IDENTITY_AUTHORIZATION_ENDPOINT,issuer);
   const tokenEndpoint=pinnedEndpoint(env.PRIVATE_IDENTITY_TOKEN_ENDPOINT,issuer);
   const clientId=env.PRIVATE_IDENTITY_CLIENT_ID;
   const roleSessionsEnabled=env.PRIVATE_ROLE_SESSIONS_HOST_OPT_IN===
    'OWNER_APPROVED_ROLE_D1_MIGRATION'&&
    env.PRIVATE_CONTRACTS_HOST_OPT_IN==='OWNER_APPROVED_CONTRACTS_AFTER_D1_MIGRATION';
   const authority=createWorkerPrivateOidcAuthority({
    db:env.DB,issuer,audience:clientId,
    jwks:jsonKeys(env.PRIVATE_IDENTITY_JWKS_JSON),
    subjectPepper:pepperFromB64(env.PRIVATE_IDENTITY_SUBJECT_PEPPER_B64),
    allowedOrigin:origin,roleSessionsEnabled
   });
   const codeTransport=createWorkerOidcTokenTransport({
    tokenEndpoint,redirectUri:origin+'/api/auth/oidc/callback',
    clientId,clientSecret:env.PRIVATE_IDENTITY_CLIENT_SECRET,
    fetchImpl:tokenFetch,networkApproved:true,timeoutMs:5000
   });
   const pkceCoordinator=createWorkerOidcPkceCoordinator({
    authority,codeTransport,allowedOrigin:origin,
    issuer,clientId,authorizationEndpoint,tokenEndpoint,
    roleSessionsEnabled
   });
   const router=createPrivateWorkerIdentityReadRouter({
    db:env.DB,allowedOrigin:origin,authority,pkceCoordinator,enabled:true,
    contractsEnabled:env.PRIVATE_CONTRACTS_HOST_OPT_IN===
      'OWNER_APPROVED_CONTRACTS_AFTER_D1_MIGRATION',
    contractRoleSessionsEnabled:roleSessionsEnabled
   });
   const path=new URL(request.url);
   // Static public sign-in is inert: no D1 writes, IdP POST or session data.
   const signIn=ownerSignInAsset(request,origin);
   if(signIn)return signIn;
   // Cloudflare-native approximate location-scoped counter. No raw IP,
   // browser-supplied identity or in-memory-only counters. A missing/failed
   // binding stops the request BEFORE OIDC challenge or token operations.
   const start=path.pathname==='/api/auth/oidc/start'&&request.method==='POST'&&
     path.origin===origin&&!path.search&&!path.hash&&
     request.headers.get('origin')===origin&&
     ['same-origin','none'].includes(request.headers.get('sec-fetch-site'));
   const callback=path.pathname==='/api/auth/oidc/callback'&&
     request.method==='GET'&&path.origin===origin;
   if(start||callback){
    let verdict;
    try{
     verdict=await env.PRIVATE_IDENTITY_RATE_LIMITER.limit({
      key:start?'proofline:owner-oidc:start':'proofline:owner-oidc:callback'
     });
    }catch{return unavailable()}
    if(verdict?.success===false)return new Response(JSON.stringify({
     error:'LOGIN_RATE_LIMITED',paymentAuthorized:false
    }),{status:429,headers:{...HEADERS,'retry-after':'60'}});
    if(verdict?.success!==true)return unavailable();
   }
   const routed=await router.fetch(request);
   return callback?redirectVerifiedOwnerLogin(routed,origin,{roleSessionsEnabled}):routed;
  }catch{
   // No error messages, credentials, D1 schema or IdP details in HTTP.
   return unavailable();
  }
 }});
}
// No checked-in deployment config points here. Remote operations are
// separately approved and are NOT performed by this source code.
export default createPrivateWorkerIdentityHost();
