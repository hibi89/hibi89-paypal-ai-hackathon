// Test-only local carrier for real Chromium private-workspace click-through.
// Browser sees intercepted https://proofline.example.com requests. Playwright
// forwards them to this 127.0.0.1-only HTTP transport; the existing private
// OIDC host still authenticates signed, pre-enrolled synthetic identities.
// This is not a real browser TLS or external IdP test; no public listener,
// provider calls, real accounts or payment endpoints exist.
import {createServer} from 'node:http';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {connect as connectTcp} from 'node:net';
import {createLoopbackTlsMarketplaceService} from '../src/private_loopback_tls_marketplace_service.mjs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,generateKeyPairSync,sign,createHash,X509Certificate} from 'node:crypto';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createPrivateOidcMarketplaceHost} from '../src/private_oidc_marketplace_host.mjs';
import {createPrivateMarketplaceBrowserSurface} from '../src/private_marketplace_browser_surface.mjs';

const ORIGIN='https://proofline.example.com';
const ISSUER='https://accounts.example.org';
const CLIENT='proofline-offline-browser-fixture';
const CLOCK=1761987600000;
const temp=mkdtempSync(join(tmpdir(),'proofline-private-chromium-'));
const ledger=createSqliteLedger({filename:join(temp,'ledger.sqlite'),enforceLocalMemberWrites:true});
let host,server,tlsServer,idpTlsServer,proxyServer,closed=false;
const browserLoginMode=process.argv.includes('--browser-login');
const tlsMode=process.argv.includes('--real-tls-proxy')||browserLoginMode;
let fakeProviderAuthorizeRequests=0;
const codes=new Map();
const keys=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...keys.publicKey.export({format:'jwk'}),kid:'OFFLINE_CHROMIUM_FIXTURE_KEY',use:'sig',alg:'RS256'};
function fakeToken(nonce,subject){
 const n=Math.floor(CLOCK/1000);
 const header=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT',kid:jwk.kid})).toString('base64url');
 const payload=Buffer.from(JSON.stringify({iss:ISSUER,aud:CLIENT,sub:subject,nonce,
  iat:n-2,auth_time:n-2,exp:n+180,actorId:'FORGED_ROLE',merchantId:'FORGED_TENANT'})).toString('base64url');
 const data=header+'.'+payload;
 return data+'.'+sign('RSA-SHA256',Buffer.from(data),keys.privateKey).toString('base64url');
}
function close(){
 if(closed)return;
 closed=true;
 try{server?.closeAllConnections()}catch{}
 try{server?.close()}catch{}
 try{proxyServer?.closeAllConnections()}catch{}
 try{proxyServer?.close()}catch{}
 try{void tlsServer?.stop()}catch{}
 try{void idpTlsServer?.stop()}catch{}
 try{host?.close()}catch{}
 try{ledger.close()}catch{}
 rmSync(temp,{recursive:true,force:true});
}
process.on('SIGTERM',()=>{close();process.exit(0)});
process.on('SIGINT',()=>{close();process.exit(0)});
async function start(){
 for(const m of [
  {actorId:'buyerA',merchantId:'tenantA',role:'buyer'},
  {actorId:'sellerA',merchantId:'tenantA',role:'seller',sellerProfileId:'profileA'},
  {actorId:'reviewerA',merchantId:'tenantA',role:'reviewer'}
 ])await ledger.provisionLocalMember(m);
 await ledger.insertQuote({id:'projectA',ownerId:'buyerA',merchantId:'tenantA'});
 await ledger.approve({id:'projectA',actorId:'buyerA',expectedVersion:1,amountMinor:2400});
 await ledger.createContract({id:'contractA',quoteId:'projectA',
  actorId:'buyerA',merchantId:'tenantA',reviewerId:'reviewerA',
  expectedVersion:1,eventId:'chromium_create_contract',
  milestones:[{id:'stepA',step:1,amountMinor:2400}]});
 await ledger.assignLocalContractSeller({
  contractId:'contractA',merchantId:'tenantA',sellerProfileId:'profileA'
 });
 host=createPrivateOidcMarketplaceHost({
  files:{
   challenge:join(temp,'challenge.sqlite'),jwks:join(temp,'jwks.sqlite'),
   bindings:join(temp,'bindings.sqlite'),sessions:join(temp,'sessions.sqlite')
  },
  publicOrigin:ORIGIN,issuer:ISSUER,clientId:CLIENT,
  authorizationEndpoint:ISSUER+'/oauth2/authorize',
  tokenEndpoint:ISSUER+'/oauth2/token',
  jwksUri:ISSUER+'/.well-known/jwks.json',
  approvedProviderOrigins:[ISSUER],
  challengeKey:randomBytes(32),subjectPepper:randomBytes(32),
  ledger,now:()=>CLOCK,
  authorizeTrustUpdate:()=>true,authorizeOperatorProvisioning:()=>true,
  codeTransport:{exchange:async ticket=>{
   const entry=codes.get(ticket.code);
   const subject=typeof entry==='string'?entry:entry?.subject;
   if(!subject)throw Error('UNREGISTERED_TEST_CODE');
   if(entry?.challenge && createHash('sha256')
    .update(ticket.codeVerifier).digest('base64url')!==entry.challenge)
    throw Error('PKCE_CHALLENGE_MISMATCH');
   codes.delete(ticket.code);
   return {idToken:fakeToken(ticket.expectedNonce,subject),
    expectedNonce:ticket.expectedNonce};
  }}
 });
 await host.operator.stagePublicKeys({
  jwks:{keys:[jwk]},expectedRevision:0,validUntilMs:CLOCK+600000});
 await host.operator.activatePublicKeys({expectedRevision:0});
 for(const [subject,actorId] of [
  ['fixture-buyer','buyerA'],['fixture-seller','sellerA'],
  ['fixture-reviewer','reviewerA']
 ])await host.operator.provisionIdentity({subject,actorId,merchantId:'tenantA'});
 async function login(subject){
  const initial=await host.handle(new Request(ORIGIN+'/api/auth/oidc/start',{
   method:'POST',headers:{origin:ORIGIN}
  }));
  if(initial.status!==303)throw Error('FIXTURE_LOGIN_START_FAILED');
  const code='LOCAL_CHROMIUM_'+subject.replace(/-/g,'_').toUpperCase()+'_123456';
  codes.set(code,subject);
  const state=new URL(initial.headers.get('location')).searchParams.get('state');
  const loginCookie=initial.headers.getSetCookie()[0].split(';')[0];
  const done=await host.handle(new Request(ORIGIN+'/api/auth/oidc/callback?state='+
   encodeURIComponent(state)+'&code='+encodeURIComponent(code),{
   headers:{cookie:loginCookie}
  }));
  if(done.status!==200)throw Error('FIXTURE_LOGIN_CALLBACK_FAILED');
  const issued=done.headers.getSetCookie()[0].split(';')[0];
  if(!/^__Host-proofline_session=[A-Za-z0-9_-]{43}$/.test(issued))
   throw Error('FIXTURE_SESSION_MISSING');
  return issued.split('=')[1];
 }
 const sessions={
  buyer:await login('fixture-buyer'),
  seller:await login('fixture-seller'),
  reviewer:await login('fixture-reviewer')
 };
 const surface=createPrivateMarketplaceBrowserSurface({
  publicOrigin:ORIGIN,privateHost:host
 });
 server=createServer(async(req,res)=>{
  try{
   if(req.socket.remoteAddress!=='127.0.0.1'||
      req.headers.host!=='127.0.0.1:'+server.address().port||
      !['GET','POST'].includes(req.method))
    throw Error('PRIVATE_CARRIER_INVALID');
   const url=new URL(req.url,'http://127.0.0.1');
   if(url.origin!=='http://127.0.0.1'||url.pathname.startsWith('//'))
    throw Error('PRIVATE_CARRIER_PATH');
   const buffers=[];let len=0;
   for await(const c of req){
    len+=c.length;
    if(len>65_536)throw Error('PRIVATE_CARRIER_TOO_LARGE');
    buffers.push(c);
   }
   const body=Buffer.concat(buffers);
   const h=new Headers();
   for(const key of ['cookie','origin','accept','content-type','x-csrf-token']){
    if(typeof req.headers[key]==='string')h.set(key,req.headers[key]);
   }
   const response=await surface.handle(new Request(ORIGIN+url.pathname+url.search,{
    method:req.method,headers:h,...(body.length?{body}:{})
   }));
   const bytes=Buffer.from(await response.arrayBuffer());
   if(bytes.length>1_000_000)throw Error('PRIVATE_CARRIER_REPLY_LARGE');
   const headers={};
   for(const name of [
    'content-type','cache-control','content-security-policy',
    'x-content-type-options','x-frame-options','referrer-policy','vary','allow'
   ]){const val=response.headers.get(name);if(val)headers[name]=val;}
   res.writeHead(response.status,{...headers,'content-length':String(bytes.length)});
   res.end(bytes);
  }catch{
   if(!res.headersSent){res.writeHead(503,{'content-type':'application/json'});
    res.end('{"error":"PRIVATE_TEST_CARRIER_UNAVAILABLE","paymentAuthorized":false}');}
  }
 });
 await new Promise((ok,fail)=>{
  server.once('error',fail);
  server.listen(0,'127.0.0.1',ok);
 });
 const port=server.address().port;
 let proxyPort=null;
 const tlsPins=[];
 const pinFor=file=>createHash('sha256').update(
   new X509Certificate(readFileSync(file)).publicKey.export({
    format:'der',type:'spki'
   })).digest('base64');
 if(tlsMode){
  const keyFile=join(temp,'temporary-browser-tls.key');
  const certFile=join(temp,'temporary-browser-tls.crt');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes',
   '-keyout',keyFile,'-out',certFile,'-sha256','-days','1',
   '-subj','/CN=proofline.example.com',
   '-addext','subjectAltName=DNS:proofline.example.com'],
   {timeout:20_000,stdio:'pipe'});
  tlsServer=createLoopbackTlsMarketplaceService({
   publicOrigin:ORIGIN,routeHandler:surface,
   tlsCertificate:readFileSync(certFile),
   tlsPrivateKey:readFileSync(keyFile)
  });
  const tlsEndpoint=await tlsServer.start();
  tlsPins.push(pinFor(certFile));
  const targets=new Map([['proofline.example.com:443',tlsEndpoint.port]]);
  if(browserLoginMode){
   const idpKey=join(temp,'temporary-idp.key');
   const idpCert=join(temp,'temporary-idp.crt');
   execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes',
    '-keyout',idpKey,'-out',idpCert,'-sha256','-days','1',
    '-subj','/CN=accounts.example.org',
    '-addext','subjectAltName=DNS:accounts.example.org'],
    {timeout:20_000,stdio:'pipe'});
   const fakeProvider=Object.freeze({handle:async request=>{
    const u=new URL(request.url);
    const keys=[...u.searchParams.keys()].sort();
    const expected=['client_id','code_challenge','code_challenge_method',
     'nonce','redirect_uri','response_type','scope','state'].sort();
    const nonce=u.searchParams.get('nonce');
    const state=u.searchParams.get('state');
    const challenge=u.searchParams.get('code_challenge');
    if(request.method!=='GET'||u.origin!==ISSUER||
       u.pathname!=='/oauth2/authorize'||
       JSON.stringify(keys)!==JSON.stringify(expected)||
       u.searchParams.get('client_id')!==CLIENT||
       u.searchParams.get('redirect_uri')!==ORIGIN+'/api/auth/oidc/callback'||
       u.searchParams.get('response_type')!=='code'||
       u.searchParams.get('scope')!=='openid'||
       u.searchParams.get('code_challenge_method')!=='S256'||
       !/^[A-Za-z0-9_-]{43}$/.test(nonce??'')||
       !/^[A-Za-z0-9_-]{43}$/.test(state??'')||
       !/^[A-Za-z0-9_-]{43}$/.test(challenge??''))
     return Response.json({error:'OFFLINE_FAKE_IDP_REQUEST_REJECTED'},
      {status:400});
    fakeProviderAuthorizeRequests++;
    // Fake issuer only: independent of accounts/passwords or provider
    // consent. Binds generated code to PKCE challenge. Production unusable.
    const code='LOCAL_FAKE_IDP_'+randomBytes(18).toString('hex');
    codes.set(code,{subject:'fixture-buyer',challenge});
    return new Response(null,{status:303,headers:{
     location:ORIGIN+'/api/auth/oidc/callback?state='+
      encodeURIComponent(state)+'&code='+encodeURIComponent(code)+
      '&iss='+encodeURIComponent(ISSUER),
     'cache-control':'no-store'
    }});
   }});
   idpTlsServer=createLoopbackTlsMarketplaceService({
    publicOrigin:ISSUER,routeHandler:fakeProvider,
    tlsCertificate:readFileSync(idpCert),tlsPrivateKey:readFileSync(idpKey)
   });
   const endpoint=await idpTlsServer.start();
   tlsPins.push(pinFor(idpCert));
   targets.set('accounts.example.org:443',endpoint.port);
  }
  // HTTPS proxy is an exact-host-only CONNECT tunnel. It neither It neither
  // terminates TLS nor performs DNS, connects to public hosts or handles HTTP.
  proxyServer=createServer((req,res)=>{
   res.writeHead(403,{'connection':'close'});
   res.end();
  });
  proxyServer.on('connect',(req,browser,head)=>{
   if(!targets.has(req.url)||browser.remoteAddress!=='127.0.0.1'){
    browser.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    return;
   }
   const backend=connectTcp({
    host:'127.0.0.1',port:targets.get(req.url)
   });
   backend.setTimeout(12_000,()=>backend.destroy());
   browser.setTimeout(12_000,()=>browser.destroy());
   backend.on('connect',()=>{
    browser.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if(head.length)backend.write(head);
    browser.pipe(backend);
    backend.pipe(browser);
   });
   backend.on('error',()=>browser.destroy());
   browser.on('error',()=>backend.destroy());
   browser.on('close',()=>backend.destroy());
  });
  await new Promise((ok,bad)=>{
   proxyServer.once('error',bad);
   proxyServer.listen(0,'127.0.0.1',ok);
  });
  proxyPort=proxyServer.address().port;
 }
 // Pipe-only fixture handoff, no credentials/accounts outside this process.
 process.stdout.write(JSON.stringify({
  port,sessions,origin:ORIGIN,
  mode:browserLoginMode?'OFFLINE_CHROMIUM_REAL_OIDC_BROWSER_LOGIN':
   tlsMode?'OFFLINE_CHROMIUM_REAL_TLS_TUNNEL':'OFFLINE_SIGNED_OIDC_BROWSER_FIXTURE',
  fakeProviderAuthorizeRequests,
  tlsPins:browserLoginMode?tlsPins:[],
  proxyPort,certificateTrust:'SELF_SIGNED_TEST_CERT_ACCEPTED_BY_TEST_ONLY',
  providerCalls:0,paypalCaptureEnabled:false
 })+'\n');
}
start().catch(e=>{process.stderr.write('FIXTURE_FAILED_'+(e?.code||'UNKNOWN')+'\n');close();process.exitCode=1});
