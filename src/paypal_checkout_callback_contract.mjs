// Pure future HTTPS callback preflight; never performs provider HTTP.
// Public origin and session MUST be supplied by trusted server code, not request
// Host/Forwarded headers or browser params. Not wired into live order creation.
import {approvedAmount} from './payment_contract.mjs';
const safeId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
function reject(code){const error=new Error(code);error.code=code;throw error;}
function requirePublicOrigin(input){
 if(typeof input!=='string'||input!==input.trim()||input.length>240)
  reject('PUBLIC_HTTPS_ORIGIN_REQUIRED');
 let u;
 try{u=new URL(input)}catch{reject('PUBLIC_HTTPS_ORIGIN_REQUIRED')}
 if(u.protocol!=='https:'||u.origin!==input||u.username||u.password||
    u.port||u.search||u.hash||!u.hostname.includes('.')||
    u.hostname==='localhost'||u.hostname.endsWith('.localhost')||
    /^\d+(?:\.\d+){3}$/.test(u.hostname)||
    u.hostname.startsWith('[')||
    u.hostname.endsWith('.local')||u.hostname.endsWith('.internal'))
  reject('PUBLIC_HTTPS_ORIGIN_REQUIRED');
 return u.origin;
}
export function planBuyerCheckoutCallbacks({publicOrigin,serverSession,quote}={}){
 const origin=requirePublicOrigin(publicOrigin);
 // The authenticated session verifier must additionally ensure the opaque
 // checkoutSessionId belongs to the quote owner in persistent private storage.
 if(serverSession?.verified!==true||
   !safeId(serverSession.actorId)||!safeId(serverSession.merchantId)||
   !safeId(serverSession.checkoutSessionId)||
   serverSession.checkoutSessionId.length<32||
   !quote||quote.ownerId!==serverSession.actorId||
   quote.merchantId!==serverSession.merchantId||
   quote.approval?.actorId!==serverSession.actorId||
   quote.approval?.quoteVersion!==quote.version)
  reject('VERIFIED_CHECKOUT_SESSION_REQUIRED');
 approvedAmount(quote);
 return Object.freeze({
  mode:'OFFLINE_PLAN_NOT_PROVIDER_APPROVED',
  networkAllowed:false,
  browserReturnIsPaymentProof:false,
  checkoutSessionStorageRequired:true,
  captureRequiresSeparateAction:true,
  experienceContext:Object.freeze({
   user_action:'CONTINUE',
   return_url:origin+'/checkout/paypal/return',
   cancel_url:origin+'/checkout/paypal/cancel'
  })
 });
}
