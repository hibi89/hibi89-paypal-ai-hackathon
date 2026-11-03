// GitHub Actions workerd ONLY. Synthetic issuer and one-use fixture token.
// No default production Worker changes, no network fetch and no real IdP.
// The ephemeral test signing private JWK is generated per CI run, stored in
// a 0600 untracked temporary Wrangler config and never checked into git.
import {createWorkerPrivateOidcAuthority} from '../src/worker_private_oidc_authority.mjs';
import {createWorkerOidcPkceCoordinator} from '../src/worker_oidc_pkce_coordinator.mjs';
import {createPrivateWorkerIdentityReadRouter} from '../src/worker_private_identity_read_router.mjs';

const ISSUER='https://idp.workerd-fixture.invalid';
const CLIENT='workerd-ci-owner';
const SUBJECT='fixture-verified-owner';
const TOKEN_CODE='CI_ONE_TIME_SIGNED_CODE';
const failResponse=()=>new Response('{"error":"CI_PRIVATE_WORKER_DISABLED"}',{
 status:503,headers:{'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store, max-age=0','x-content-type-options':'nosniff'}
});
const b64url=bytes=>btoa(String.fromCharCode(...bytes))
 .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const utf8=new TextEncoder();
async function issueSyntheticJwt(env,db){
 // This code is test-only and may not call fetch or discover an IdP.
 // A consumed SQL challenge must already exist BEFORE the code is signed.
 const session=db.withSession('first-primary');
 const row=await session.prepare(
  'SELECT nonce FROM worker_private_login_challenges WHERE consumed_at_ms IS NOT NULL ORDER BY created_at_ms DESC LIMIT 1'
 ).first();
 if(!row||!/^[A-Za-z0-9_-]{43}$/.test(row.nonce??''))throw Error('CI_CHALLENGE_NOT_RESERVED');
 const now=Math.floor(Date.now()/1000);
 const h=b64url(utf8.encode(JSON.stringify({alg:'RS256',kid:'ci-ephemeral-key',typ:'JWT'})));
 const p=b64url(utf8.encode(JSON.stringify({
  iss:ISSUER,aud:CLIENT,sub:SUBJECT,nonce:row.nonce,
  iat:now-2,auth_time:now-5,exp:now+120
 })));
 const jwk=JSON.parse(env.CI_PRIVATE_SIGNING_JWK);
 const privateKey=await crypto.subtle.importKey('jwk',
  {...jwk,key_ops:['sign'],ext:true},
  {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',privateKey,utf8.encode(h+'.'+p));
 return h+'.'+p+'.'+b64url(new Uint8Array(sig));
}
export default Object.freeze({
 async fetch(request,env){
  if(env?.CI_PRIVATE_IDENTITY_OPT_IN!=='LOCAL_SYNTHETIC_NO_DEPLOY'||
     typeof env?.DB?.withSession!=='function'||
     typeof env?.CI_PRIVATE_ORIGIN!=='string'||
     typeof env?.CI_PRIVATE_SIGNING_JWK!=='string'||
     typeof env?.CI_PRIVATE_JWKS!=='string'||
     typeof env?.CI_PRIVATE_PEPPER!=='string')return failResponse();
  try{
   const pepper=Uint8Array.from(atob(env.CI_PRIVATE_PEPPER),c=>c.charCodeAt(0));
   const authority=createWorkerPrivateOidcAuthority({
    db:env.DB,issuer:ISSUER,audience:CLIENT,jwks:JSON.parse(env.CI_PRIVATE_JWKS),
    subjectPepper:pepper,allowedOrigin:env.CI_PRIVATE_ORIGIN
   });
   const pkce=createWorkerOidcPkceCoordinator({
    authority,allowedOrigin:env.CI_PRIVATE_ORIGIN,issuer:ISSUER,clientId:CLIENT,
    authorizationEndpoint:ISSUER+'/authorize',tokenEndpoint:ISSUER+'/token',
    codeTransport:{async exchange(ticket){
     if(ticket.code!==TOKEN_CODE||ticket.clientId!==CLIENT||
        !/^[A-Za-z0-9_-]{43}$/.test(ticket.codeVerifier??''))
      throw Error('CI_SYNTHETIC_CODE_REJECTED');
     return {idToken:await issueSyntheticJwt(env,env.DB)};
    }}
   });
   const router=createPrivateWorkerIdentityReadRouter({
    db:env.DB,allowedOrigin:env.CI_PRIVATE_ORIGIN,authority,
    pkceCoordinator:pkce,enabled:true
   });
   return await router.fetch(request);
  }catch{return failResponse();}
 }
});
