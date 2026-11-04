// Durable, offline trusted RS256 JWKS activation gate for a private OIDC host.
// Not a provider discovery client, not a JWKS downloader, not a public API.
// Real issuer key provenance, operator authority, TLS and user/merchant binding
// MUST be separately verified by the host before any production login.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {createPinnedOidcIdTokenVerifier} from './pinned_oidc_id_token_verifier.mjs';

const reject=code=>{const e=new Error(code);e.code=code;throw e;};
const MAX_TRUST_MS=7*24*60*60*1000;
const PRIVATE_JWK_FIELDS=new Set(['d','p','q','dp','dq','qi','oth','k']);
const configDigest=(issuer,audience)=>createHash('sha256')
 .update('proofline:oidc-jwks-trust:v1\0'+issuer+'\0'+audience).digest('hex');
function pinnedIssuer(issuer){
 let u;
 try{u=new URL(issuer)}catch{reject('OIDC_JWKS_PINNED_ISSUER_REQUIRED')}
 if(typeof issuer!=='string'||issuer.length>256||
  u.href.replace(/\/$/,'')!==issuer||u.protocol!=='https:'||
  u.username||u.password||u.search||u.hash||u.port||
  !u.hostname.includes('.')||u.hostname==='localhost'||
  u.hostname.endsWith('.localhost')||u.hostname.endsWith('.local')||
  u.hostname.endsWith('.internal')||/^(?:\d+\.){3}\d+$/.test(u.hostname))
  reject('OIDC_JWKS_PINNED_ISSUER_REQUIRED');
 return issuer;
}
function safeSet({jwks,issuer,audience,now}){
 if(!jwks||!Array.isArray(jwks.keys)||jwks.keys.length<1||
  jwks.keys.length>8||Object.keys(jwks).some(k=>k!=='keys'))
  reject('OIDC_JWKS_PUBLIC_KEYSET_REQUIRED');
 for(const key of jwks.keys){
  if(!key||typeof key!=='object'||Array.isArray(key)||
     Object.keys(key).some(k=>PRIVATE_JWK_FIELDS.has(k)))
   reject('OIDC_JWKS_PUBLIC_KEYSET_REQUIRED');
 }
 let json;
 try{
  json=JSON.stringify(jwks);
  if(json.length>16384)reject('OIDC_JWKS_PUBLIC_KEYSET_REQUIRED');
  // Reuse the existing strict RS256 verifier for public key format and
  // duplicate kid checks; no trust is conferred by a token-provided URL.
  createPinnedOidcIdTokenVerifier({
   issuer,audience,jwks:JSON.parse(json),now
  });
 }catch{reject('OIDC_JWKS_PUBLIC_KEYSET_REQUIRED')}
 return json;
}
export function createManagedOidcJwksVerifier({
 filename,issuer,audience,authorizeTrustUpdate,now=Date.now
}={}){
 if(typeof filename!=='string'||!filename.trim()||
  filename===':memory:'||filename.startsWith('file:')||
  filename.includes('?')||typeof now!=='function'||
  typeof audience!=='string'||!/^[A-Za-z0-9._:-]{3,128}$/.test(audience)||
  (authorizeTrustUpdate!==undefined&&typeof authorizeTrustUpdate!=='function'))
  reject('OIDC_JWKS_PRIVATE_CONFIGURATION_REQUIRED');
 const trustedIssuer=pinnedIssuer(issuer),digest=configDigest(trustedIssuer,audience);
 const db=new DatabaseSync(filename);
 let closed=false;
 try{
  db.exec('PRAGMA busy_timeout=5000;PRAGMA journal_mode=WAL');
  db.exec('CREATE TABLE IF NOT EXISTS oidc_jwks_config (name TEXT PRIMARY KEY, digest TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS oidc_jwks_state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, active_json TEXT, active_expires_ms INTEGER, staged_json TEXT, staged_expires_ms INTEGER, staged_base_revision INTEGER)');
  db.prepare('INSERT OR IGNORE INTO oidc_jwks_config(name,digest) VALUES(?,?)')
   .run('issuer_audience_v1',digest);
  if(db.prepare('SELECT digest FROM oidc_jwks_config WHERE name=?')
   .get('issuer_audience_v1')?.digest!==digest)
   reject('OIDC_JWKS_CONFIGURATION_MISMATCH');
  db.exec('INSERT OR IGNORE INTO oidc_jwks_state(id,revision) VALUES(1,0)');
 }catch(e){db.close();throw e}
 const active=()=>{if(closed)reject('OIDC_JWKS_STORE_CLOSED')};
 const timestamp=()=>{
  const t=now();
  if(!Number.isSafeInteger(t)||t<0)reject('OIDC_JWKS_CLOCK_INVALID');
  return t;
 };
 const current=()=>{
  active();
  const row=db.prepare('SELECT * FROM oidc_jwks_state WHERE id=1').get();
  if(!row||!Number.isSafeInteger(row.revision)||row.revision<0)
   reject('OIDC_JWKS_STORE_CORRUPTED');
  return row;
 };
 const transaction=fn=>{
  active();db.exec('BEGIN IMMEDIATE');
  try{const x=fn();db.exec('COMMIT');return x}
  catch(e){db.exec('ROLLBACK');throw e}
 };
 const operator=async()=>{
  active();
  if(typeof authorizeTrustUpdate!=='function')
   reject('OIDC_JWKS_OPERATOR_NOT_AUTHORIZED');
  let permitted=false;
  try{permitted=(await authorizeTrustUpdate())===true}catch{}
  if(!permitted)reject('OIDC_JWKS_OPERATOR_NOT_AUTHORIZED');
 };
 function expiry(expires){
  const t=timestamp();
  if(!Number.isSafeInteger(expires)||expires-t<60_000||
     expires-t>MAX_TRUST_MS)
   reject('OIDC_JWKS_TRUST_EXPIRY_INVALID');
  return expires;
 }
 const revisionCheck=(actual,wanted)=>{
  if(!Number.isSafeInteger(wanted)||wanted<0||actual!==wanted)
   reject('OIDC_JWKS_STALE_REVISION');
 };
 async function stage({jwks,expectedRevision,validUntilMs}={}){
  await operator();
  const contents=safeSet({jwks,issuer:trustedIssuer,audience,now});
  expiry(validUntilMs);
  return transaction(()=>{
   const row=current();
   revisionCheck(row.revision,expectedRevision);
   expiry(validUntilMs);
   db.prepare('UPDATE oidc_jwks_state SET staged_json=?,staged_expires_ms=?,staged_base_revision=? WHERE id=1')
    .run(contents,validUntilMs,row.revision);
   return Object.freeze({staged:true,activeRevision:row.revision,
    activated:false,paymentAuthorized:false});
  });
 }
 async function activateStaged({expectedRevision}={}){
  await operator();
  return transaction(()=>{
   const row=current();
   revisionCheck(row.revision,expectedRevision);
   if(row.staged_json===null||
      row.staged_base_revision!==row.revision||
      !Number.isSafeInteger(row.staged_expires_ms)||
      row.staged_expires_ms<=timestamp())
    reject('OIDC_JWKS_STAGE_UNAVAILABLE');
   // Re-check key material before moving it into the active trust slot.
   safeSet({jwks:JSON.parse(row.staged_json),issuer:trustedIssuer,audience,now});
   db.prepare('UPDATE oidc_jwks_state SET revision=?,active_json=?,active_expires_ms=?,staged_json=NULL,staged_expires_ms=NULL,staged_base_revision=NULL WHERE id=1')
    .run(row.revision+1,row.staged_json,row.staged_expires_ms);
   return Object.freeze({activated:true,revision:row.revision+1,
    paymentAuthorized:false});
  });
 }
 async function revokeActive({expectedRevision}={}){
  await operator();
  return transaction(()=>{
   const row=current();
   revisionCheck(row.revision,expectedRevision);
   if(row.active_json===null)reject('OIDC_JWKS_NOT_ACTIVE');
   db.prepare('UPDATE oidc_jwks_state SET revision=?,active_json=NULL,active_expires_ms=NULL,staged_json=NULL,staged_expires_ms=NULL,staged_base_revision=NULL WHERE id=1')
    .run(row.revision+1);
   return Object.freeze({revoked:true,revision:row.revision+1,
    paymentAuthorized:false});
  });
 }
 async function verifyExternalIdentity(assertion){
  try{
   const row=current();
   if(row.active_json===null||!Number.isSafeInteger(row.active_expires_ms)||
      row.active_expires_ms<=timestamp())
    reject('OIDC_JWKS_TRUST_EXPIRED');
   const verifier=createPinnedOidcIdTokenVerifier({
    issuer:trustedIssuer,audience,jwks:JSON.parse(row.active_json),now
   });
   return await verifier.verifyExternalIdentity(assertion);
  }catch{reject('OIDC_ID_TOKEN_UNVERIFIED')}
 }
 function status(){
  const row=current(),t=timestamp();
  return Object.freeze({revision:row.revision,
   active:row.active_json!==null&&row.active_expires_ms>t,
   staged:row.staged_json!==null&&row.staged_expires_ms>t,
   activeExpiresAtMs:row.active_expires_ms??null,
   stagedExpiresAtMs:row.staged_expires_ms??null,
   autoRefreshEnabled:false,networkCalls:0,paymentAuthorized:false});
 }
 function close(){if(!closed){closed=true;db.close()}}
 return Object.freeze({
  stage,activateStaged,revokeActive,verifyExternalIdentity,status,close,
  mode:'OPERATOR_APPROVED_DURABLE_OFFLINE_JWKS_TRUST',
  providerNetworkEnabled:false,autoRefreshEnabled:false,
  publicKeyDiscoveryEnabled:false,registrationEnabled:false,
  merchantOwnershipVerified:false,paymentAuthorized:false
 });
}
