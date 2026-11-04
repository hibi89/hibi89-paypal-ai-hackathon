import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,generateKeyPairSync,sign} from 'node:crypto';
import {createPreprovisionedOidcAccountBindings} from '../src/preprovisioned_oidc_account_bindings.mjs';
import {createPinnedOidcIdTokenVerifier} from '../src/pinned_oidc_id_token_verifier.mjs';
import {createHostVerifiedSessionStore} from '../src/host_verified_session_store.mjs';

const issuer='https://accounts.example.org';
const users=new Map([
 ['buyerA',{actorId:'buyerA',merchantId:'tenantA',role:'buyer',active:true,revision:1}],
 ['sellerA',{actorId:'sellerA',merchantId:'tenantA',role:'seller',sellerProfileId:'profileA',active:true,revision:1}],
 ['reviewerA',{actorId:'reviewerA',merchantId:'tenantA',role:'reviewer',active:true,revision:1}],
 ['buyerB',{actorId:'buyerB',merchantId:'tenantB',role:'buyer',active:true,revision:1}]
]);
const createFixture=fn=>async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ppl-oidc-bind-'));
 const filename=join(dir,'bindings.sqlite'),subjectPepper=randomBytes(32);
 const members=new Map([...users].map(([k,v])=>[k,{...v}]));
 let operatorAllowed=true;
 const options={filename,issuer,subjectPepper,
  getMembership:async id=>members.get(id)??null,
  authorizeOperatorProvisioning:()=>operatorAllowed,now:()=>1761987600000};
 const stores=[];
 const open=overrides=>{
  const store=createPreprovisionedOidcAccountBindings({...options,...overrides});
  stores.push(store);return store;
 };
 try{await fn({open,filename,dir,members,options,subjectPepper,
  disableOperator:()=>{operatorAllowed=false;}})}
 finally{for(const store of stores)store.close();rmSync(dir,{recursive:true,force:true})}
};
const error=(code)=>e=>e?.code===code;

test('case-sensitive immutable hashed OIDC binding persists and returns only actor/tenant',createFixture(async({open,filename})=>{
 const a=open();
 assert.equal((await a.provision({subject:'External.SUB/A',actorId:'buyerA',merchantId:'tenantA'})).provisioned,true);
 assert.deepEqual(await a.lookupExternalAccount({issuer,subject:'External.SUB/A'}),
  {actorId:'buyerA',merchantId:'tenantA'});
 assert.equal(await a.lookupExternalAccount({issuer,subject:'external.sub/a'}),null);
 assert.equal(await a.lookupExternalAccount({issuer:'https://evil.example',subject:'External.SUB/A'}),null);
 const persisted=readFileSync(filename);
 assert.equal(persisted.includes(Buffer.from('External.SUB/A')),false);
 assert.equal(persisted.includes(Buffer.from('proofline:oidc-binding-key-check:v1')),false);
 a.close();
 assert.deepEqual(await open().lookupExternalAccount({issuer,subject:'External.SUB/A'}),
  {actorId:'buyerA',merchantId:'tenantA'});
}));
test('same subject or same actor cannot be rebound, including after revocation',createFixture(async({open})=>{
 const a=open();
 await a.provision({subject:'sub-A',actorId:'buyerA',merchantId:'tenantA'});
 await assert.rejects(a.provision({subject:'sub-A',actorId:'buyerB',merchantId:'tenantB'}),error('OIDC_BINDING_ALREADY_REGISTERED'));
 await assert.rejects(a.provision({subject:'sub-B',actorId:'buyerA',merchantId:'tenantA'}),error('OIDC_BINDING_ALREADY_REGISTERED'));
 await a.revoke({subject:'sub-A'});
 assert.equal(await a.lookupExternalAccount({issuer,subject:'sub-A'}),null);
 await assert.rejects(a.revoke({subject:'sub-A'}),error('OIDC_BINDING_NOT_ACTIVE'));
 await assert.rejects(a.provision({subject:'sub-A',actorId:'buyerA',merchantId:'tenantA'}),error('OIDC_BINDING_ALREADY_REGISTERED'));
}));
test('suspended, removed and tenant-changed membership is denied at lookup',createFixture(async({open,members})=>{
 const a=open();
 await a.provision({subject:'sub-A',actorId:'buyerA',merchantId:'tenantA'});
 members.get('buyerA').active=false;
 assert.equal(await a.lookupExternalAccount({issuer,subject:'sub-A'}),null);
 members.get('buyerA').active=true;
 members.get('buyerA').merchantId='tenantB';
 assert.equal(await a.lookupExternalAccount({issuer,subject:'sub-A'}),null);
 members.delete('buyerA');
 assert.equal(await a.lookupExternalAccount({issuer,subject:'sub-A'}),null);
}));
test('operator guard is private and mandatory for writes, never for verified lookup',createFixture(async({open,disableOperator})=>{
 const a=open();
 await a.provision({subject:'buyer-1',actorId:'buyerA',merchantId:'tenantA'});
 disableOperator();
 assert.deepEqual(await a.lookupExternalAccount({issuer,subject:'buyer-1'}),
  {actorId:'buyerA',merchantId:'tenantA'});
 await assert.rejects(a.provision({subject:'buyer-2',actorId:'buyerB',merchantId:'tenantB'}),error('OIDC_BINDING_OPERATOR_NOT_AUTHORIZED'));
 await assert.rejects(a.revoke({subject:'buyer-1'}),error('OIDC_BINDING_OPERATOR_NOT_AUTHORIZED'));
 assert.equal(a.publicRegistrationEnabled,false);
 assert.equal(a.providerNetworkCalls,0);
}));
test('reject wrong pepper on restart rather than silently losing identity mapping',createFixture(async({open})=>{
 const a=open();await a.provision({subject:'buyer-1',actorId:'buyerA',merchantId:'tenantA'});
 a.close();
 assert.throws(()=>open({subjectPepper:randomBytes(32)}),error('OIDC_BINDING_PEPPER_MISMATCH'));
}));
test('reject unknown, cross-tenant, suspended and malformed enrollment inputs',createFixture(async({open,members})=>{
 const a=open();
 for(const args of [
  {subject:'',actorId:'buyerA',merchantId:'tenantA'},
  {subject:'has space',actorId:'buyerA',merchantId:'tenantA'},
  {subject:'x',actorId:'INVALID!',merchantId:'tenantA'}
 ])await assert.rejects(a.provision(args),e=>e.code?.startsWith('OIDC_BINDING_'));
 await assert.rejects(a.provision({subject:'x',actorId:'buyerA',merchantId:'tenantB'}),error('OIDC_BINDING_MEMBER_UNVERIFIED'));
 await assert.rejects(a.provision({subject:'x',actorId:'unknown',merchantId:'tenantA'}),error('OIDC_BINDING_MEMBER_UNVERIFIED'));
 members.get('sellerA').active=false;
 await assert.rejects(a.provision({subject:'seller-x',actorId:'sellerA',merchantId:'tenantA'}),error('OIDC_BINDING_MEMBER_UNVERIFIED'));
}));
test('simultaneous independent SQLite handles allow exactly one enrollment',createFixture(async({open})=>{
 const a=open(),b=open();
 const results=await Promise.allSettled([
  a.provision({subject:'one',actorId:'buyerA',merchantId:'tenantA'}),
  b.provision({subject:'one',actorId:'buyerB',merchantId:'tenantB'})
 ]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='OIDC_BINDING_ALREADY_REGISTERED').length,1);
 assert.ok(await a.lookupExternalAccount({issuer,subject:'one'}));
}));
test('invalid config, revoked writer and closed store fail closed',createFixture(async({open})=>{
 for(const config of [
  {issuer:'http://accounts.example.org'},
  {issuer:'https://localhost'},
  {subjectPepper:Buffer.alloc(12)},
  {filename:':memory:'}
 ])assert.throws(()=>open(config),e=>e.code?.startsWith('OIDC_BINDING_'));
 const a=open({authorizeOperatorProvisioning:undefined});
 await assert.rejects(a.provision({subject:'a',actorId:'buyerA',merchantId:'tenantA'}),error('OIDC_BINDING_OPERATOR_NOT_AUTHORIZED'));
 a.close();
 await assert.rejects(a.lookupExternalAccount({issuer,subject:'a'}),error('OIDC_BINDING_STORE_CLOSED'));
}));
test('RSA verified IdP subject uses persisted binding and host session, never JWT actor claim',createFixture(async({open,dir,members})=>{
 const bindings=open();
 await bindings.provision({subject:'external-person-001',actorId:'buyerA',merchantId:'tenantA'});
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const jwk={...publicKey.export({format:'jwk'}),kid:'TEST-ACCOUNT-LINK',use:'sig',alg:'RS256'};
 const aud='proofline-offline-client',t=1761987600000,s=Math.floor(t/1000);
 const nonce='TEST_NONCE_PRIVATE_0123456789ABCDE';
 const signed=(extra={})=>{
  const h=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT',kid:jwk.kid})).toString('base64url');
  const p=Buffer.from(JSON.stringify({iss:issuer,aud,sub:'external-person-001',
   nonce,iat:s-2,auth_time:s-2,exp:s+120,actorId:'buyerB',
   merchantId:'tenantB',...extra})).toString('base64url');
  return h+'.'+p+'.'+sign('RSA-SHA256',Buffer.from(h+'.'+p),privateKey).toString('base64url');
 };
 const verifier=createPinnedOidcIdTokenVerifier({issuer,audience:aud,jwks:{keys:[jwk]},now:()=>t});
 const sessions=createHostVerifiedSessionStore({
  filename:join(dir,'host-session.sqlite'),expectedOrigin:'https://proofline.example.com',
  trustedIssuer:issuer,trustedAudience:aud,
  verifyExternalIdentity:verifier.verifyExternalIdentity,
  lookupExternalAccount:bindings.lookupExternalAccount,
  getMembership:async id=>members.get(id)??null,now:()=>t
 });
 try{
  const ticket=await sessions.establish({idToken:signed(),expectedNonce:nonce});
  assert.equal(ticket.paymentAuthorized,false);
  const req=new Request('https://proofline.example.com/api/auth/oidc/session',{
   headers:{cookie:ticket.setCookie.split(';')[0]}});
  const resolved=await sessions.resolveRequest(req);
  assert.equal(resolved.actorId,'buyerA');
  assert.equal(resolved.merchantId,'tenantA');
  assert.notEqual(resolved.actorId,'buyerB');
  await assert.rejects(sessions.establish({idToken:signed(),expectedNonce:nonce}),
   error('HOST_IDP_ASSERTION_ALREADY_CONSUMED'));
  members.get('buyerA').active=false;
  assert.equal(await sessions.resolveRequest(req),null);
 }finally{sessions.close()}
}));
