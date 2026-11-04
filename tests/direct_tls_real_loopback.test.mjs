// Real loopback TLS integration: ephemeral OpenSSL key/cert, no account,
// no public listener, no external requests, no test key committed to Git.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:https';
import {request as httpsRequest} from 'node:https';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDirectTlsNodeRequestBridge} from '../src/direct_tls_node_request_bridge.mjs';

const origin='https://proofline.example.com';
async function fixture(run){
 const directory=mkdtempSync(join(tmpdir(),'proofline-tls-'));
 const key=join(directory,'ephemeral.key');
 const certificate=join(directory,'ephemeral.crt');
 let server,port;
 try{
  // Ephemeral local TLS key is generated only in the CI temp directory,
  // never checked in or used as a real service credential.
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048',
   '-nodes','-keyout',key,'-out',certificate,'-sha256','-days','1',
   '-subj','/CN=proofline.example.com',
   '-addext','subjectAltName=DNS:proofline.example.com'],
   {timeout:20000,stdio:'pipe'});
  let calls=0;
  let router=async request=>{
   calls++;
   const p=new URL(request.url).pathname;
   if(p==='/api/auth/oidc/start'){
    assert.equal(request.method,'POST');
    const h=new Headers({'location':'https://accounts.example.org/oauth/authorize'});
    h.append('set-cookie','__Host-proofline_oidc=OFFLINE; Secure; HttpOnly; SameSite=Lax; Path=/');
    h.append('set-cookie','__Host-proofline_session=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    return new Response(null,{status:303,headers:h});
   }
   if(p==='/api/marketplace/contract-step'){
    assert.equal(request.method,'POST');
    assert.equal(request.headers.get('origin'),origin);
    assert.equal(request.headers.get('x-csrf-token'),'OFFLINE_CSRF');
    assert.equal(await request.text(),'{"id":"synthetic"}');
    return Response.json({reviewStatus:'SUBMITTED',paymentAuthorized:false});
   }
   return Response.json({verified:false,body:'local-tls-fixture',paymentAuthorized:false});
  };
  const bridge=createDirectTlsNodeRequestBridge({
   publicOrigin:origin,routeHandler:{handle:r=>router(r)},maxBodyBytes:1024
  });
  server=createServer({
   key:readFileSync(key),cert:readFileSync(certificate)
  },(req,res)=>{void bridge.handle(req,res)});
  await new Promise((resolve,reject)=>{
   server.once('error',reject);
   server.listen(0,'127.0.0.1',resolve);
  });
  port=server.address().port;
  const ca=readFileSync(certificate);
  function send({path='/api/auth/oidc/session',method='GET',headers={},
                 body,servername='proofline.example.com'}={}){
   return new Promise((resolve,reject)=>{
    const req=httpsRequest({
     host:'127.0.0.1',port,servername,ca,
     rejectUnauthorized:true,
     path,method,headers:{host:'proofline.example.com',...headers},
     agent:false,timeout:7000
    },res=>{
     const bytes=[];
     res.on('data',b=>bytes.push(b));
     res.on('end',()=>resolve({
      status:res.statusCode,headers:res.headers,
      text:Buffer.concat(bytes).toString('utf8'),
      tlsAuthorized:req.socket.authorized,
      tlsProtocol:req.socket.getProtocol()
     }));
    });
    req.on('timeout',()=>req.destroy(new Error('LOCAL_TLS_TIMEOUT')));
    req.on('error',reject);
    req.end(body);
   });
  }
  await run({send,route:next=>{router=next},calls:()=>calls,port});
 }finally{
  if(server)await new Promise((resolve,reject)=>{
   server.close(error=>error?reject(error):resolve());
   server.closeAllConnections();
  });
  rmSync(directory,{recursive:true,force:true});
 }
}
test('actual loopback TLS 1.2+ handshake validates ephemeral CA + DNS SAN; exact host routes',async()=>{
 await fixture(async({send,calls})=>{
  const r=await send();
  assert.equal(r.status,200);
  assert.equal(r.tlsAuthorized,true);
  assert.ok(['TLSv1.2','TLSv1.3'].includes(r.tlsProtocol));
  assert.equal(JSON.parse(r.text).body,'local-tls-fixture');
  assert.equal(calls(),1);
 });
});
test('real TLS 303 returns separate secure cookies and secure HTTPS redirect',async()=>{
 await fixture(async({send,calls})=>{
  const r=await send({method:'POST',path:'/api/auth/oidc/start'});
  assert.equal(r.status,303);
  assert.equal(r.headers.location,'https://accounts.example.org/oauth/authorize');
  assert.equal(r.headers['set-cookie'].length,2);
  assert.ok(r.headers['set-cookie'][0].startsWith('__Host-proofline_oidc='));
  assert.ok(r.headers['set-cookie'][1].startsWith('__Host-proofline_session='));
  assert.equal(r.text,'');
  assert.equal(calls(),1);
 });
});
test('genuine TLS byte transport carries same-origin CSRF and marketplace POST',async()=>{
 await fixture(async({send,calls})=>{
  const body='{"id":"synthetic"}';
  const r=await send({
   path:'/api/marketplace/contract-step',method:'POST',
   body,headers:{'content-type':'application/json','content-length':String(Buffer.byteLength(body)),
    origin,'x-csrf-token':'OFFLINE_CSRF'}
  });
  assert.equal(r.status,200);
  assert.equal(JSON.parse(r.text).reviewStatus,'SUBMITTED');
  assert.equal(calls(),1);
 });
});
test('TLS client rejects untrusted SNI name; forged Host/proxy denied server-side',async()=>{
 await fixture(async({send,calls})=>{
  await assert.rejects(send({servername:'attacker.example.net'}),
   /certificate|hostname|altname|CERT_/i);
  assert.equal((await send({headers:{host:'attacker.example.net'}})).status,421);
  const proxied=await send({headers:{'x-forwarded-proto':'https'}});
  assert.equal(proxied.status,503);
  assert.equal(JSON.parse(proxied.text).paymentAuthorized,false);
  assert.equal(calls(),0);
 });
});
test('TLS streamed oversize POST and backend oversize response are rejected without payment',async()=>{
 await fixture(async({send,route,calls})=>{
  const tooLarge=await send({method:'POST',path:'/api/marketplace/contract-step',
   body:'X'.repeat(1025),headers:{origin,'content-length':'1025'}});
  assert.equal(tooLarge.status,413);
  assert.equal(calls(),0);
  route(()=>new Response(new ReadableStream({
   start(c){
    c.enqueue(new Uint8Array(1024*1024));
    c.enqueue(new Uint8Array(1024*1024));
    c.close();
   }
  }),{status:200}));
  const oversized=await send();
  assert.equal(oversized.status,502);
  assert.equal(JSON.parse(oversized.text).paymentAuthorized,false);
 });
});
