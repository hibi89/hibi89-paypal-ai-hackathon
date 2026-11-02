// INTERNAL-ONLY, OFFLINE Worker+D1 candidate. No exported Worker handler,
// network fetch, public login, automatic account enrollment or money calls.
// The private coordinator must supply pinned public JWKs and preprovision
// issuer+HMAC(subject) bindings; it must own the OIDC code/PKCE exchange.
import {createWorkerPrivateSessionResolver,hashPrivateSessionCookie} from './worker_private_session_resolver.mjs';

export class WorkerOidcError extends Error {
  constructor(code){super(code);this.name='WorkerOidcError';this.code=code;}
}
const fail=code=>{throw new WorkerOidcError(code);};
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const kidPattern=/^[A-Za-z0-9._:-]{1,128}$/;
const encode=new TextEncoder();
const hex=buffer=>Array.from(new Uint8Array(buffer),x=>x.toString(16).padStart(2,'0')).join('');
const hash=async value=>hex(await crypto.subtle.digest('SHA-256',encode.encode(value)));
function randomToken(){const b=crypto.getRandomValues(new Uint8Array(32));
 return btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function decode(value,maxLength){
 if(typeof value!=='string'||value.length>maxLength||!/^[A-Za-z0-9_-]+$/.test(value))
   fail('OIDC_TOKEN_UNVERIFIED');
 let bytes;
 try{bytes=Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
 catch{fail('OIDC_TOKEN_UNVERIFIED');}
 const canonical=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 if(canonical!==value)fail('OIDC_TOKEN_UNVERIFIED');
 return bytes;
}
function jsonPart(value){
 try{const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decode(value,6000)));
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))fail('OIDC_TOKEN_UNVERIFIED');
  return parsed;
 }catch{fail('OIDC_TOKEN_UNVERIFIED');}
}
function pinnedConfig({issuer,audience,jwks}){
 let u;
 try{u=new URL(issuer);}catch{fail('OIDC_TRUST_CONFIG_REQUIRED');}
 if(typeof issuer!=='string'||u.protocol!=='https:'||u.origin!==issuer||u.username||u.password||
    !ID.test(audience??'')||!Array.isArray(jwks?.keys)||jwks.keys.length<1||jwks.keys.length>8)
   fail('OIDC_TRUST_CONFIG_REQUIRED');
 const keys=new Map();
 for(const k of jwks.keys){
  if(k?.kty!=='RSA'||!kidPattern.test(k.kid??'')||k.use&&k.use!=='sig'||
    k.alg&&k.alg!=='RS256'||k.key_ops&&JSON.stringify(k.key_ops)!=='["verify"]'||
    typeof k.n!=='string'||typeof k.e!=='string'||keys.has(k.kid)||
    decode(k.n,2000).length<256)fail('OIDC_TRUST_CONFIG_REQUIRED');
  // Snapshot pinned trust material: an external caller must not be able to
  // swap JWKS key bytes after construction but before the first verification.
  keys.set(k.kid,{kty:'RSA',n:k.n,e:k.e,kid:k.kid,alg:'RS256',use:'sig'});
 }
 return keys;
}
function timestamp(now){const t=now();if(!Number.isSafeInteger(t)||t<=0)fail('INVALID_CLOCK');return t;}
function primary(db){try{const session=db.withSession('first-primary');if(!session?.prepare)throw Error();
 return session;}catch{fail('D1_UNAVAILABLE');}}
const validRow=r=>r?.active===1&&r.role==='OWNER'&&ID.test(r.actor_id??'')&&ID.test(r.merchant_id??'')&&Number.isSafeInteger(r.revision)&&r.revision>0;
function changes(result){return Number(result?.meta?.changes??0);}

export function createWorkerPrivateOidcAuthority({
 db,issuer,audience,jwks,subjectPepper,allowedOrigin,now=Date.now,
 ttlMs=15*60*1000
}={}){
 if(!db||typeof db.withSession!=='function'||typeof now!=='function'||
   !Number.isSafeInteger(ttlMs)||ttlMs<60_000||ttlMs>30*60*1000||
   !(subjectPepper instanceof Uint8Array)||subjectPepper.byteLength!==32)
   fail('OIDC_PRIVATE_DEPENDENCIES_REQUIRED');
 const keys=pinnedConfig({issuer,audience,jwks});
 let url;
 try{url=new URL(allowedOrigin);}catch{fail('OIDC_PRIVATE_ORIGIN_REQUIRED');}
 if(typeof allowedOrigin!=='string'||url.origin!==allowedOrigin||url.protocol!=='https:')
   fail('OIDC_PRIVATE_ORIGIN_REQUIRED');
 // CryptoKey is not exported; no caller can set an actor or merchant claim.
 const imported=new Map();
 const signingKey=async kid=>{
   if(!keys.has(kid))fail('OIDC_TOKEN_UNVERIFIED');
   if(!imported.has(kid))imported.set(kid,crypto.subtle.importKey('jwk',
     {...keys.get(kid),key_ops:['verify'],ext:true},
     {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']));
   try{return await imported.get(kid);}catch{fail('OIDC_TOKEN_UNVERIFIED');}
 };
 const pepper=Uint8Array.from(subjectPepper);
 const hmacKey=crypto.subtle.importKey('raw',pepper,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const fingerprint=async subject=>hex(await crypto.subtle.sign('HMAC',await hmacKey,
    encode.encode('proofline:worker-oidc:v1\0'+issuer+'\0'+subject)));
 async function verify(idToken,nonce){
   try{
     if(typeof idToken!=='string'||idToken.length>8192||!TOKEN.test(nonce))fail('OIDC_TOKEN_UNVERIFIED');
     const parts=idToken.split('.');if(parts.length!==3)fail('OIDC_TOKEN_UNVERIFIED');
     const [head,payload,sig]=parts;
     const header=jsonPart(head), claims=jsonPart(payload);
     if(header.alg!=='RS256'||!kidPattern.test(header.kid??'')||
        (header.typ!==undefined&&header.typ!=='JWT')||
        Object.keys(header).some(x=>!['alg','kid','typ'].includes(x)))fail('OIDC_TOKEN_UNVERIFIED');
     const verified=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',await signingKey(header.kid),
       decode(sig,1000),encode.encode(head+'.'+payload));
     if(!verified)fail('OIDC_TOKEN_UNVERIFIED');
     const t=timestamp(now);
     const aud=claims.aud===audience ||
       (Array.isArray(claims.aud)&&claims.aud.length<=8&&claims.aud.includes(audience)&&
        claims.azp===audience);
     const secs=x=>Number.isSafeInteger(x)&&x>0;
     if(claims.iss!==issuer||!aud||typeof claims.sub!=='string'||
       claims.sub.length<1||claims.sub.length>256||claims.nonce!==nonce||
       !secs(claims.iat)||!secs(claims.auth_time)||!secs(claims.exp)||
       claims.exp<=claims.iat||claims.exp*1000<=t||claims.iat*1000>t+30_000||
       claims.auth_time*1000>claims.iat*1000+30_000||
       t-claims.auth_time*1000>5*60*1000||t-claims.iat*1000>5*60*1000)
       fail('OIDC_TOKEN_UNVERIFIED');
     return {subject:claims.sub,assertionHash:await hash(idToken)};
   }catch{fail('OIDC_TOKEN_UNVERIFIED');}
 }
 const sessionResolver=createWorkerPrivateSessionResolver({db,now});
 // Only a private OIDC coordinator may call this; no public Request/Response
 // dispatch exists. The challenge must be created before IdP authorization.
 async function beginChallenge(){
   const t=timestamp(now),challengeId=randomToken(),nonce=randomToken();
   try{await primary(db).prepare(`INSERT INTO worker_private_login_challenges
     (challenge_sha256,nonce,created_at_ms,expires_at_ms)
     VALUES(?,?,?,?)`).bind(await hash(challengeId),nonce,t,t+5*60*1000).run();}
   catch{fail('D1_UNAVAILABLE');}
   return Object.freeze({challengeId,nonce,expiresAtMs:t+5*60*1000});
 }
 async function issue({idToken,challengeId}={}){
   if(!TOKEN.test(challengeId??''))fail('LOGIN_CHALLENGE_INVALID');
   const t=timestamp(now),session=primary(db),challengeHash=await hash(challengeId);
   let challenge;
   try{challenge=await session.prepare(`SELECT nonce,expires_at_ms,consumed_at_ms
     FROM worker_private_login_challenges WHERE challenge_sha256=?`)
       .bind(challengeHash).first();}
   catch{fail('D1_UNAVAILABLE');}
   if(!challenge||challenge.consumed_at_ms!==null||challenge.expires_at_ms<=t)
     fail('LOGIN_CHALLENGE_INVALID');
   const evidence=await verify(idToken,challenge.nonce);
   const bindingHash=await fingerprint(evidence.subject);
   let bound;
   try{bound=await session.prepare(`SELECT actor_id,merchant_id,role,active,revision
     FROM worker_private_oidc_bindings WHERE issuer=? AND subject_hmac=?`)
     .bind(issuer,bindingHash).first();}
   catch{fail('D1_UNAVAILABLE');}
   if(!validRow(bound))fail('PREPROVISIONED_ACCOUNT_REQUIRED');
   // Atomic update is the CAS gate; second use of the same challenge will
   // fail closed. If inserting a session later fails, login must be retried
   // with a new signed challenge; NEVER revive an ambiguous session.
   let consumed;
   try{consumed=await session.prepare(`UPDATE worker_private_login_challenges
     SET consumed_at_ms=? WHERE challenge_sha256=? AND consumed_at_ms IS NULL
     AND expires_at_ms>?`).bind(t,challengeHash,t).run();}
   catch{fail('D1_UNAVAILABLE');}
   if(changes(consumed)!==1)fail('LOGIN_CHALLENGE_CONSUMED');
   const token=randomToken(),digest=await hash(token),assertion=evidence.assertionHash;
   try{
     // Membership can be revoked/reassigned after the earlier lookup.
     // Recheck current binding and revision atomically in the INSERT statement:
     // zero rows inserted means no new cookie may ever be returned.
     const result=await session.prepare(`INSERT INTO worker_private_sessions
       (token_sha256,actor_id,merchant_id,role,issuer,issuer_verified_at_ms,
        expires_at_ms,assertion_sha256,binding_subject_hmac,binding_revision)
       SELECT ?,b.actor_id,b.merchant_id,'OWNER',b.issuer,?,?,?,
              b.subject_hmac,b.revision
       FROM worker_private_oidc_bindings b
       WHERE b.issuer=? AND b.subject_hmac=? AND b.active=1 AND b.role='OWNER'
         AND b.actor_id=? AND b.merchant_id=? AND b.revision=?`)
       .bind(digest,t,t+ttlMs,assertion,issuer,bindingHash,
         bound.actor_id,bound.merchant_id,bound.revision).run();
     if(changes(result)!==1)fail('D1_UNAVAILABLE');
   }catch{fail('LOGIN_SESSION_NOT_ESTABLISHED');}
   return Object.freeze({setCookie:'__Host-proofline_session='+token+
     '; Secure; HttpOnly; Path=/; SameSite=Strict; Max-Age='+Math.floor(ttlMs/1000),
     expiresAtMs:t+ttlMs,paymentAuthorized:false});
 }
 async function revoke({request}={}){
   if(!(request instanceof Request)||request.method!=='POST'||
      new URL(request.url).origin!==allowedOrigin||
      request.headers.get('origin')!==allowedOrigin||
      !['same-origin','none'].includes(request.headers.get('sec-fetch-site')))
     fail('SESSION_REVOKE_NOT_AUTHORIZED');
   try{await sessionResolver(request);}catch{fail('SESSION_REVOKE_NOT_AUTHORIZED');}
   const digest=await hashPrivateSessionCookie(request);
   let changed;
   try{changed=await primary(db).prepare(`UPDATE worker_private_sessions
     SET revoked_at_ms=? WHERE token_sha256=? AND revoked_at_ms IS NULL`)
       .bind(timestamp(now),digest).run();}
   catch{fail('D1_UNAVAILABLE');}
   if(changes(changed)!==1)fail('SESSION_REVOKE_NOT_AUTHORIZED');
   return Object.freeze({clearCookie:'__Host-proofline_session=; Secure; HttpOnly; Path=/; SameSite=Strict; Max-Age=0',
     revoked:true,paymentAuthorized:false});
 }
 return Object.freeze({beginChallenge,issue,revoke,
   mode:'PRIVATE_OFFLINE_PINNED_IDP_D1_NO_PUBLIC_HTTP',
   providerCallsAllowed:false,hostDeploymentAuthorized:false});
}
