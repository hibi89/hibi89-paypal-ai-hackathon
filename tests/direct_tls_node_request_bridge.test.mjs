import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {createDirectTlsNodeRequestBridge} from '../src/direct_tls_node_request_bridge.mjs';

const origin='https://proofline.example.com';
function inbound({path='/api/auth/oidc/session',method='GET',tls=true,
 sni='proofline.example.com',version=1,headers={},rawExtra=[],body}={}){
 const req=new PassThrough();
 const h={host:'proofline.example.com',...headers};
 const raw=[];
 for(const [k,v] of Object.entries(h)){
  if(v!==undefined){raw.push(k,String(v))}
 }
 req.headers=h;req.rawHeaders=[...raw,...rawExtra];
 req.socket={encrypted:tls,servername:sni};
 req.httpVersionMajor=version;
 req.url=path;req.method=method;
 req.end(body);
 return req;
}
function outbound(){
 const r={status:null,headers:null,body:null,headersSent:false,writableEnded:false,
  writeHead(code,headers){
   this.status=code;this.headers=headers;this.headersSent=true;
  },end(data){
   this.body=data?Buffer.from(data):Buffer.alloc(0);
   this.writableEnded=true;
  }};
 return r;
}
const json=r=>JSON.parse(r.body.toString('utf8'));
const bridge=fn=>createDirectTlsNodeRequestBridge({publicOrigin:origin,
 routeHandler:{handle:fn}});
test('direct HTTPS GET bridges exact host, cookie and synthetic Request without public listener',async()=>{
 let calls=0;
 const b=bridge(async request=>{
  calls++;
  assert.equal(request.url,origin+'/api/auth/oidc/session');
  assert.equal(request.method,'GET');
  assert.equal(request.headers.get('cookie'),'__Host-proofline_session=TEST');
  return new Response(JSON.stringify({authenticated:true,paymentAuthorized:false}),
   {status:200,headers:{'cache-control':'private, no-store',
    'content-type':'application/json'}});
 });
 const reply=outbound();
 await b.handle(inbound({headers:{cookie:'__Host-proofline_session=TEST'}}),reply);
 assert.equal(calls,1);
 assert.equal(reply.status,200);
 assert.equal(json(reply).authenticated,true);
 assert.equal(reply.headers['cache-control'],'private, no-store');
 assert.equal(b.createsListener,false);
 assert.equal(b.paymentAuthorized,false);
});
test('303 authorization redirect and two Secure HttpOnly cookies remain separate header values',async()=>{
 const cookies=[
  '__Host-proofline_session=TEST; Secure; HttpOnly; Path=/; SameSite=Strict',
  '__Host-proofline_oidc=; Secure; HttpOnly; Path=/; SameSite=Lax; Max-Age=0'
 ];
 const b=bridge(async()=>{
  const h=new Headers({'location':'https://accounts.example.org/oauth/authorize',
   'cache-control':'no-store'});
  for(const c of cookies)h.append('set-cookie',c);
  return new Response(null,{status:303,headers:h});
 });
 const res=outbound();
 await b.handle(inbound({path:'/api/auth/oidc/start',method:'POST'}),res);
 assert.equal(res.status,303);
 assert.deepEqual(res.headers['set-cookie'],cookies);
 assert.equal(res.headers.location,'https://accounts.example.org/oauth/authorize');
 assert.equal(res.body.length,0);
});
test('HTTP and forwarded-proxy spoof cannot convert an unauthenticated request to TLS',async()=>{
 let calls=0;
 const b=bridge(async()=>{calls++;return new Response('never')});
 const cases=[
  inbound({tls:false,headers:{'x-forwarded-proto':'https'}}),
  inbound({tls:true,headers:{'x-forwarded-proto':'https'}}),
  inbound({tls:true,rawExtra:['Forwarded','proto=https;host=proofline.example.com']}),
  inbound({tls:true,headers:{'x-real-ip':'1.2.3.4'}}),
  inbound({version:2})
 ];
 for(const req of cases){
  const res=outbound();await b.handle(req,res);
  assert.ok(res.status===403||res.status===503);
  assert.equal(json(res).paymentAuthorized,false);
 }
 assert.equal(calls,0);
});
test('host mismatch and SNI mismatch block without invoking router',async()=>{
 let calls=0;const b=bridge(async()=>{calls++;return new Response('unsafe')});
 for(const [req,code] of [
  [inbound({headers:{host:'evil.example.org'}}),421],
  [inbound({sni:'untrusted.example.org'}),421],
  [inbound({headers:{host:'proofline.example.com:443'}}),421]
 ]){
  const res=outbound();await b.handle(req,res);
  assert.equal(res.status,code);
 }
 assert.equal(calls,0);
});
test('duplicated cookie, host, origin and request smuggling framing rejected',async()=>{
 let calls=0;const b=bridge(async()=>{calls++;return new Response('no')});
 for(const req of [
  inbound({rawExtra:['Cookie','shadow=evil'],headers:{cookie:'a=1'}}),
  inbound({rawExtra:['HOST','evil.example.org']}),
  inbound({rawExtra:['Origin','https://evil.example.org'],
   headers:{origin:'https://proofline.example.com'}}),
  inbound({headers:{'transfer-encoding':'chunked','content-length':'3'},
   method:'POST',body:'abc'})
 ]){
  const res=outbound();await b.handle(req,res);
  assert.ok(res.status>=400);
 }
 assert.equal(calls,0);
});
test('reject unsafe absolute target, protocol-relative, query fragments and GET bodies',async()=>{
 let calls=0;const b=bridge(async()=>{calls++;return new Response('no')});
 for(const request of [
  inbound({path:'https://evil.example.net/api/auth/oidc/session'}),
  inbound({path:'//evil.example.net/x'}),
  inbound({path:'/api/auth/oidc/session#fragment'}),
  inbound({method:'GET',headers:{'content-length':'3'},body:'abc'})
 ]){
  const res=outbound();await b.handle(request,res);
  assert.ok(res.status>=400);
 }
 assert.equal(calls,0);
});
test('POST preserves origin and CSRF and forwards exact body bytes with no side effects',async()=>{
 let calls=0;const bytes=JSON.stringify({eventId:'seller-submit',expectedVersion:1});
 const b=bridge(async request=>{
  calls++;
  assert.equal(request.method,'POST');
  assert.equal(request.headers.get('origin'),origin);
  assert.equal(request.headers.get('x-csrf-token'),'TEST_ONE_TIME_CSRF');
  assert.equal(await request.text(),bytes);
  return Response.json({status:'SUBMITTED',paymentAuthorized:false});
 });
 const res=outbound();
 await b.handle(inbound({method:'POST',path:'/api/marketplace/contracts/c1',
  headers:{origin,'x-csrf-token':'TEST_ONE_TIME_CSRF',
   'content-type':'application/json','content-length':String(Buffer.byteLength(bytes))},
  body:bytes}),res);
 assert.equal(res.status,200);
 assert.equal(json(res).status,'SUBMITTED');
 assert.equal(calls,1);
});
test('oversize streamed POST rejected before router invocation',async()=>{
 let calls=0;const b=createDirectTlsNodeRequestBridge({
  publicOrigin:origin,maxBodyBytes:1024,
  routeHandler:{handle:async()=>{calls++;return new Response('not reached')}}});
 const res=outbound();
 await b.handle(inbound({method:'POST',body:'X'.repeat(1025)}),res);
 assert.equal(res.status,413);
 assert.equal(calls,0);
});
test('large response and malicious provider redirects or insecure cookies fail closed',async()=>{
 for(const returned of [
  new Response('X'.repeat(5000),{status:200}),
  new Response(null,{status:303,
   headers:{location:'http://evil.example.org/'}}),
  new Response(null,{status:303,
   headers:{location:'https://u:p@evil.example.org/'}}),
  new Response(null,{status:303,
   headers:{'set-cookie':'session=unsafe; Path=/',
    location:'https://accounts.example.org/oauth/authorize'}})
 ]){
  const b=createDirectTlsNodeRequestBridge({
   publicOrigin:origin,maxReplyBytes:4096,
   routeHandler:{handle:async()=>returned}});
  const res=outbound();await b.handle(inbound(),res);
  assert.ok([502,503].includes(res.status),String(res.status));
  assert.equal(res.headers['set-cookie'],undefined);
 }
});
test('backend exception is redacted; dangerous outbound headers never forwarded',async()=>{
 const bad=bridge(async()=>{throw Error('PRIVATE_PROVIDER_KEY_SUPER_SECRET')});
 const a=outbound();await bad.handle(inbound(),a);
 assert.equal(a.status,503);
 assert.equal(JSON.stringify(json(a)).includes('PRIVATE_PROVIDER_KEY'),false);
 const b=bridge(async()=>new Response('ok',{
  headers:{'server':'unsafe-backend',connection:'keep-alive',
   'access-control-allow-origin':'*','cache-control':'no-store'}}));
 const r=outbound();await b.handle(inbound(),r);
 assert.equal(r.status,200);
 assert.equal(r.headers.server,undefined);
 assert.equal(r.headers.connection,undefined);
 assert.equal(r.headers['access-control-allow-origin'],undefined);
});
test('invalid configured origin, router or unsupported size bounds rejected',()=>{
 for(const publicOrigin of ['http://proofline.example.com',
  'https://localhost','https://127.0.0.1',
  'https://proofline.example.com:443']){
  assert.throws(()=>createDirectTlsNodeRequestBridge({
   publicOrigin,routeHandler:{handle:()=>{}}}),e=>
   e.code==='INGRESS_CANONICAL_HTTPS_ORIGIN_REQUIRED');
 }
 assert.throws(()=>createDirectTlsNodeRequestBridge({publicOrigin:origin}),
  e=>e.code==='INGRESS_PRIVATE_ROUTER_REQUIRED');
 assert.throws(()=>createDirectTlsNodeRequestBridge({
  publicOrigin:origin,routeHandler:{handle:()=>{}},maxBodyBytes:999999}),
  e=>e.code==='INGRESS_PRIVATE_ROUTER_REQUIRED');
});
