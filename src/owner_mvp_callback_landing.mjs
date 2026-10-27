// Minimal buyer redirect landing for the private owner Sandbox pilot.
// HTTP bound to loopback only: an independently provisioned trusted HTTPS reverse
// proxy/tunnel MUST route the two URLs to this port. No provider/API requests.
// Browser query/cookies/headers are NEVER evidence of buyer payment approval.
import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';

const deny=code=>{const error=new Error(code);error.code=code;throw error;};
const safeHeaders=Object.freeze({
  'content-type':'text/html; charset=utf-8',
  'cache-control':'no-store, private',
  'referrer-policy':'no-referrer',
  'x-content-type-options':'nosniff',
  'x-frame-options':'DENY',
  'content-security-policy':"default-src 'none'; style-src 'none'; script-src 'none'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
});
const text=(kind)=>'<!doctype html><html lang="en"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<title>PayPal Sandbox Buyer Return</title></head><body>'+
  '<h1>'+kind+'</h1>'+
  '<p>This page is a navigation landing only. It has not verified your payment.</p>'+
  '<p>Return to the private operator terminal. Only a fresh authenticated PayPal GET can verify buyer approval. Capture requires separate owner authorization.</p>'+
  '<p>No money has been proven paid by this page. No order or payment action is performed here.</p>'+
  '</body></html>';
const ROUTES=Object.freeze({
  '/checkout/paypal/return':text('PayPal Sandbox: buyer returned'),
  '/checkout/paypal/cancel':text('PayPal Sandbox: buyer cancelled or returned without approval'),
});
function checkedOrigin(value){
  if(typeof value!=='string'||value!==value.trim()||value.length>240)
    deny('CALLBACK_PUBLIC_HTTPS_ORIGIN_REQUIRED');
  let u;
  try{u=new URL(value)}catch{deny('CALLBACK_PUBLIC_HTTPS_ORIGIN_REQUIRED')}
  if(u.protocol!=='https:'||u.origin!==value||u.port||
      u.username||u.password||u.search||u.hash||!u.hostname.includes('.')||
      u.hostname==='localhost'||u.hostname.endsWith('.localhost')||
      u.hostname.endsWith('.local')||u.hostname.endsWith('.internal')||
      u.hostname.startsWith('[')||/^(?:\d+\.){3}\d+$/.test(u.hostname))
    deny('CALLBACK_PUBLIC_HTTPS_ORIGIN_REQUIRED');
  return u;
}
export async function startOwnerMvpCallbackLanding({port=8787,publicOrigin}={}){
  const remote=checkedOrigin(publicOrigin);
  if(!Number.isSafeInteger(port)||port<0||port>65535)
    deny('CALLBACK_LOOPBACK_PORT_REQUIRED');
  // Secret challenge proves both externally proxied paths reach THIS live
  // listener, rather than a CDN/static error page. It is NEVER payment proof.
  const probeToken=randomBytes(32).toString('base64url');
  const proofHeader='x-owner-mvp-callback-proof';
  let server;
  server=createServer((req,res)=>{
    // Untrusted incoming query strings, token, PayerID, cookies, Host and
    // X-Forwarded-* never influence payment/approval. No request logging.
    if(req.socket.remoteAddress!=='127.0.0.1'&&
       req.socket.remoteAddress!=='::ffff:127.0.0.1'){
      res.writeHead(403,{'cache-control':'no-store'}).end();return;
    }
    const actualPort=server.address().port;
    const acceptedHost=new Set([remote.host,'127.0.0.1:'+actualPort]);
    if(!acceptedHost.has(req.headers.host)){
      res.writeHead(403,{'cache-control':'no-store'}).end();return;
    }
    if(typeof req.url!=='string'||req.url.length>2048){
      res.writeHead(414,{'cache-control':'no-store'}).end();return;
    }
    let incoming;
    try{incoming=new URL(req.url,'http://127.0.0.1:'+actualPort)}
    catch{res.writeHead(400,{'cache-control':'no-store'}).end();return}
    const page=ROUTES[incoming.pathname];
    if(!page){res.writeHead(404,{'cache-control':'no-store'}).end();return;}
    if(req.method!=='GET'){
      res.writeHead(405,{'cache-control':'no-store',allow:'GET'}).end();return;
    }
    const supplied=incoming.searchParams.getAll('pilot_probe');
    const isProbe=supplied.length===1 && incoming.searchParams.size===1 &&
      /^[A-Za-z0-9_-]{43}$/.test(supplied[0]) &&
      timingSafeEqual(Buffer.from(supplied[0]),Buffer.from(probeToken));
    res.writeHead(200,isProbe?
      {...safeHeaders,[proofHeader]:probeToken}:safeHeaders).end(page);
  });
  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(port,'127.0.0.1',resolve);
    });
  }catch(e){server.close();deny('CALLBACK_LOOPBACK_BIND_FAILED')}
  const boundPort=server.address().port;
  async function verifyPublicIngress({fetchImpl}={}){
    // This sends exactly two GETs to an OWNER-CONFIGURED HTTPS hostname.
    // Injected transport is required: no implicit traffic from library/test use.
    if(typeof fetchImpl!=='function')deny('CALLBACK_EXPLICIT_VERIFY_TRANSPORT_REQUIRED');
    for(const path of Object.keys(ROUTES)){
      const url=remote.origin+path+'?pilot_probe='+encodeURIComponent(probeToken);
      let response;
      try{
        response=await fetchImpl(url,{
          method:'GET',redirect:'error',cache:'no-store',
          headers:{accept:'text/html'},
          signal:AbortSignal.timeout(8000)
        });
      }catch{deny('CALLBACK_PUBLIC_HTTPS_NOT_REACHABLE')}
      if(response?.status!==200||
         response.headers?.get(proofHeader)!==probeToken)
        deny('CALLBACK_PUBLIC_HTTPS_PROOF_MISMATCH');
      // Discard response bytes if supported; no callback payload becomes authority.
      try{await response.body?.cancel?.()}catch{}
    }
    return Object.freeze({mode:'OWNER_HTTPS_PROXY_TWO_PATH_PROBE',
      returnAndCancelReachable:true,
      buyerApproved:false,paymentVerified:false,
      providerCalls:0,capturePerformed:false});
  }
  return Object.freeze({
    localUrl:'http://127.0.0.1:'+boundPort,
    verifyPublicIngress,
    publicOrigin:remote.origin,
    mode:'LOOPBACK_BUYER_NAVIGATION_ONLY',
    publicHttpsConfiguredByThisServer:false,
    providerRequestsPerformed:false,
    captureEnabled:false,
    buyerAuthenticationImplemented:false,
    async close(){
      await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
    }
  });
}
