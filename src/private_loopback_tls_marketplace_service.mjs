// Explicit owner-local HTTPS harness for the existing private OIDC marketplace.
// No public address, public listener, proxy TLS, provider fetch, enrollment,
// payment operation, or persisted credentials. Not a Production server.
import {createServer} from 'node:https';
import {createDirectTlsNodeRequestBridge} from './direct_tls_node_request_bridge.mjs';

const fail=code=>{const e=new Error(code);e.code=code;throw e};
export function createLoopbackTlsMarketplaceService({
 publicOrigin,routeHandler,tlsCertificate,tlsPrivateKey,
 maxBodyBytes=65_536
}={}){
 if(!Buffer.isBuffer(tlsCertificate)||tlsCertificate.length<200||
    tlsCertificate.length>16384||
    !Buffer.isBuffer(tlsPrivateKey)||tlsPrivateKey.length<200||
    tlsPrivateKey.length>16384)
  fail('LOOPBACK_TLS_PRIVATE_CERTIFICATE_REQUIRED');
 // This bridge rejects arbitrary Host, untrusted proxies, and non-TLS sockets.
 const bridge=createDirectTlsNodeRequestBridge({
  publicOrigin,routeHandler,maxBodyBytes
 });
 let server=null,started=false,stopped=false;
 const state=()=>Object.freeze({
  listening:started&&!stopped,loopbackOnly:true,
  publicDeploymentEnabled:false,paymentAuthorized:false
 });
 async function start(){
  if(started||stopped)fail('LOOPBACK_TLS_ALREADY_USED');
  started=true;
  try{
   server=createServer({
    key:tlsPrivateKey,cert:tlsCertificate,
    requestCert:false,allowHTTP1:true
   },(req,res)=>{void bridge.handle(req,res)});
   // This local-only HTTPS harness must close aborted/malformed client sockets
   // without terminating the listener. Node's 'clientError' contract requires
   // explicit socket cleanup when a handler is installed.
   server.on('clientError',(_err,socket)=>{
    if(!socket.destroyed)socket.destroy();
   });
   await new Promise((resolve,reject)=>{
    const onError=e=>{server.off('listening',onReady);reject(e)};
    const onReady=()=>{server.off('error',onError);resolve()};
    server.once('error',onError);
    server.once('listening',onReady);
    // No caller supplied port or bind address. Even if host headers contain a
    // public hostname, the socket is accessible only from this machine.
    server.listen(0,'127.0.0.1');
   });
   const addr=server.address();
   if(addr?.address!=='127.0.0.1'||!Number.isInteger(addr.port))
    fail('LOOPBACK_TLS_BIND_REJECTED');
   return Object.freeze({
    address:'127.0.0.1',port:addr.port,mode:'PRIVATE_LOOPBACK_TLS_ONLY',
    publicDeploymentEnabled:false,paymentAuthorized:false
   });
  }catch{
   stopped=true;
   if(server){try{server.closeAllConnections()}catch{}
    try{server.close()}catch{}}
   fail('LOOPBACK_TLS_START_FAILED');
  }
 }
 async function stop(){
  if(stopped)return;
  stopped=true;
  if(!server)return;
  // Stop accepts before closing surviving keepalive sockets.
  await new Promise(resolve=>{
   try{
    server.close(()=>resolve());
    server.closeAllConnections();
   }catch{resolve()}
  });
 }
 return Object.freeze({
  start,stop,state,
  mode:'EXPLICIT_LOOPBACK_TLS_DEV_HARNESS_NOT_PUBLIC_HOST',
  createsPublicListener:false,requiresOwnerExternalProviderApproval:true,
  paypalCaptureEnabled:false,paymentAuthorized:false
 });
}
