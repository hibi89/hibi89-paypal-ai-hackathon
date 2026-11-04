// Private, durable binding between a verified external OIDC subject and an
// already-provisioned marketplace actor. Not an identity provider or public API.
// No self-signup, provider HTTP, PayPal calls, or actor/tenant claims from users.
import {DatabaseSync} from 'node:sqlite';
import {createHmac,timingSafeEqual} from 'node:crypto';

const ID=/^[A-Za-z0-9_-]{1,64}$/;
const ROLES=new Set(['buyer','seller','reviewer']);
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const VERIFIER_MESSAGE='proofline:oidc-binding-key-check:v1';
const hmac=(key,value)=>createHmac('sha256',key).update(value,'utf8').digest('hex');
function issuerUrl(issuer){
 let url;
 try{url=new URL(issuer)}catch{fail('OIDC_BINDING_ISSUER_INVALID')}
 if(typeof issuer!=='string'||issuer.length>256||
    url.href.replace(/\/$/,'')!==issuer||url.protocol!=='https:'||
    url.username||url.password||url.search||url.hash||
    url.port||!url.hostname.includes('.')||
    url.hostname==='localhost'||url.hostname.endsWith('.localhost')||
    url.hostname.endsWith('.local')||url.hostname.endsWith('.internal')||
    /^(?:\d+\.){3}\d+$/.test(url.hostname))
  fail('OIDC_BINDING_ISSUER_INVALID');
 return issuer;
}
function subjectValue(subject){
 // OIDC sub is an opaque, case-sensitive value; never normalize or use it as
 // the marketplace actor ID. Keep controls/whitespace out of the DB boundary.
 if(typeof subject!=='string'||subject.length<1||subject.length>256||
    !/^[\x21-\x7e]+$/.test(subject))
  fail('OIDC_BINDING_SUBJECT_INVALID');
 return subject;
}
const memberMatches=(member,actorId,merchantId)=>
 member?.actorId===actorId&&member?.merchantId===merchantId&&
 member?.active===true&&ROLES.has(member.role)&&
 Number.isSafeInteger(member.revision)&&member.revision>0&&
 (member.role!=='seller'||ID.test(member.sellerProfileId??''));

export function createPreprovisionedOidcAccountBindings({
 filename,issuer,subjectPepper,getMembership,
 authorizeOperatorProvisioning,now=Date.now
}={}){
 if(typeof filename!=='string'||!filename.trim()||filename===':memory:'||
    filename.startsWith('file:')||filename.includes('?')||
    !Buffer.isBuffer(subjectPepper)||subjectPepper.length!==32||
    typeof getMembership!=='function'||typeof now!=='function'||
    (authorizeOperatorProvisioning!==undefined&&
     typeof authorizeOperatorProvisioning!=='function'))
  fail('OIDC_BINDING_PRIVATE_CONFIGURATION_REQUIRED');
 const trustedIssuer=issuerUrl(issuer);
 const key=Buffer.from(subjectPepper); // private copy, never saved in SQLite
 const db=new DatabaseSync(filename);
 let closed=false;
 try{
  db.exec('PRAGMA busy_timeout=5000;PRAGMA journal_mode=WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS oidc_binding_metadata(
   item TEXT PRIMARY KEY, digest TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS oidc_account_bindings(
   subject_hmac TEXT PRIMARY KEY,
   actor_id TEXT NOT NULL UNIQUE,
   merchant_id TEXT NOT NULL,
   issuer TEXT NOT NULL,
   created_at_ms INTEGER NOT NULL,
   revoked_at_ms INTEGER
  )`);
  // Detect accidental loss/change of the HMAC pepper instead of silently
  // creating a different identity namespace after a process restart.
  const expected=hmac(key,VERIFIER_MESSAGE);
  db.prepare('INSERT OR IGNORE INTO oidc_binding_metadata(item,digest) VALUES(?,?)')
   .run('key_check_v1',expected);
  const stored=db.prepare('SELECT digest FROM oidc_binding_metadata WHERE item=?')
   .get('key_check_v1')?.digest;
  if(typeof stored!=='string'||!/^[a-f0-9]{64}$/.test(stored)||
     !timingSafeEqual(Buffer.from(stored,'hex'),Buffer.from(expected,'hex')))
   fail('OIDC_BINDING_PEPPER_MISMATCH');
 }catch(e){db.close();key.fill(0);throw e}
 const active=()=>{if(closed)fail('OIDC_BINDING_STORE_CLOSED')};
 const digest=subject=>hmac(key,'v1\0'+trustedIssuer+'\0'+subjectValue(subject));
 const timestamp=()=>{
  const value=now();
  if(!Number.isSafeInteger(value)||value<0)
   fail('OIDC_BINDING_CLOCK_INVALID');
  return value;
 };
 async function authorized(){
  active();
  // Only a private operator process may supply this callback. Never source
  // its result from a request body, browser header, or verified user session.
  if(typeof authorizeOperatorProvisioning!=='function')
   fail('OIDC_BINDING_OPERATOR_NOT_AUTHORIZED');
  let approved=false;
  try{approved=(await authorizeOperatorProvisioning())===true}catch{}
  if(!approved)fail('OIDC_BINDING_OPERATOR_NOT_AUTHORIZED');
 }
 async function bindingMember(actorId,merchantId){
  let member;
  try{member=await getMembership(actorId)}catch{return false}
  return memberMatches(member,actorId,merchantId);
 }
 // Trusted offline operator only. Immutable once inserted; even a revoked
 // subject/actor cannot be silently reattached to a different principal.
 async function provision({subject,actorId,merchantId}={}){
  await authorized();
  active();
  const hashed=digest(subject);
  if(!ID.test(actorId??'')||!ID.test(merchantId??''))
   fail('OIDC_BINDING_MEMBER_INVALID');
  if(!await bindingMember(actorId,merchantId))
   fail('OIDC_BINDING_MEMBER_UNVERIFIED');
  try{
   db.prepare(`INSERT INTO oidc_account_bindings
    (subject_hmac,actor_id,merchant_id,issuer,created_at_ms)
    VALUES(?,?,?,?,?)`).run(hashed,actorId,merchantId,trustedIssuer,timestamp());
  }catch(e){
   if(String(e?.message).includes('UNIQUE'))
    fail('OIDC_BINDING_ALREADY_REGISTERED');
   throw e;
  }
  return Object.freeze({provisioned:true,paymentAuthorized:false});
 }
 async function lookupExternalAccount({issuer:source,subject}={}){
  active();
  if(source!==trustedIssuer)return null;
  let hashed;
  try{hashed=digest(subject)}catch{return null}
  const row=db.prepare(`SELECT actor_id,merchant_id FROM oidc_account_bindings
   WHERE subject_hmac=? AND issuer=? AND revoked_at_ms IS NULL`)
   .get(hashed,trustedIssuer);
  if(!row||!await bindingMember(row.actor_id,row.merchant_id))return null;
  return Object.freeze({actorId:row.actor_id,merchantId:row.merchant_id});
 }
 // Session-time revocation lookup: a previously verified, immutable
 // subject->actor binding must still be active at EVERY request. A revoked
 // subject may not retain its older HttpOnly cookie until its normal TTL.
 // Return no subject, hashed ID or operator data to callers.
 function isAccountActive({actorId,merchantId}={}){
  active();
  if(!ID.test(actorId??'')||!ID.test(merchantId??''))return false;
  return db.prepare(`SELECT 1 FROM oidc_account_bindings
   WHERE actor_id=? AND merchant_id=? AND issuer=? AND revoked_at_ms IS NULL`)
   .get(actorId,merchantId,trustedIssuer)!==undefined;
 }
 async function revoke({subject}={}){
  await authorized();
  active();
  const hashed=digest(subject);
  const changed=db.prepare(`UPDATE oidc_account_bindings SET revoked_at_ms=?
   WHERE subject_hmac=? AND issuer=? AND revoked_at_ms IS NULL`)
   .run(timestamp(),hashed,trustedIssuer).changes;
  if(changed!==1)fail('OIDC_BINDING_NOT_ACTIVE');
  return Object.freeze({revoked:true,paymentAuthorized:false});
 }
 function close(){
  if(!closed){closed=true;db.close();key.fill(0)}
 }
 return Object.freeze({
  provision,lookupExternalAccount,isAccountActive,revoke,close,
  mode:'PRIVATE_PREPROVISIONED_OIDC_SUBJECT_BINDINGS',
  publicRegistrationEnabled:false,
  externalIdentityVerifiedByCallerOnly:true,
  merchantOwnershipVerified:false,
  paymentAuthorized:false,providerNetworkCalls:0
 });
}
