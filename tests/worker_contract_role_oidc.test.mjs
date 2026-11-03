import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash,createHmac,generateKeyPairSync,sign} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createWorkerPrivateOidcAuthority} from '../src/worker_private_oidc_authority.mjs';
import {createWorkerContractRoleSessionResolver} from '../src/worker_contract_role_session_resolver.mjs';
import {createWorkerOidcPkceCoordinator} from '../src/worker_oidc_pkce_coordinator.mjs';

const O='https://proofline.role-ci.invalid',ISS='https://oidc.role-ci.invalid';
const AUD='role-ci-client',T=1800000000000;
const PEPPER=Uint8Array.from({length:32},(_,i)=>i+21);
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwks={keys:[{...publicKey.export({format:'jwk'}),kid:'role-ci-key',alg:'RS256',use:'sig'}]};
const b64=x=>Buffer.from(x).toString('base64url');
const hash=x=>createHash('sha256').update(x).digest('hex');
const hmac=x=>createHmac('sha256',PEPPER).update('proofline:worker-oidc:v1\0'+ISS+'\0'+x).digest('hex');
function jwt(nonce,subject,overrides={}){
 const body={iss:ISS,aud:AUD,sub:subject,nonce,iat:T/1000-15,auth_time:T/1000-20,
  exp:T/1000+200,...overrides};
 const value=b64(JSON.stringify({alg:'RS256',kid:'role-ci-key',typ:'JWT'}))+'.'+b64(JSON.stringify(body));
 return value+'.'+sign('RSA-SHA256',Buffer.from(value),privateKey).toString('base64url');
}
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 for(const p of ['0001_payment_claims.sql','0002_worker_private_sessions.sql',
  '0003_worker_private_oidc.sql','0004_worker_private_binding_epoch.sql'])
  sqlite.exec(readFileSync(new URL('../migrations/d1/'+p,import.meta.url),'utf8'));
 for(const p of ['0005_contract_role_milestones.sql','0006_contract_role_sessions.sql'])
  sqlite.exec(readFileSync(new URL('../migrations/d1_candidate/'+p,import.meta.url),'utf8'));
 sqlite.prepare('INSERT INTO worker_private_oidc_bindings(issuer,subject_hmac,actor_id,merchant_id,role) VALUES(?,?,?,?,?)')
  .run(ISS,hmac('owner-sub'),'ci-owner','ci-merchant','OWNER');
 for(const [actor,role,subject] of [['ci-seller','SELLER','seller-sub'],
  ['ci-reviewer','REVIEWER','reviewer-sub']]){
  sqlite.prepare('INSERT INTO worker_contract_memberships(actor_id,merchant_id,role) VALUES(?,?,?)')
   .run(actor,'ci-merchant',role);
  sqlite.prepare('INSERT INTO worker_contract_role_bindings(issuer,subject_hmac,actor_id,merchant_id,role) VALUES(?,?,?,?,?)')
   .run(ISS,hmac(subject),actor,'ci-merchant',role);
 }
 const db={withSession(mode){
  assert.equal(mode,'first-primary');
  return {prepare(sql){return {bind(...args){return {
   async first(){return sqlite.prepare(sql).get(...args)??null},
   async all(){return {results:sqlite.prepare(sql).all(...args)}},
   async run(){const result=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}}}
  }}}}};
 }};
 const opts={db,issuer:ISS,audience:AUD,jwks,subjectPepper:PEPPER,allowedOrigin:O,now:()=>T};
 const authority=createWorkerPrivateOidcAuthority({...opts,roleSessionsEnabled:true});
 const resolver=createWorkerContractRoleSessionResolver({db,now:()=>T});
 const cookie=created=>created.setCookie.split(';')[0];
 const check=reqCookie=>resolver(new Request(O+'/__private/contracts',{headers:{cookie:reqCookie}}));
 return {sqlite,db,opts,authority,resolver,cookie,check};
}
test('pinned signed seller and reviewer OIDC issues isolated role cookies and no owner session',async()=>{
 const f=fixture();
 for(const [subject,role] of [['seller-sub','SELLER'],['reviewer-sub','REVIEWER']]){
  const c=await f.authority.beginChallenge();
  const issued=await f.authority.issue({challengeId:c.challengeId,idToken:jwt(c.nonce,subject)});
  assert.match(issued.setCookie,/^__Host-proofline_contract_role=[A-Za-z0-9_-]{43}; Secure; HttpOnly; Path=\/; SameSite=Strict/);
  assert.equal(issued.paymentAuthorized,false);
  const result=await f.check(f.cookie(issued));
  assert.equal(result.identityRole,role);
  assert.equal(result.merchantId,'ci-merchant');
  await assert.rejects(f.authority.issue({challengeId:c.challengeId,idToken:jwt(c.nonce,subject)}),
   {code:'LOGIN_CHALLENGE_INVALID'});
 }
 assert.equal(f.sqlite.prepare('SELECT count(*) n FROM worker_contract_role_sessions').get().n,2);
 assert.equal(f.sqlite.prepare('SELECT count(*) n FROM worker_private_sessions').get().n,0);
 f.sqlite.close();
});
test('owner cookie and OWNER-only session schema remain unchanged when role mode enabled',async()=>{
 const f=fixture(),c=await f.authority.beginChallenge();
 const issued=await f.authority.issue({challengeId:c.challengeId,idToken:jwt(c.nonce,'owner-sub')});
 assert.match(issued.setCookie,/^__Host-proofline_session=/);
 assert.equal(f.sqlite.prepare('SELECT count(*) n FROM worker_private_sessions').get().n,1);
 assert.equal(f.sqlite.prepare('SELECT count(*) n FROM worker_contract_role_sessions').get().n,0);
 f.sqlite.close();
});
test('role OIDC issuance is disabled by default and rejects invalid or revoked grants',async()=>{
 const f=fixture();
 const disabled=createWorkerPrivateOidcAuthority({...f.opts});
 const c=await disabled.beginChallenge();
 await assert.rejects(disabled.issue({challengeId:c.challengeId,idToken:jwt(c.nonce,'seller-sub')}),
  {code:'PREPROVISIONED_ACCOUNT_REQUIRED'});
 f.sqlite.prepare("UPDATE worker_contract_memberships SET active=0,revision=revision+1 WHERE role='SELLER'").run();
 const c2=await f.authority.beginChallenge();
 await assert.rejects(f.authority.issue({challengeId:c2.challengeId,idToken:jwt(c2.nonce,'seller-sub')}),
  {code:'PREPROVISIONED_ACCOUNT_REQUIRED'});
 f.sqlite.prepare("UPDATE worker_contract_memberships SET active=1,revision=revision+1 WHERE role='SELLER'").run();
 const c3=await f.authority.beginChallenge();
 await assert.rejects(f.authority.issue({challengeId:c3.challengeId,idToken:jwt(c3.nonce,'unprovisioned-sub')}),
  {code:'PREPROVISIONED_ACCOUNT_REQUIRED'});
 const c4=await f.authority.beginChallenge();
 await assert.rejects(f.authority.issue({challengeId:c4.challengeId,idToken:jwt(c4.nonce,'seller-sub',{aud:'wrong-audience'})}),
  {code:'OIDC_TOKEN_UNVERIFIED'});
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM worker_contract_role_sessions').get().n,0);
 f.sqlite.close();
});
test('role logout securely revokes the hash and never revives after binding reactivation',async()=>{
 const f=fixture(),c=await f.authority.beginChallenge();
 const issued=await f.authority.issue({challengeId:c.challengeId,idToken:jwt(c.nonce,'seller-sub')});
 const cookie=f.cookie(issued);
 assert.equal((await f.check(cookie)).identityRole,'SELLER');
 const logout=new Request(O+'/api/auth/oidc/logout',{method:'POST',headers:{
  cookie,origin:O,'sec-fetch-site':'same-origin'
 }});
 const result=await f.authority.revoke({request:logout});
 assert.equal(result.revoked,true);
 assert.match(result.clearCookie,/^__Host-proofline_contract_role=; Secure; HttpOnly/);
 await assert.rejects(f.check(cookie));
 await assert.rejects(f.authority.revoke({request:logout}),{code:'SESSION_REVOKE_NOT_AUTHORIZED'});
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM worker_contract_role_sessions WHERE revoked_at_ms IS NOT NULL').get().n,1);
 f.sqlite.close();
});
test('PKCE callback accepts signed role cookie only under distinct role-mode opt-in',async()=>{
 const f=fixture();
 let ticket;
 const pkce=createWorkerOidcPkceCoordinator({authority:f.authority,
  codeTransport:{exchange:async incoming=>{ticket=incoming;
   const row=f.sqlite.prepare('SELECT nonce FROM worker_private_login_challenges ORDER BY created_at_ms DESC LIMIT 1').get();
   return {idToken:jwt(row.nonce,'reviewer-sub')};
  }},allowedOrigin:O,issuer:ISS,clientId:AUD,
  authorizationEndpoint:ISS+'/authorize',tokenEndpoint:ISS+'/token',roleSessionsEnabled:true});
 const start=await pkce.start(new Request(O+'/api/auth/oidc/start',{method:'POST',
  headers:{origin:O,'sec-fetch-site':'same-origin'}}));
 assert.equal(start.status,303);
 const next=new URL(start.headers.get('location'));
 const cookies=start.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
 const callback=await pkce.callback(new Request(O+'/api/auth/oidc/callback?code=CI_TEST_CODE&state='+
  next.searchParams.get('state'),{headers:{cookie:cookies,'sec-fetch-site':'cross-site'}}));
 assert.equal(callback.status,200);
 assert.equal(ticket.clientId,AUD);
 const established=callback.headers.getSetCookie().find(x=>x.startsWith('__Host-proofline_contract_role='));
 assert.ok(established);
 assert.equal((await f.check(established.split(';')[0])).identityRole,'REVIEWER');
 f.sqlite.close();
});
