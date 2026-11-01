import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash,createHmac,generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createWorkerPrivateOidcAuthority} from '../src/worker_private_oidc_authority.mjs';
import {createWorkerPrivateSessionResolver} from '../src/worker_private_session_resolver.mjs';
import {createPrivateWorkerReadHandler} from '../src/worker_private_read_entrypoint.mjs';
const ORIGIN='https://proofline.example.test';
const ISSUER='https://trusted-idp.example.test';
const AUD='proofline-owner-client';
const SUBJECT='verified-subject-A';
const CURRENT=1_800_000_000_000;
const PEPPER=Uint8Array.from({length:32},(_,i)=>i+13); // fixture-only: never a real secret
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwks={keys:[{...publicKey.export({format:'jwk'}),kid:'fixture-key',alg:'RS256',use:'sig'}]};
const schema=['0001_payment_claims.sql','0002_worker_private_sessions.sql',
 '0003_worker_private_oidc.sql'].map(x=>readFileSync(new URL('../migrations/d1/'+x,import.meta.url),'utf8'));
const b64=data=>Buffer.from(data).toString('base64url');
const digest=x=>createHash('sha256').update(x).digest('hex');
const subjectHmac=s=>createHmac('sha256',PEPPER)
 .update('proofline:worker-oidc:v1\0'+ISSUER+'\0'+s).digest('hex');
const jwt=(nonce,overrides={},signer=privateKey)=>{
 const p={iss:ISSUER,aud:AUD,sub:SUBJECT,nonce,
  iat:Math.floor(CURRENT/1000)-15,auth_time:Math.floor(CURRENT/1000)-20,
  exp:Math.floor(CURRENT/1000)+240,...overrides};
 const signed=b64(JSON.stringify({alg:'RS256',kid:'fixture-key',typ:'JWT'}))+'.'+b64(JSON.stringify(p));
 return signed+'.'+sign('RSA-SHA256',Buffer.from(signed),signer).toString('base64url');
};

function fixture({bound=true,dbUnavailable=false}={}){
 const dir=mkdtempSync(join(tmpdir(),'proofline-private-oidc-'));
 const file=join(dir,'state.sqlite');
 const master=new DatabaseSync(file);
 for(const migration of schema)master.exec(migration);
 master.prepare(`INSERT INTO quotes(id,owner_id,merchant_id,version,currency,status,
 approval_actor,approval_version,approval_amount_minor) VALUES(?,?,?,?,?,?,?,?,?)`)
 .run('q1','owner','merchant',2,'USD','APPROVED','owner',2,1500);
 master.prepare(`INSERT INTO payment_attempts(request_id,quote_id,quote_version,merchant_id,
 operation,state,amount_minor,currency) VALUES(?,?,?,?,?,?,?,?)`)
 .run('req1','q1',2,'merchant','create','IN_FLIGHT',1500,'USD');
 if(bound)master.prepare(`INSERT INTO worker_private_oidc_bindings
  (issuer,subject_hmac,actor_id,merchant_id,role,active) VALUES(?,?,?,?,?,?)`)
  .run(ISSUER,subjectHmac(SUBJECT),'owner','merchant','OWNER',1);
 const handles=[],stats={reads:0,writes:0,modes:[],errors:0};
 let failInsert=false,offline=dbUnavailable;
 const db={withSession(mode){
   stats.modes.push(mode);
   if(offline)throw Error('injected D1 unavailable');
   assert.equal(mode,'first-primary');
   const conn=new DatabaseSync(file);handles.push(conn);
   conn.exec('PRAGMA busy_timeout=1000');
   return {prepare(statement){return {bind(...values){return {
     async first(){stats.reads++;return conn.prepare(statement).get(...values)??null;},
     async run(){stats.writes++;if(failInsert&&statement.includes('INSERT INTO worker_private_sessions'))
        throw Error('synthetic D1 outage during insert');
       const output=conn.prepare(statement).run(...values);
       return {success:true,meta:{changes:Number(output.changes)}};}
   };}};}};
 }};
 const now=()=>CURRENT;
 const authority=createWorkerPrivateOidcAuthority({db,issuer:ISSUER,audience:AUD,
  jwks,subjectPepper:PEPPER,allowedOrigin:ORIGIN,now});
 const resolver=createWorkerPrivateSessionResolver({db,now});
 const reader=createPrivateWorkerReadHandler({db,allowedOrigin:ORIGIN,now});
 const validCookie=setCookie=>setCookie.split(';')[0];
 const request=(cookie,method='GET',header={})=>new Request(ORIGIN+
    '/__private/attempt/status?quoteId=q1&quoteVersion=2&operation=create&requestId=req1',{
   method,headers:{cookie,'sec-fetch-site':'same-origin',...header}});
 async function establish(){const challenge=await authority.beginChallenge();
   return authority.issue({challengeId:challenge.challengeId,idToken:jwt(challenge.nonce)});}
 function close(){for(const h of handles)h.close();master.close();rmSync(dir,{recursive:true,force:true});}
 return {master,db,stats,authority,resolver,reader,establish,validCookie,request,
   setUnavailable:x=>offline=x,failSessionInsert:x=>failInsert=x,close};
}
const run=fn=>async()=>{const f=fixture();try{await fn(f);}finally{f.close();}};

test('pinned OIDC RS256 + server nonce + private membership issues hashed durable cookie',run(async f=>{
 const result=await f.establish();
 assert.match(result.setCookie,/^__Host-proofline_session=[A-Za-z0-9_-]{43}; Secure; HttpOnly; Path=\/; SameSite=Strict/);
 assert.equal(result.paymentAuthorized,false);
 const cookie=f.validCookie(result.setCookie);
 const user=await f.resolver(f.request(cookie));
 assert.deepEqual(user,{verified:true,actorId:'owner',merchantId:'merchant'});
 const body=await (await f.reader.fetch(f.request(cookie))).json();
 assert.equal(body.state,'IN_FLIGHT');assert.equal(body.providerCalls,0);
 const rows=f.master.prepare('SELECT * FROM worker_private_sessions').all();
 assert.equal(rows.length,1);
 assert.equal(rows[0].token_sha256,digest(cookie.split('=')[1]));
 assert.equal(rows[0].actor_id,'owner');
 assert.equal(rows[0].merchant_id,'merchant');
 assert.ok(f.stats.modes.every(x=>x==='first-primary'));
}));

test('one-time challenge and JWT replay cannot issue a second session',run(async f=>{
 const challenge=await f.authority.beginChallenge();const signed=jwt(challenge.nonce);
 await f.authority.issue({challengeId:challenge.challengeId,idToken:signed});
 await assert.rejects(f.authority.issue({challengeId:challenge.challengeId,idToken:signed}),
  {code:'LOGIN_CHALLENGE_INVALID'});
 const other=await f.authority.beginChallenge();
 await assert.rejects(f.authority.issue({challengeId:other.challengeId,idToken:signed}),
  {code:'OIDC_TOKEN_UNVERIFIED'});
 assert.equal(f.master.prepare('SELECT count(*) n FROM worker_private_sessions').get().n,1);
}));

test('signature tampering, unknown signing key, wrong issuer/nonce/audience are rejected',run(async f=>{
 const badKey=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey;
 for(const construct of [n=>jwt(n,{},badKey), n=>jwt(n,{iss:'https://evil.example.test'}),
  n=>jwt('another-signed-nonce'),n=>jwt(n,{aud:'wrong-client'}),
  n=>jwt(n,{exp:Math.floor(CURRENT/1000)-10}),
  n=>jwt(n,{auth_time:Math.floor(CURRENT/1000)-1000}),
  n=>{const signed=jwt(n);return signed.slice(0,-1)+(signed.endsWith('a')?'b':'a');}]){
  const challenge=await f.authority.beginChallenge();
  await assert.rejects(f.authority.issue({challengeId:challenge.challengeId,
    idToken:construct(challenge.nonce)}),{code:'OIDC_TOKEN_UNVERIFIED'});
 }
 assert.equal(f.master.prepare('SELECT count(*) n FROM worker_private_sessions').get().n,0);
}));

test('unprovisioned and revoked subject-to-actor membership cannot issue',run(async f=>{
 const challenge=await f.authority.beginChallenge();
 f.master.exec('UPDATE worker_private_oidc_bindings SET active=0');
 await assert.rejects(f.authority.issue({challengeId:challenge.challengeId,
  idToken:jwt(challenge.nonce)}),{code:'PREPROVISIONED_ACCOUNT_REQUIRED'});
 f.master.exec('DELETE FROM worker_private_oidc_bindings');
 await assert.rejects(f.authority.issue({challengeId:challenge.challengeId,
  idToken:jwt(challenge.nonce)}),{code:'PREPROVISIONED_ACCOUNT_REQUIRED'});
 assert.equal(f.master.prepare('SELECT count(*) n FROM worker_private_sessions').get().n,0);
}));

test('JWT actor/merchant claims never override trusted private binding',run(async f=>{
 const c=await f.authority.beginChallenge();
 const session=await f.authority.issue({challengeId:c.challengeId,
  idToken:jwt(c.nonce,{actor_id:'forged',merchant_id:'forged',role:'admin'})});
 const p=await f.resolver(f.request(f.validCookie(session.setCookie)));
 assert.equal(p.actorId,'owner');assert.equal(p.merchantId,'merchant');
}));

test('racing callbacks can consume one challenge only (DB unique/CAS)',run(async f=>{
 const c=await f.authority.beginChallenge();const signed=jwt(c.nonce);
 const results=await Promise.allSettled([f.authority.issue({challengeId:c.challengeId,idToken:signed}),
  f.authority.issue({challengeId:c.challengeId,idToken:signed})]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(results.filter(x=>x.status==='rejected').length,1);
 assert.equal(f.master.prepare('SELECT count(*) n FROM worker_private_sessions').get().n,1);
}));

test('private same-origin POST revokes session, persists across new resolver/worker',run(async f=>{
 const issue=await f.establish(),cookie=f.validCookie(issue.setCookie);
 for(const req of [f.request(cookie),f.request(cookie,'POST',{origin:'https://evil.example.test'}),
  f.request(cookie,'POST',{origin:ORIGIN,'sec-fetch-site':'cross-site'})]){
   await assert.rejects(f.authority.revoke({request:req}),{code:'SESSION_REVOKE_NOT_AUTHORIZED'});
 }
 assert.equal((await f.reader.fetch(f.request(cookie))).status,200);
 const revoked=await f.authority.revoke({request:f.request(cookie,'POST',{origin:ORIGIN})});
 assert.equal(revoked.revoked,true);
 assert.match(revoked.clearCookie,/Max-Age=0/);
 const restarted=createWorkerPrivateSessionResolver({db:f.db,now:()=>CURRENT});
 await assert.rejects(restarted(f.request(cookie)),{code:'UNAUTHENTICATED'});
 assert.equal((await f.reader.fetch(f.request(cookie))).status,401);
 await assert.rejects(f.authority.revoke({request:f.request(cookie,'POST',{origin:ORIGIN})}),
   {code:'SESSION_REVOKE_NOT_AUTHORIZED'});
}));

test('ambiguous D1 insert burns challenge; never creates duplicate session on retry',run(async f=>{
 f.failSessionInsert(true);const c=await f.authority.beginChallenge(),signed=jwt(c.nonce);
 await assert.rejects(f.authority.issue({challengeId:c.challengeId,idToken:signed}),
  {code:'LOGIN_SESSION_NOT_ESTABLISHED'});
 f.failSessionInsert(false);
 await assert.rejects(f.authority.issue({challengeId:c.challengeId,idToken:signed}),
  {code:'LOGIN_CHALLENGE_INVALID'});
 assert.equal(f.master.prepare('SELECT count(*) n FROM worker_private_sessions').get().n,0);
}));

test('temporary database outage prevents challenge issuance and session creation',run(async f=>{
 f.setUnavailable(true);
 await assert.rejects(f.authority.beginChallenge(),{code:'D1_UNAVAILABLE'});
 await assert.rejects(f.authority.issue({challengeId:'A'.repeat(43),idToken:'dummy'}),
  {code:'D1_UNAVAILABLE'});
 assert.equal(f.master.prepare('SELECT count(*) n FROM worker_private_sessions').get().n,0);
}));

test('invalid trust configuration cannot initialize private authority',()=>{
 for(const overrides of [
  {issuer:'http://evil.example.test'}, {audience:' '},{subjectPepper:new Uint8Array(4)},
  {jwks:{keys:[]}},{allowedOrigin:'http://proofline.example.test'}]){
  assert.throws(()=>createWorkerPrivateOidcAuthority({db:{withSession(){}},
   issuer:ISSUER,audience:AUD,jwks,subjectPepper:PEPPER,allowedOrigin:ORIGIN,
   ...overrides}),{code:/OIDC_/});
 }
});

test('pinned JWK snapshot is unaffected by caller mutation after construction',run(async f=>{
 const mutable=structuredClone(jwks);
 const pinned=createWorkerPrivateOidcAuthority({db:f.db,issuer:ISSUER,audience:AUD,
  jwks:mutable,subjectPepper:PEPPER,allowedOrigin:ORIGIN,now:()=>CURRENT});
 mutable.keys[0].n='changed_by_caller_after_config';
 const c=await pinned.beginChallenge();
 assert.ok((await pinned.issue({challengeId:c.challengeId,idToken:jwt(c.nonce)})).setCookie);
}));

test('D1 migration preserves preexisting hashed private sessions without publishing them',()=>{
 const dir=mkdtempSync(join(tmpdir(),'proofline-worker-migrate-'));
 const db=new DatabaseSync(join(dir,'offline-migration.sqlite'));
 try{
  db.exec(schema[0]);db.exec(schema[1]);
  db.prepare(`INSERT INTO worker_private_sessions
   (token_sha256,actor_id,merchant_id,role,issuer,issuer_verified_at_ms,expires_at_ms)
   VALUES(?,?,?,?,?,?,?)`).run('b'.repeat(64),'owner','merchant','OWNER',ISSUER,CURRENT-5000,CURRENT+1000);
  const prior=db.prepare('SELECT * FROM worker_private_sessions').get();
  db.exec(schema[2]);
  const after=db.prepare('SELECT * FROM worker_private_sessions').get();
  assert.equal(after.token_sha256,prior.token_sha256);
  assert.equal(after.actor_id,prior.actor_id);
  assert.equal(after.assertion_sha256,null);
  assert.equal(db.prepare('SELECT count(*) n FROM worker_private_oidc_bindings').get().n,0);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
