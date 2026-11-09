// Server-private wiring of existing OIDC trust, identity mapping, session,
// one-shot PKCE and marketplace router. NOT a public listener or deployment.
// Neither external network transport nor operator approval is inferred.
// The host MUST supply a separately approved codeTransport; this module
// never calls fetch(), discovers a JWKS URL, creates PayPal orders or pays.
import {resolve} from 'node:path';
import {createOidcLoginChallengeStore} from './oidc_login_challenge_store.mjs';
import {createManagedOidcJwksVerifier} from './managed_oidc_jwks_verifier.mjs';
import {createPreprovisionedOidcAccountBindings} from './preprovisioned_oidc_account_bindings.mjs';
import {createHostVerifiedSessionStore} from './host_verified_session_store.mjs';
import {createOidcHostLoginFlow} from './oidc_authorization_code_flow.mjs';
import {createMarketplaceHttpsRequestAdapter} from './marketplace_https_request_adapter.mjs';
import {inspectOidcHostReadiness} from './oidc_host_readiness_preflight.mjs';

const fail=code=>{const e=new Error(code);e.code=code;throw e};
const hostPolicy=Object.freeze({
 trustsUnverifiedForwardedHeaders:false,
 automaticallyReplaysPaymentPost:false,
 publicSelfRegistration:false,
 credentialLoggingEnabled:false
});
function privatePaths(files){
 const names=['challenge','jwks','bindings','sessions'];
 if(!files||typeof files!=='object'||Array.isArray(files))
  fail('PRIVATE_OIDC_HOST_STORAGE_REQUIRED');
 const list=names.map(n=>{
  const file=files[n];
  if(typeof file!=='string'||!file.trim()||file===':memory:'||
     file.startsWith('file:')||file.includes('?')||file.includes('\0'))
   fail('PRIVATE_OIDC_HOST_STORAGE_REQUIRED');
  return resolve(file);
 });
 if(new Set(list).size!==list.length)
  fail('PRIVATE_OIDC_HOST_STORAGE_COLLISION');
 return Object.fromEntries(names.map((n,i)=>[n,list[i]]));
}
function unavailable(){
 return new Response(JSON.stringify({
  error:'OIDC_TRUST_UNAVAILABLE',paymentAuthorized:false
 }),{status:503,headers:{
  'content-type':'application/json; charset=utf-8',
  'cache-control':'private, no-store, max-age=0',
  'pragma':'no-cache',
  'referrer-policy':'no-referrer',
  'x-content-type-options':'nosniff',
  'x-frame-options':'DENY',
  'content-security-policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'vary':'Cookie'
 }});
}
export function createPrivateOidcMarketplaceHost({
 files,publicOrigin,issuer,clientId,authorizationEndpoint,tokenEndpoint,
 jwksUri,approvedProviderOrigins,challengeKey,subjectPepper,
 ledger,codeTransport,authorizeTrustUpdate,authorizeOperatorProvisioning,
 now=Date.now
}={}){
 const paths=privatePaths(files);
 if(!Buffer.isBuffer(challengeKey)||challengeKey.length!==32||
    !Buffer.isBuffer(subjectPepper)||subjectPepper.length!==32||
    typeof now!=='function'||typeof ledger?.getLocalMember!=='function'||
    typeof codeTransport?.exchange!=='function')
  fail('PRIVATE_OIDC_HOST_DEPENDENCIES_REQUIRED');
 // Prevent any file being silently used as two different security domains.
 // Keep caller-owned ledger storage outside this factory's lifecycle.
 const connected=[];
 let closed=false;
 const use=entry=>{connected.push(entry);return entry};
 const alive=()=>{if(closed)fail('PRIVATE_OIDC_HOST_CLOSED')};
 const getMembership=actor=>ledger.getLocalMember(actor);
 let trust,bindings,challenge,sessions,adapter;
 try{
  trust=use(createManagedOidcJwksVerifier({
   filename:paths.jwks,issuer,audience:clientId,authorizeTrustUpdate,now
  }));
  bindings=use(createPreprovisionedOidcAccountBindings({
   filename:paths.bindings,issuer,subjectPepper,
   authorizeOperatorProvisioning,getMembership,now
  }));
  challenge=use(createOidcLoginChallengeStore({
   filename:paths.challenge,secretKey:challengeKey,issuer,clientId,
   startUri:publicOrigin+'/api/auth/oidc/start',
   redirectUri:publicOrigin+'/api/auth/oidc/callback',now
  }));
  sessions=use(createHostVerifiedSessionStore({
   filename:paths.sessions,expectedOrigin:publicOrigin,
   trustedIssuer:issuer,trustedAudience:clientId,
   verifyExternalIdentity:trust.verifyExternalIdentity,
   lookupExternalAccount:bindings.lookupExternalAccount,
   isAccountBindingActive:bindings.isAccountActive,
   getMembership,now
  }));
  const loginFlow=createOidcHostLoginFlow({
   challengeStore:challenge,identityVerifier:trust,
   sessionStore:sessions,codeTransport,authorizationEndpoint,clientId
  });
  adapter=createMarketplaceHttpsRequestAdapter({
   expectedOrigin:publicOrigin,ledger,loginFlow,sessionStore:sessions
  });
  // The signed OIDC session is the source of buyer identity for the internal
  // $1.50 host checkout; no actor, merchant or role from caller JSON is used.
  // This capability is never registered as a public browser/payment route.
  const privateCheckoutHandles=new WeakMap();
  async function beginCheckoutLogin(request){
   alive();
   if(!(request instanceof Request))fail('PRIVATE_CHECKOUT_AUTH_REQUIRED');
   let url;
   try{url=new URL(request.url)}catch{}
   if(request.method!=='GET'||url?.origin!==publicOrigin||
      url.pathname!=='/api/auth/oidc/session'||url.search||url.hash||
      url.username||url.password)
    fail('PRIVATE_CHECKOUT_AUTH_REQUIRED');
   const principal=await sessions.resolveRequest(request);
   if(principal?.verified!==true||principal.role!=='buyer'||
      !Number.isSafeInteger(principal.membershipRevision))
    fail('PRIVATE_CHECKOUT_VERIFIED_BUYER_REQUIRED');
   const handle=Object.freeze(Object.create(null));
   privateCheckoutHandles.set(handle,Object.freeze({
    originalRequest:request,actorId:principal.actorId,
    merchantId:principal.merchantId,role:principal.role,
    membershipRevision:principal.membershipRevision
   }));
   return handle;
  }
  async function resolveCheckoutPrincipal(handle){
   alive();
   const pinned=handle&&typeof handle==='object'?
    privateCheckoutHandles.get(handle):null;
   if(!pinned)return null;
   let current;
   try{current=await sessions.resolveRequest(pinned.originalRequest)}
   catch{return null}
   if(current?.verified!==true||current.role!=='buyer'||
      current.actorId!==pinned.actorId||
      current.merchantId!==pinned.merchantId||
      current.membershipRevision!==pinned.membershipRevision)
    return null;
   return Object.freeze({verified:true,actorId:pinned.actorId,
    merchantId:pinned.merchantId,role:'buyer',
    membershipRevision:pinned.membershipRevision});
  }
  const config=inspectOidcHostReadiness({
   publicOrigin,startUri:publicOrigin+'/api/auth/oidc/start',
   redirectUri:publicOrigin+'/api/auth/oidc/callback',
   issuer,authorizationEndpoint,tokenEndpoint,jwksUri,
   approvedProviderOrigins,clientId,clientSecretPresent:false,
   challengeKeyPresent:true,bindingPepperPresent:true,
   components:{challengeStore:challenge,codeTransport,jwksTrust:trust,
    accountBindings:bindings,sessionStore:sessions,ledger},
   hostPolicy
  });
  if(config.issues.some(x=>x!=='OIDC_PINNED_JWKS_NOT_ACTIVE'&&
     x!=='OIDC_PRIVATE_CLIENT_CREDENTIAL_UNAVAILABLE'))
   fail('PRIVATE_OIDC_HOST_CONFIGURATION_REJECTED');
 }catch(e){
  for(const x of connected.reverse())try{x.close()}catch{}
  throw e;
 }
 async function handle(request){
  alive();
  // Refuse to initiate or complete login while operator JWKS trust is
  // unconfigured/expired/revoked. No code exchange or session write occurs.
  if(request instanceof Request){
   let u;
   try{u=new URL(request.url)}catch{}
   if(u?.origin===publicOrigin &&
      (u.pathname==='/api/auth/oidc/start'||
       u.pathname==='/api/auth/oidc/start-url'||
       u.pathname==='/api/auth/oidc/callback')){
    let trusted=false;
    try{trusted=trust.status().active===true}catch{}
    if(!trusted)return unavailable();
   }
  }
  return adapter.handle(request);
 }
 function inspectReadiness({clientSecretPresent=false}={}){
  alive();
  return inspectOidcHostReadiness({
   publicOrigin,startUri:publicOrigin+'/api/auth/oidc/start',
   redirectUri:publicOrigin+'/api/auth/oidc/callback',
   issuer,authorizationEndpoint,tokenEndpoint,jwksUri,
   approvedProviderOrigins,clientId,
   clientSecretPresent,challengeKeyPresent:true,bindingPepperPresent:true,
   components:{challengeStore:challenge,codeTransport,jwksTrust:trust,
    accountBindings:bindings,sessionStore:sessions,ledger},
   hostPolicy
  });
 }
 function close(){
  if(closed)return;
  closed=true;
  for(const x of connected.reverse())x.close();
 }
 return Object.freeze({
  handle,inspectReadiness,close,
  beginCheckoutLogin,resolveCheckoutPrincipal,
  // These methods must remain reachable by trusted operator processes only.
  // They are deliberately NOT HTTP routes.
  operator:Object.freeze({stagePublicKeys:trust.stage,
   activatePublicKeys:trust.activateStaged,revokePublicKeys:trust.revokeActive,
   provisionIdentity:bindings.provision,revokeIdentity:bindings.revoke}),
  mode:'PRIVATE_COMPOSED_OIDC_MARKETPLACE_HOST_NO_LISTENER',
  providerNetworkConfiguredByCallerOnly:true,
  publicListenerEnabled:false,publicSelfRegistrationEnabled:false,
  paypalCaptureEnabled:false,merchantOwnershipVerified:false,
  paymentAuthorized:false
 });
}
