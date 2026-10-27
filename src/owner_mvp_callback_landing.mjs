// Minimal buyer redirect landing for the private owner Sandbox pilot.
// HTTP bound to loopback only: an independently provisioned trusted HTTPS reverse
// proxy/tunnel MUST route the two URLs to this port. No provider/API requests.
// Browser query/cookies/headers are NEVER evidence of buyer payment approval.
import {createServer} from 'node:http';

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
    let path;
    try{path=new URL(req.url,'http://127.0.0.1:'+actualPort).pathname}
    catch{res.writeHead(400,{'cache-control':'no-store'}).end();return}
    const page=ROUTES[path];
    if(!page){res.writeHead(404,{'cache-control':'no-store'}).end();return;}
    if(req.method!=='GET'){
      res.writeHead(405,{'cache-control':'no-store',allow:'GET'}).end();return;
    }
    res.writeHead(200,safeHeaders).end(page);
  });
  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(port,'127.0.0.1',resolve);
    });
  }catch(e){server.close();deny('CALLBACK_LOOPBACK_BIND_FAILED')}
  const boundPort=server.address().port;
  return Object.freeze({
    localUrl:'http://127.0.0.1:'+boundPort,
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
