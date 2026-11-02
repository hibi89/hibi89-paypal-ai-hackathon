// Cloudflare Workers ES module for an opt-in READ-ONLY authenticated D1 status route.
// No checked-in deployment config, login, session issuance, PayPal, AI or write route.
import {createPrivateWorkerReadHandler} from './worker_private_read_entrypoint.mjs';
const headers={'content-type':'application/json; charset=utf-8',
 'cache-control':'no-store, max-age=0',
 'content-security-policy':"default-src 'none'; frame-ancestors 'none'",
 'x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer'};
const unavailable=()=>new Response('{"error":"READ_ONLY_WORKER_UNAVAILABLE"}',
 {status:503,headers});
export function createPrivateReadOnlyRuntime(){
 return Object.freeze({async fetch(request,env){
  // Activation is not identity proof. Existing D1 SHA-256 session + pinned
  // issuer/subject binding remain mandatory, and only GET status is routed.
  if(env?.PRIVATE_READ_ONLY_OPT_IN!=='OWNER_READ_ONLY_D1_VERIFIED'||
     typeof env.PRIVATE_READ_ORIGIN!=='string'||
     !env.DB||typeof env.DB.withSession!=='function')return unavailable();
  try {
   return await createPrivateWorkerReadHandler({
    db:env.DB,allowedOrigin:env.PRIVATE_READ_ORIGIN
   }).fetch(request);
  }catch{return unavailable();}
 }});
}
export default createPrivateReadOnlyRuntime();
