// GitHub Actions workerd ONLY. Synthetic issuer and one-use fixture token.
// No default production Worker changes, no network fetch and no real IdP.
// The ephemeral test signing private JWK is generated per CI run, stored in
// a 0600 untracked temporary Wrangler config and never checked into git.
import {createWorkerPrivateOidcAuthority} from '../src/worker_private_oidc_authority.mjs';
import {createWorkerOidcPkceCoordinator} from '../src/worker_oidc_pkce_coordinator.mjs';
import {createWorkerOidcTokenTransport} from '../src/worker_oidc_token_transport.mjs';
import {createPrivateWorkerIdentityReadRouter} from '../src/worker_private_identity_read_router.mjs';
import {createPinnedPayPalSandboxGetTransport} from '../src/worker_pinned_paypal_sandbox_get.mjs';

const ISSUER='https://idp.workerd-fixture.invalid';
const CLIENT='workerd-ci-owner';
const SUBJECTS=Object.freeze({
 CI_ONE_TIME_SIGNED_CODE:'fixture-verified-owner',
 CI_ONE_TIME_SIGNED_SELLER_CODE:'ci-seller-subject',
 CI_ONE_TIME_SIGNED_REVIEWER_CODE:'ci-reviewer-subject'
});
const failResponse=()=>new Response('{"error":"CI_PRIVATE_WORKER_DISABLED"}',{
 status:503,headers:{'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store, max-age=0','x-content-type-options':'nosniff'}
});
const b64url=bytes=>btoa(String.fromCharCode(...bytes))
 .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const utf8=new TextEncoder();
async function issueSyntheticJwt(env,db,subject){
 // This code is test-only and may not call fetch or discover an IdP.
 // A consumed SQL challenge must already exist BEFORE the code is signed.
 const session=db.withSession('first-primary');
 const row=await session.prepare(
  'SELECT nonce FROM worker_private_login_challenges WHERE consumed_at_ms IS NOT NULL ORDER BY rowid DESC LIMIT 1'
 ).first();
 if(!row||!/^[A-Za-z0-9_-]{43}$/.test(row.nonce??''))throw Error('CI_CHALLENGE_NOT_RESERVED');
 const now=Math.floor(Date.now()/1000);
 const h=b64url(utf8.encode(JSON.stringify({alg:'RS256',kid:'ci-ephemeral-key',typ:'JWT'})));
 const p=b64url(utf8.encode(JSON.stringify({
  iss:ISSUER,aud:CLIENT,sub:subject,nonce:row.nonce,
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
     typeof env?.CI_PRIVATE_PEPPER!=='string'||
     typeof env?.CI_PRIVATE_OIDC_SECRET!=='string')return failResponse();
  try{
   const pepper=Uint8Array.from(atob(env.CI_PRIVATE_PEPPER),c=>c.charCodeAt(0));
   const authority=createWorkerPrivateOidcAuthority({
    db:env.DB,issuer:ISSUER,audience:CLIENT,jwks:JSON.parse(env.CI_PRIVATE_JWKS),
    subjectPepper:pepper,allowedOrigin:env.CI_PRIVATE_ORIGIN,
    roleSessionsEnabled:env.CI_CONTRACT_ROLE_SESSIONS_OPT_IN===
     'LOCAL_VERIFIED_ROLE_FIXTURE_ONLY'
   });
   const pkce=createWorkerOidcPkceCoordinator({
    authority,allowedOrigin:env.CI_PRIVATE_ORIGIN,issuer:ISSUER,clientId:CLIENT,
    authorizationEndpoint:ISSUER+'/authorize',tokenEndpoint:ISSUER+'/token',
    roleSessionsEnabled:env.CI_CONTRACT_ROLE_SESSIONS_OPT_IN===
     'LOCAL_VERIFIED_ROLE_FIXTURE_ONLY',
    // Explicit enablement is safe ONLY because fetchImpl below is an in-process
    // synthetic fixture: global fetch is never called and no network is used.
    codeTransport:createWorkerOidcTokenTransport({
     tokenEndpoint:ISSUER+'/token',
     redirectUri:env.CI_PRIVATE_ORIGIN+'/api/auth/oidc/callback',
     clientId:CLIENT,clientSecret:env.CI_PRIVATE_OIDC_SECRET,
     networkApproved:true,allowLocalCallback:true,
     fetchImpl:async(url,options)=>{
      const body=new URLSearchParams(options.body);
      // Independently inspect the actual Worker-generated Basic header.
      // The old encodeURIComponent oracle wrongly accepted non-RFC6749
      // encodings for spaces, punctuation and non-ASCII credentials.
      let validBasic=false;
      try{
       const raw=options.headers.authorization;
       if(typeof raw==='string'&&/^Basic [A-Za-z0-9+/]+=*$/.test(raw)){
        const parts=atob(raw.slice(6)).split(':');
        const encodedSecret=parts[1]??'';
        validBasic=parts.length===2&&
         new URLSearchParams('client='+parts[0]).get('client')===CLIENT&&
         new URLSearchParams('secret='+encodedSecret).get('secret')===env.CI_PRIVATE_OIDC_SECRET&&
         encodedSecret.includes('+%21%27%28%29%C3%A9');
       }
      }catch{/* reject malformed Basic auth without exposing credentials */}
      if(url!==ISSUER+'/token'||options.method!=='POST'||
         options.redirect!=='error'||options.credentials!=='omit'||
         !validBasic||
         body.get('grant_type')!=='authorization_code'||
         typeof SUBJECTS[body.get('code')]!=='string'||
         body.get('redirect_uri')!==env.CI_PRIVATE_ORIGIN+'/api/auth/oidc/callback'||
         !/^[A-Za-z0-9_-]{43}$/.test(body.get('code_verifier')??''))
       throw Error('CI_SYNTHETIC_TOKEN_TRANSPORT_REJECTED');
      const signed=await issueSyntheticJwt(env,env.DB,SUBJECTS[body.get('code')]);
      return new Response(JSON.stringify({token_type:'Bearer',id_token:signed,
       access_token:'DISCARD_OFFLINE_FIXTURE_ACCESS_TOKEN'}),{
       status:200,headers:{'content-type':'application/json'}
      });
     }
    })
   });
   // CI-only synthetic transport: the official Sandbox GET URL is checked,
   // but fetchImpl is an in-process fixture and NEVER calls global fetch.
   // No token, endpoint or merchant ID is supplied by the browser.
   const localReconcile=env.CI_RECONCILE_OPT_IN==='LOCAL_SANDBOX_GET_FIXTURE_NO_EGRESS';
   const transport=localReconcile?createPinnedPayPalSandboxGetTransport({
    enabled:true,timeoutMs:2000,
    getAccessToken:async()=> 'ci-synthetic-token-no-network',
    fetchImpl:async(url,options)=>{
     if(url!=='https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER_FIXTURE_001'||
        options?.method!=='GET'||options.redirect!=='error'||
        options.headers?.authorization!=='Bearer ci-synthetic-token-no-network'||
        options.headers?.accept!=='application/json')
      throw Error('LOCAL_PINNED_SANDBOX_GET_FIXTURE_REJECTED');
     return new Response(JSON.stringify({
      id:'ORDER_FIXTURE_001',intent:'CAPTURE',status:'APPROVED',
      purchase_units:[{reference_id:'ciIdentityQuote',
       payee:{merchant_id:'PAYPALMERCH13'},
       amount:{currency_code:'USD',value:'2.50'}}]
     }),{status:200,headers:{'content-type':'application/json'}});
    }
   }):undefined;
   const router=createPrivateWorkerIdentityReadRouter({
    db:env.DB,allowedOrigin:env.CI_PRIVATE_ORIGIN,authority,
    pkceCoordinator:pkce,enabled:true,
    contractsEnabled:env.CI_CONTRACTS_OPT_IN==='LOCAL_CONTRACT_CANDIDATE_ONLY',
    // Explicit CI-only payment claim/audit first-claim path. No PayPal
    // transport exists in this host and no CREATE/CAPTURE route is mounted.
    paymentClaimEnabled:env.CI_PRIVATE_CLAIM_OPT_IN==='LOCAL_CLAIM_NO_PROVIDER_ONLY',
    sandboxOrderApprovalEnabled:localReconcile,
    sandboxOrderGetTransport:transport,
    sandboxExpectedMerchantId:localReconcile?'PAYPALMERCH13':undefined,
    contractRoleSessionsEnabled:env.CI_CONTRACT_ROLE_SESSIONS_OPT_IN===
     'LOCAL_VERIFIED_ROLE_FIXTURE_ONLY'
   });
   return await router.fetch(request);
  }catch{return failResponse();}
 }
});
