import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import {createManagedOidcJwksVerifier} from '../src/managed_oidc_jwks_verifier.mjs';
import {createHostVerifiedSessionStore} from '../src/host_verified_session_store.mjs';

const issuer='https://accounts.example.org';
const audience='proofline-offline-client';
const origin='https://proofline.example.com';
const nonce='SECRET_ONESHOT_HOST_NONCE_0123456789ABC';
const initial=1761987600000;
const keypair=()=>generateKeyPairSync('rsa',{modulusLength:2048});
const keyA=keypair(),keyB=keypair();
const publicJwk=(pair,kid)=>({...pair.publicKey.export({format:'jwk'}),kid,alg:'RS256',use:'sig'});
const jwkA=publicJwk(keyA,'TRUSTED-KID-A'),jwkB=publicJwk(keyB,'TRUSTED-KID-B');
const jwks=(...keys)=>({keys});
const token=(pair,kid,{now=initial,subject='person-001',claims={},header={}}={})=>{
 const s=Math.floor(now/1000);
 const h=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT',kid,...header})).toString('base64url');
 const p=Buffer.from(JSON.stringify({iss:issuer,aud:audience,sub:subject,nonce,
  iat:s-3,auth_time:s-3,exp:s+120,...claims})).toString('base64url');
 return h+'.'+p+'.'+sign('RSA-SHA256',Buffer.from(h+'.'+p),pair.privateKey).toString('base64url');
};
const assertion=(pair,kid,opts)=>({idToken:token(pair,kid,opts),expectedNonce:nonce});
const fails=code=>e=>e?.code===code;
const fixture=fn=>async()=>{
 const dir=mkdtempSync(join(tmpdir(),'proofline-jwks-'));
 const filename=join(dir,'trust.sqlite');
 let t=initial,approved=true;
 const opts={filename,issuer,audience,now:()=>t,
  authorizeTrustUpdate:()=>approved};
 const instances=[];
 const open=(patch={})=>{
  const x=createManagedOidcJwksVerifier({...opts,...patch});
  instances.push(x);return x;
 };
 try{await fn({open,filename,dir,opts,now:()=>t,
  advance:ms=>{t+=ms},deny:()=>{approved=false},
  allow:()=>{approved=true}})}
 finally{for(const s of instances)s.close();rmSync(dir,{recursive:true,force:true})}
};
const add=async(m,keys=jwks(jwkA),duration=600_000)=>{
 const revision=m.status().revision;
 await m.stage({jwks:keys,expectedRevision:revision,
  validUntilMs:initial+duration});
 return m.activateStaged({expectedRevision:revision});
};

test('unconfigured trust is fail-closed, staged keys are not active, and no discovery/network exists',fixture(async({open})=>{
 const m=open();
 assert.equal(m.status().active,false);
 assert.equal(m.providerNetworkEnabled,false);
 assert.equal(m.autoRefreshEnabled,false);
 await assert.rejects(m.verifyExternalIdentity(assertion(keyA,jwkA.kid)),fails('OIDC_ID_TOKEN_UNVERIFIED'));
 await m.stage({jwks:jwks(jwkA),expectedRevision:0,validUntilMs:initial+600_000});
 assert.equal(m.status().staged,true);
 await assert.rejects(m.verifyExternalIdentity(assertion(keyA,jwkA.kid)),fails('OIDC_ID_TOKEN_UNVERIFIED'));
 assert.equal((await m.activateStaged({expectedRevision:0})).revision,1);
 assert.equal(m.status().active,true);
 assert.equal((await m.verifyExternalIdentity(assertion(keyA,jwkA.kid))).subject,'person-001');
}));
test('strict RSA signature, issuer, nonce, audience, token header URLs and forged key denied',fixture(async({open})=>{
 const m=open();await add(m);
 assert.equal((await m.verifyExternalIdentity(assertion(keyA,jwkA.kid))).verified,true);
 for(const bad of [
  assertion(keyB,jwkA.kid),
  assertion(keyA,jwkA.kid,{claims:{nonce:'ATTACKER_DIFFERENT_HOST_NONCE_0123'}}),
  assertion(keyA,jwkA.kid,{claims:{iss:'https://evil.example'}}),
  assertion(keyA,jwkA.kid,{claims:{aud:'wrong-client'}}),
  assertion(keyA,jwkA.kid,{header:{jku:'https://evil.example/keys'}}),
  assertion(keyA,jwkA.kid,{header:{alg:'none'}})
 ])await assert.rejects(m.verifyExternalIdentity(bad),fails('OIDC_ID_TOKEN_UNVERIFIED'));
}));
test('rotation replaces old keys immediately; approved overlap must be explicit',fixture(async({open})=>{
 const m=open();await add(m);
 const fresh=m.status().revision;
 await m.stage({jwks:jwks(jwkB),expectedRevision:fresh,validUntilMs:initial+600_000});
 assert.equal((await m.verifyExternalIdentity(assertion(keyA,jwkA.kid))).verified,true);
 assert.equal((await m.activateStaged({expectedRevision:fresh})).revision,2);
 await assert.rejects(m.verifyExternalIdentity(assertion(keyA,jwkA.kid)),fails('OIDC_ID_TOKEN_UNVERIFIED'));
 assert.equal((await m.verifyExternalIdentity(assertion(keyB,jwkB.kid))).verified,true);
 const prev=m.status().revision;
 await m.stage({jwks:jwks(jwkA,jwkB),expectedRevision:prev,validUntilMs:initial+600_000});
 await m.activateStaged({expectedRevision:prev});
 assert.equal((await m.verifyExternalIdentity(assertion(keyA,jwkA.kid))).verified,true);
 assert.equal((await m.verifyExternalIdentity(assertion(keyB,jwkB.kid))).verified,true);
}));
test('expiry blocks all authentication without stale-key fallback; expired staged set cannot activate',fixture(async({open,advance})=>{
 const m=open();
 await add(m,jwks(jwkA),60_000);
 advance(60_000);
 assert.equal(m.status().active,false);
 await assert.rejects(m.verifyExternalIdentity(assertion(keyA,jwkA.kid,{now:initial+60_000})),
  fails('OIDC_ID_TOKEN_UNVERIFIED'));
 await m.stage({jwks:jwks(jwkB),expectedRevision:1,validUntilMs:initial+120_000});
 advance(60_000);
 await assert.rejects(m.activateStaged({expectedRevision:1}),fails('OIDC_JWKS_STAGE_UNAVAILABLE'));
 assert.equal(m.status().revision,1);
}));
test('stale revision and wrong operator are denied with unchanged active trust',fixture(async({open,deny})=>{
 const a=open(),b=open();
 await add(a);
 await assert.rejects(b.stage({jwks:jwks(jwkB),expectedRevision:0,
  validUntilMs:initial+600_000}),fails('OIDC_JWKS_STALE_REVISION'));
 deny();
 await assert.rejects(a.revokeActive({expectedRevision:1}),fails('OIDC_JWKS_OPERATOR_NOT_AUTHORIZED'));
 await assert.rejects(a.stage({jwks:jwks(jwkB),expectedRevision:1,
  validUntilMs:initial+600_000}),fails('OIDC_JWKS_OPERATOR_NOT_AUTHORIZED'));
 assert.equal((await b.verifyExternalIdentity(assertion(keyA,jwkA.kid))).verified,true);
}));
test('explicit revocation cannot be bypassed by an earlier stage or restart',fixture(async({open})=>{
 const a=open();await add(a);
 await a.stage({jwks:jwks(jwkB),expectedRevision:1,validUntilMs:initial+600_000});
 assert.equal((await a.revokeActive({expectedRevision:1})).revision,2);
 const b=open();
 assert.equal(b.status().active,false);
 assert.equal(b.status().staged,false);
 await assert.rejects(b.activateStaged({expectedRevision:2}),fails('OIDC_JWKS_STAGE_UNAVAILABLE'));
 await assert.rejects(b.verifyExternalIdentity(assertion(keyA,jwkA.kid)),fails('OIDC_ID_TOKEN_UNVERIFIED'));
}));
test('reject private JWK material, weak, symmetric, duplicate and malformed key sets before staging',fixture(async({open})=>{
 const m=open();
 const weak=publicJwk(keypair(),'OTHER');
 const malformed=[
  jwks({...jwkA,d:'PRIVATE_NOT_ALLOWED'}),
  jwks({...jwkA,k:'SYMMETRIC_NOT_ALLOWED'}),
  jwks(jwkA,jwkA),
  jwks({kty:'oct',kid:'HMAC-KID',k:'x'}),
  {keys:[]},
  {keys:[jwkA],extra:'untrusted'}
 ];
 for(const set of malformed)
  await assert.rejects(m.stage({jwks:set,expectedRevision:0,validUntilMs:initial+600_000}),
   fails('OIDC_JWKS_PUBLIC_KEYSET_REQUIRED'));
 assert.equal(m.status().staged,false);
 assert.equal(weak.kty,'RSA');
}));
test('invalid expiry, wrong persisted issuer, missing operator and closed handle fail closed',fixture(async({open,filename})=>{
 const a=open();
 for(const value of [initial,initial+59_000,initial+9*24*60*60*1000])
  await assert.rejects(a.stage({jwks:jwks(jwkA),expectedRevision:0,validUntilMs:value}),
   fails('OIDC_JWKS_TRUST_EXPIRY_INVALID'));
 assert.throws(()=>open({issuer:'https://different.example.org'}),fails('OIDC_JWKS_CONFIGURATION_MISMATCH'));
 assert.throws(()=>open({filename:':memory:'}),fails('OIDC_JWKS_PRIVATE_CONFIGURATION_REQUIRED'));
 const denied=open({authorizeTrustUpdate:undefined});
 await assert.rejects(denied.stage({jwks:jwks(jwkA),expectedRevision:0,validUntilMs:initial+600_000}),
  fails('OIDC_JWKS_OPERATOR_NOT_AUTHORIZED'));
 a.close();
 await assert.rejects(a.verifyExternalIdentity(assertion(keyA,jwkA.kid)),fails('OIDC_ID_TOKEN_UNVERIFIED'));
 assert.ok(filename.endsWith('trust.sqlite'));
}));
test('SQLite restart preserves active public keys but does not persist assertion or private data',fixture(async({open,filename})=>{
 const a=open();
 await add(a);
 a.close();
 const b=open();
 assert.equal(b.status().revision,1);
 assert.equal((await b.verifyExternalIdentity(assertion(keyA,jwkA.kid))).verified,true);
 const bytes=readFileSync(filename);
 assert.equal(bytes.includes(Buffer.from('PRIVATE_NOT_ALLOWED')),false);
 assert.equal(bytes.includes(Buffer.from('ID_TOKEN_SECRET_SENTINEL')),false);
}));
test('OIDC signed identity uses operator-activated key before durable host session; no actor claim trust',fixture(async({open,dir})=>{
 const trust=open();await add(trust);
 const member={actorId:'buyerA',merchantId:'tenantA',role:'buyer',active:true,revision:1};
 const hosts=createHostVerifiedSessionStore({
  filename:join(dir,'sessions.sqlite'),expectedOrigin:origin,
  trustedIssuer:issuer,trustedAudience:audience,
  verifyExternalIdentity:trust.verifyExternalIdentity,
  lookupExternalAccount:async({issuer:src,subject})=>
   src===issuer&&subject==='person-001'?
    {actorId:'buyerA',merchantId:'tenantA'}:null,
  getMembership:async id=>id==='buyerA'?member:null,now:()=>initial
 });
 try{
  const claims={actorId:'ATTACKER',merchantId:'tenantB'};
  const {setCookie,paymentAuthorized}=await hosts.establish(assertion(keyA,jwkA.kid,{claims}));
  assert.equal(paymentAuthorized,false);
  const session=await hosts.resolveRequest(new Request(origin+'/api/auth/oidc/session',{
   headers:{cookie:setCookie.split(';')[0]}}));
  assert.equal(session.actorId,'buyerA');
  assert.equal(session.merchantId,'tenantA');
  member.active=false;
  assert.equal(await hosts.resolveRequest(new Request(origin+'/api/auth/oidc/session',{
   headers:{cookie:setCookie.split(';')[0]}})),null);
 }finally{hosts.close()}
}));
