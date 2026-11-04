import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign as cryptoSign} from 'node:crypto';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPinnedOidcIdTokenVerifier} from '../src/pinned_oidc_id_token_verifier.mjs';
import {createHostVerifiedSessionStore} from '../src/host_verified_session_store.mjs';

const issuer='https://accounts.example.org';
const audience='proofline-audience-01';
const nonce='NONCE_HOST_CHALLENGE_012345678901';
const nowMs=1761987600000,nowS=Math.floor(nowMs/1000);
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'TEST-PINNED-K1',use:'sig',alg:'RS256'};
const keys={keys:[jwk]};
const make=(opts={})=>createPinnedOidcIdTokenVerifier({
 issuer,audience,jwks:keys,now:()=>nowMs,...opts
});
const claims={iss:issuer,aud:audience,sub:'account-oidc-A',nonce,
 iat:nowS-10,exp:nowS+3600,auth_time:nowS-10};
function signed(payload={},header={}){
 const h=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT',kid:jwk.kid,...header})).toString('base64url');
 const p=Buffer.from(JSON.stringify({...claims,...payload})).toString('base64url');
 const sig=cryptoSign('RSA-SHA256',Buffer.from(h+'.'+p),privateKey).toString('base64url');
 return h+'.'+p+'.'+sig;
}
const verify=(idToken,expectedNonce=nonce)=>make().verifyExternalIdentity({idToken,expectedNonce});
const denied=async assertion=>assert.rejects(assertion,e=>e.code==='OIDC_ID_TOKEN_UNVERIFIED');

test('real RSA signature verifies; only normalized bounded subject evidence returned, no network',async()=>{
 const x=make(),y=await x.verifyExternalIdentity({idToken:signed(),expectedNonce:nonce});
 assert.deepEqual(Object.keys(y).sort(),
  ['assertionId','audience','authenticatedAtMs','issuer','subject','verified']);
 assert.equal(y.subject,'account-oidc-A');
 assert.equal(y.authenticatedAtMs,(nowS-10)*1000);
 assert.equal(y.assertionId.length,64);
 assert.equal(x.jwksNetworkFetchAllowed,false);
 assert.equal(x.merchantOwnershipVerified,false);
 assert.equal(x.paymentAuthorized,false);
});
test('changed payload, forged signature, alg none, injected headers and oversized JWT fail closed',async()=>{
 const token=signed(),parts=token.split('.');
 const forged=parts[0]+'.'+Buffer.from(JSON.stringify({...claims,sub:'attacker'})).toString('base64url')+'.'+parts[2];
 for(const t of [forged,parts.slice(0,2).join('.')+'.fake',
  signed({},{alg:'none'}),
  signed({},{jku:'https://evil.example.net/jwks.json'}),
  signed({},{crit:['b64']}),'abc.def','', 'x'.repeat(8200)])
  await denied(verify(t));
});
test('reject wrong nonce, issuer, audience, subject and ambiguous multi-aud',async()=>{
 await denied(verify(signed(),'ANOTHER_HOST_CHALLENGE_0123456789'));
 for(const altered of [
  {iss:'https://evil.example.net'},{aud:'evil-client'},{sub:''},
  {nonce:'ATTACKER_CHOSEN_NONCE_0123456789'},
  {aud:[audience,'other-client']},
  {aud:[audience,'other-client'],azp:'other-client'}
 ])await denied(verify(signed(altered)));
 assert.equal((await verify(signed({
  aud:[audience,'another-audience'],azp:audience
 }))).verified,true);
});
test('reject stale, expired, future and malformed authentication timestamps',async()=>{
 for(const altered of [
  {iat:nowS-400,auth_time:nowS-400},{auth_time:nowS-400},
  {iat:nowS+90},{auth_time:nowS+90},{exp:nowS-100},
  {exp:nowS-20,iat:nowS},{nbf:nowS+90},{iat:'not an integer'},
  {auth_time:nowS+40,iat:nowS-10},
  {exp:nowS-100,iat:nowS-150}
 ])await denied(verify(signed(altered)));
});
test('wrong kid and RSA signature by non-pinned private key never trusted',async()=>{
 await denied(verify(signed({}, {kid:'ATTACKER-PINNED'})));
 const {privateKey:badPrivate}=generateKeyPairSync('rsa',{modulusLength:2048});
 const header=Buffer.from(JSON.stringify({alg:'RS256',kid:jwk.kid,typ:'JWT'})).toString('base64url');
 const payload=Buffer.from(JSON.stringify(claims)).toString('base64url');
 const bogus=cryptoSign('RSA-SHA256',
  Buffer.from(header+'.'+payload),badPrivate).toString('base64url');
 await denied(verify(header+'.'+payload+'.'+bogus));
});
test('pinned JWKS refuses duplicate, symmetric, signing-use, weak and unrecognized keys',()=>{
 for(const bad of [
  {keys:[]},{keys:[jwk,jwk]},{keys:[{kty:'oct',kid:'bad',k:'abc'}]},
  {keys:[{...jwk,alg:'HS256'}]},{keys:[{...jwk,use:'enc'}]},
  {keys:[{...jwk,key_ops:['sign']}]}
 ])assert.throws(()=>createPinnedOidcIdTokenVerifier({issuer,audience,jwks:bad}),
  e=>e.code==='OIDC_ID_TOKEN_UNVERIFIED');
 const weak=generateKeyPairSync('rsa',{modulusLength:1024}).publicKey.export({format:'jwk'});
 assert.throws(()=>createPinnedOidcIdTokenVerifier({issuer,audience,
  jwks:{keys:[{...weak,kid:'small'}]}}),
  e=>e.code==='OIDC_ID_TOKEN_UNVERIFIED');
});
test('real signed token binds to preprovisioned member and durable hashed host cookie; replay denied',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ppl-real-rsa-id-token-'));
 let store;
 const token=signed();
 const membership={actorId:'buyerA',merchantId:'tenantA',active:true,role:'buyer',revision:1};
 try{
  const makeStore=()=>createHostVerifiedSessionStore({
   filename:join(dir,'host.sqlite'),expectedOrigin:'https://proofline.example.com',
   trustedIssuer:issuer,trustedAudience:audience,now:()=>nowMs,
   verifyExternalIdentity:make().verifyExternalIdentity,
   lookupExternalAccount:async({issuer:source,subject})=>
    source===issuer&&subject==='account-oidc-A'?
     {actorId:'buyerA',merchantId:'tenantA'}:null,
   getMembership:async actor=>actor==='buyerA'?membership:null
  });
  store=makeStore();
  const issued=await store.establish({idToken:token,expectedNonce:nonce});
  const cookie=issued.setCookie.split(';')[0];
  const request=()=>new Request('https://proofline.example.com/api/marketplace/quotes/projectA',{
   headers:{cookie}
  });
  const session=await store.resolveForGateway(request());
  assert.deepEqual({actorId:session.actorId,merchantId:session.merchantId,role:session.role},
   {actorId:'buyerA',merchantId:'tenantA',role:'buyer'});
  await denied(make().verifyExternalIdentity({
   idToken:token,expectedNonce:'WRONG_SERVER_BOUND_NONCE_123456789'
  }));
  await assert.rejects(store.establish({idToken:token,expectedNonce:nonce}),
   e=>e.code==='HOST_IDP_ASSERTION_ALREADY_CONSUMED');
  const raw=readFileSync(join(dir,'host.sqlite'),'utf8');
  assert.equal(raw.includes(cookie.slice(cookie.indexOf('=')+1)),false);
  assert.equal(raw.includes(issued.csrfToken),false);
  assert.equal(raw.includes(token),false);
  store.close();store=makeStore();
  assert.equal((await store.resolveForGateway(request())).actorId,'buyerA');
  membership.active=false;
  assert.equal(await store.resolveForGateway(request()),null);
 }finally{try{store?.close()}catch{}rmSync(dir,{recursive:true,force:true})}
});
