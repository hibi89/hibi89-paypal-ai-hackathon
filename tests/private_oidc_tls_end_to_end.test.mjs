import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {request as httpsRequest} from 'node:https';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createPrivateOidcMarketplaceHost} from '../src/private_oidc_marketplace_host.mjs';
import {createLoopbackTlsMarketplaceService} from '../src/private_loopback_tls_marketplace_service.mjs';
import {createPrivateMarketplaceBrowserSurface} from '../src/private_marketplace_browser_surface.mjs';

const origin='https://proofline.example.com';
const issuer='https://accounts.example.org';
const clientId='proofline-offline-client';
const clock=1761987600000;

async function withService(run){
 const dir=mkdtempSync(join(tmpdir(),'ppl-oidc-real-tls-e2e-'));
 let ledger,host,service;
 const tlsKey=join(dir,'temporary-private.key');
 const tlsCert=join(dir,'temporary-public.crt');
 const privateKey=generateKeyPairSync('rsa',{modulusLength:2048});
 const jwk={...privateKey.publicKey.export({format:'jwk'}),
  kid:'SYNTHETIC_SIGNING_KEY_2026',alg:'RS256',use:'sig'};
 const codes=new Map();
 let exchanges=0;
 function idToken(nonce,subject){
  const n=Math.floor(clock/1000);
  const h=Buffer.from(JSON.stringify({
   alg:'RS256',typ:'JWT',kid:jwk.kid
  })).toString('base64url');
  const p=Buffer.from(JSON.stringify({
   iss:issuer,aud:clientId,sub:subject,nonce,
   iat:n-2,auth_time:n-2,exp:n+180,
   actorId:'FORGED_ADMIN',merchantId:'FORGED_MERCHANT'
  })).toString('base64url');
  return h+'.'+p+'.'+sign('RSA-SHA256',Buffer.from(h+'.'+p),
   privateKey.privateKey).toString('base64url');
 }
 try{
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes',
   '-keyout',tlsKey,'-out',tlsCert,'-sha256','-days','1',
   '-subj','/CN=proofline.example.com',
   '-addext','subjectAltName=DNS:proofline.example.com'],
   {timeout:20_000,stdio:'pipe'});
  ledger=createSqliteLedger({filename:join(dir,'ledger.sqlite'),
   enforceLocalMemberWrites:true});
  for(const m of [
   {actorId:'buyerA',merchantId:'tenantA',role:'buyer'},
   {actorId:'sellerA',merchantId:'tenantA',role:'seller',sellerProfileId:'profileA'},
   {actorId:'reviewerA',merchantId:'tenantA',role:'reviewer'},
   {actorId:'outsider',merchantId:'tenantB',role:'buyer'}
  ])await ledger.provisionLocalMember(m);
  await ledger.insertQuote({id:'projectA',ownerId:'buyerA',merchantId:'tenantA'});
  await ledger.approve({id:'projectA',actorId:'buyerA',
   expectedVersion:1,amountMinor:2400});
  await ledger.createContract({id:'contractA',quoteId:'projectA',
   actorId:'buyerA',merchantId:'tenantA',reviewerId:'reviewerA',
   expectedVersion:1,eventId:'contract_tls_create',
   milestones:[{id:'stepA',step:1,amountMinor:2400}]});
  await ledger.assignLocalContractSeller({
   contractId:'contractA',merchantId:'tenantA',sellerProfileId:'profileA'
  });
  host=createPrivateOidcMarketplaceHost({
   files:{challenge:join(dir,'challenge.sqlite'),
    jwks:join(dir,'jwks.sqlite'),bindings:join(dir,'bindings.sqlite'),
    sessions:join(dir,'sessions.sqlite')},
   publicOrigin:origin,issuer,clientId,
   authorizationEndpoint:issuer+'/oauth2/authorize',
   tokenEndpoint:issuer+'/oauth2/token',
   jwksUri:issuer+'/.well-known/jwks.json',
   approvedProviderOrigins:[issuer],
   challengeKey:randomBytes(32),subjectPepper:randomBytes(32),
   ledger,now:()=>clock,
   authorizeTrustUpdate:()=>true,
   authorizeOperatorProvisioning:()=>true,
   codeTransport:{exchange:async ticket=>{
    exchanges++;
    const sub=codes.get(ticket.code);
    if(!sub)throw new Error('FAKE_CODE_NOT_REGISTERED');
    return {idToken:idToken(ticket.expectedNonce,sub),
     expectedNonce:ticket.expectedNonce};
   }}
  });
  const browserSurface=createPrivateMarketplaceBrowserSurface({
   publicOrigin:origin,privateHost:host
  });
  service=createLoopbackTlsMarketplaceService({
   publicOrigin:origin,routeHandler:browserSurface,
   tlsCertificate:readFileSync(tlsCert),tlsPrivateKey:readFileSync(tlsKey)
  });
  const bind=await service.start();
  const ca=readFileSync(tlsCert);
  function send({path='/api/auth/oidc/session',method='GET',cookie,
   csrf,body,extraHeaders={}}={}){
   return new Promise((resolve,reject)=>{
    const bytes=body===undefined?undefined:JSON.stringify(body);
    const headers={
     host:'proofline.example.com',...((method==='POST')?{origin}:{}),
     ...(cookie?{cookie}:{}),
     ...(csrf?{'x-csrf-token':csrf}:{}),
     ...(bytes?{'content-type':'application/json',
      'content-length':String(Buffer.byteLength(bytes))}:{}),
     ...extraHeaders
    };
    const req=httpsRequest({host:'127.0.0.1',port:bind.port,
     servername:'proofline.example.com',ca,rejectUnauthorized:true,
     path,method,headers,agent:false,timeout:7000},res=>{
      const parts=[];res.on('data',c=>parts.push(c));
      res.on('end',()=>{
       const text=Buffer.concat(parts).toString('utf8');
       let payload;
       try{payload=text?JSON.parse(text):null}catch{}
       resolve({status:res.statusCode,headers:res.headers,
        body:payload,text,tlsVerified:req.socket.authorized,
        tlsProtocol:req.socket.getProtocol()});
      });
    });
    req.on('timeout',()=>req.destroy(new Error('LOOPBACK_TIMEOUT')));
    req.on('error',reject);
    req.end(bytes);
   });
  }
  async function activate(){
   await host.operator.stagePublicKeys({jwks:{keys:[jwk]},
    expectedRevision:0,validUntilMs:clock+600000});
   await host.operator.activatePublicKeys({expectedRevision:0});
  }
  async function provision(){
   for(const [subject,actorId] of [
    ['ext-buyer','buyerA'],['ext-seller','sellerA'],
    ['ext-reviewer','reviewerA']]){
    await host.operator.provisionIdentity({
     subject,actorId,merchantId:'tenantA'});
   }
  }
  async function login(subject){
   const initial=await send({path:'/api/auth/oidc/start',method:'POST'});
   assert.equal(initial.status,303);
   assert.equal(initial.tlsVerified,true);
   assert.equal(initial.headers['set-cookie'].length,1);
   const a=new URL(initial.headers.location);
   assert.equal(a.origin,issuer);
   const code='TEST_FAKE_CODE_'+subject.toUpperCase().replaceAll('-','_')+'_987654321';
   codes.set(code,subject);
   const query='?state='+encodeURIComponent(a.searchParams.get('state'))+
    '&code='+encodeURIComponent(code);
   const browserCookie=initial.headers['set-cookie'][0].split(';')[0];
   const callback=await send({path:'/api/auth/oidc/callback'+query,
    cookie:browserCookie});
   assert.equal(callback.status,200,JSON.stringify(callback.body));
   assert.equal(callback.body.authenticated,true);
   assert.equal(callback.headers['set-cookie'].length,2);
   return {cookie:callback.headers['set-cookie'][0].split(';')[0],
    csrf:callback.body.csrfToken,
    callbackPath:'/api/auth/oidc/callback'+query,
    callbackCookie:browserCookie};
  }
  await run({service,host,bind,send,activate,provision,login,ledger,
   registerCode:(code,subject)=>codes.set(code,subject),
   exchanges:()=>exchanges});
 }finally{
  if(service)await service.stop();
  host?.close();ledger?.close();
  rmSync(dir,{recursive:true,force:true});
 }
}
test('genuine loopback TLS + SQLite JWKS + OIDC PKCE + signed buyer/seller/reviewer + milestone lifecycle',async()=>{
 await withService(async({service,bind,send,activate,provision,login,ledger,exchanges})=>{
  assert.equal(bind.address,'127.0.0.1');
  assert.equal(service.createsPublicListener,false);
  assert.equal(service.state().publicDeploymentEnabled,false);
  assert.equal((await send({path:'/api/auth/oidc/start',method:'POST'})).status,503);
  assert.equal(exchanges(),0);
  await activate();await provision();
  const buyer=await login('ext-buyer');
  const seller=await login('ext-seller');
  const reviewer=await login('ext-reviewer');
  assert.equal(exchanges(),3);
  const principal=await send({cookie:buyer.cookie});
  assert.equal(principal.status,200);
  assert.deepEqual(principal.body.identity,{
   actorId:'buyerA',merchantId:'tenantA',role:'buyer',membershipRevision:1});
  assert.equal(JSON.stringify(principal.body).includes('FORGED_ADMIN'),false);
  const quote=await send({path:'/api/marketplace/quotes/projectA',cookie:buyer.cookie});
  assert.equal(quote.status,200);
  assert.equal(quote.body.quote.id,'projectA');
  const wrong=await send({path:'/api/marketplace/quotes/projectA',
   cookie:seller.cookie});
  assert.equal(wrong.status,403);
  const milestone='/api/marketplace/contracts/contractA/milestones/stepA/';
  const delivered=await send({path:milestone+'submit',method:'POST',
   cookie:seller.cookie,csrf:seller.csrf,
   body:{eventId:'tls_seller_1',expectedVersion:1,
    expectedState:'PENDING',detail:'Signed local delivery artifact'}});
  assert.equal(delivered.status,200,JSON.stringify(delivered.body));
  assert.equal(delivered.body.transition.state,'SUBMITTED');
  const reviewed=await send({path:milestone+'accept',method:'POST',
   cookie:reviewer.cookie,csrf:reviewer.csrf,
   body:{eventId:'tls_reviewer_1',expectedVersion:2}});
  assert.equal(reviewed.status,200,JSON.stringify(reviewed.body));
  assert.equal(reviewed.body.transition.state,'ACCEPTED');
  const db=await ledger.getContract({contractId:'contractA',
   actorId:'buyerA',merchantId:'tenantA'});
  assert.equal(db.paymentState,'NOT_CAPTURED');
  assert.equal((await ledger.listAttempts('projectA')).length,0);
  assert.equal(exchanges(),3);
  assert.equal((await send({path:'/api/paypal/orders',method:'POST'})).status,404);
 });
});
test('TLS auth callback cannot replay; revocation and forged-origin requests never gain new authority',async()=>{
 await withService(async({service,send,activate,provision,login,ledger,exchanges})=>{
  await activate();await provision();
  const buyer=await login('ext-buyer');
  assert.equal((await send({path:buyer.callbackPath,
   cookie:buyer.callbackCookie})).status,401);
  assert.equal(exchanges(),1);
  const csrf=await send({path:'/api/auth/oidc/csrf',
   method:'POST',cookie:buyer.cookie,
   extraHeaders:{origin:'https://evil.example.net'}});
  assert.equal(csrf.status,403);
  const forged=await send({path:'/api/auth/oidc/session',
   cookie:buyer.cookie,
   extraHeaders:{host:'evil.example.net','x-forwarded-proto':'https'}});
  assert.ok([421,503].includes(forged.status));
  await ledger.setLocalMemberActive({actorId:'buyerA',
   expectedRevision:1,active:false});
  assert.equal((await send({cookie:buyer.cookie})).status,401);
  await hostNoop();
  async function hostNoop(){
   const revokedStatus=await send({
    path:'/api/marketplace/quotes/projectA',cookie:buyer.cookie});
   assert.equal(revokedStatus.status,401);
  }
  assert.equal(service.state().listening,true);
 });
});


test('real HTTPS existing OIDC cookie is immediately invalid after subject-binding operator revoke',async()=>{
 await withService(async({send,activate,provision,login,host,ledger,exchanges})=>{
  await activate();await provision();
  const buyer=await login('ext-buyer');
  const reviewer=await login('ext-reviewer');
  assert.equal((await send({cookie:buyer.cookie})).status,200);
  assert.equal((await host.operator.revokeIdentity({subject:'ext-buyer'})).revoked,true);
  assert.equal((await ledger.getLocalMember('buyerA')).active,true);
  const denied=await send({cookie:buyer.cookie});
  assert.equal(denied.status,401);
  assert.equal(denied.body.paymentAuthorized,false);
  assert.equal((await send({path:'/api/marketplace/quotes/projectA',
   cookie:buyer.cookie})).status,401);
  assert.equal((await send({path:'/api/auth/oidc/csrf',
   method:'POST',cookie:buyer.cookie})).status,403);
  assert.equal((await send({cookie:reviewer.cookie})).status,200);
  assert.equal(exchanges(),2);
  assert.equal((await ledger.listAttempts('projectA')).length,0);
 });
});


test('real HTTPS private dashboard loads after signed login, server role gate and CSRF enforce writes',async()=>{
 await withService(async({send,activate,provision,login,ledger,exchanges})=>{
  await activate();await provision();
  const seller=await login('ext-seller');
  const buyer=await login('ext-buyer');
  const dashboard=await send({path:'/private/marketplace',cookie:seller.cookie});
  assert.equal(dashboard.status,200);
  assert.match(dashboard.headers['content-type'],/text\/html/);
  assert.ok(dashboard.text.includes('Verified marketplace workspace'));
  assert.ok(dashboard.text.includes('id="submit"'));
  assert.ok(dashboard.headers['content-security-policy'].includes("script-src 'self'"));
  const script=await send({path:'/private/marketplace/app.js',cookie:seller.cookie});
  assert.equal(script.status,200);
  assert.ok(script.text.includes("principal.role!=='seller'"));
  const css=await send({path:'/private/marketplace/app.css',cookie:seller.cookie});
  assert.equal(css.status,200);
  assert.ok(css.text.includes('.columns'));
  const action='/api/marketplace/contracts/contractA/milestones/stepA/submit';
  const body={eventId:'real_ui_submit_1',expectedVersion:1,
   expectedState:'PENDING',detail:'Signed seller delivery via HTTPS browser surface'};
  const noCsrf=await send({path:action,method:'POST',cookie:seller.cookie,body});
  assert.ok([401,403].includes(noCsrf.status));
  const wrongRole=await send({path:action,method:'POST',cookie:buyer.cookie,
   csrf:buyer.csrf,body});
  assert.equal(wrongRole.status,403);
  const refreshed=await send({path:'/api/auth/oidc/csrf',
   method:'POST',cookie:seller.cookie});
  assert.equal(refreshed.status,200);
  assert.equal(refreshed.body.rotated,true);
  const submitted=await send({path:action,method:'POST',
   cookie:seller.cookie,csrf:refreshed.body.csrfToken,body});
  assert.equal(submitted.status,200,submitted.text);
  assert.equal(submitted.body.transition.state,'SUBMITTED');
  assert.equal(exchanges(),2);
  assert.equal((await ledger.getContract({contractId:'contractA',
   actorId:'buyerA',merchantId:'tenantA'})).paymentState,'NOT_CAPTURED');
  assert.equal((await ledger.listAttempts('projectA')).length,0);
 });
});

test('real HTTPS browser navigation callback renders no private CSRF token, keeps two secure cookies',async()=>{
 await withService(async({send,activate,provision,registerCode,exchanges})=>{
  await activate();await provision();
  const start=await send({path:'/api/auth/oidc/start',method:'POST'});
  assert.equal(start.status,303);
  const auth=new URL(start.headers.location);
  const code='BROWSER_SUCCESS_FAKE_CODE_938574';
  registerCode(code,'ext-buyer');
  const initialCookie=start.headers['set-cookie'][0].split(';')[0];
  const callback=await send({path:'/api/auth/oidc/callback?code='+
   encodeURIComponent(code)+'&state='+encodeURIComponent(auth.searchParams.get('state')),
   cookie:initialCookie,
   extraHeaders:{accept:'text/html,application/xhtml+xml;q=0.9'}});
  assert.equal(callback.status,200,callback.text);
  assert.ok(callback.text.includes('href="/private/marketplace"'));
  assert.equal(callback.text.includes('csrfToken'),false);
  assert.equal(callback.headers['set-cookie'].length,2);
  assert.ok(callback.headers['set-cookie'].every(x=>x.includes('Secure')&&x.includes('HttpOnly')));
  const signedCookie=callback.headers['set-cookie'][0].split(';')[0];
  const me=await send({path:'/api/auth/oidc/session',cookie:signedCookie});
  assert.equal(me.status,200);
  assert.equal(me.body.identity.actorId,'buyerA');
  assert.equal(me.body.merchantOwnershipVerified,false);
  assert.equal((await send({path:'/private/marketplace',cookie:signedCookie})).status,200);
  assert.equal(exchanges(),1);
 });
});
