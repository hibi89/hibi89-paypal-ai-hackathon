// Backend-owned session persistence AFTER independent external IdP verification.
// This is NOT an IdP, login route, public listener, PayPal authorization,
// automatic user registration, or real merchant/seller verification.
// Only a trusted server may call establish(), after verifyExternalIdentity()
// validates an external issuer signature/audience/nonce and lookupExternalAccount()
// maps the verified subject to a preprovisioned application account.
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';

const COOKIE='__Host-proofline_session';
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const ID=/^[A-Za-z0-9_-]{1,64}$/;
const PROOF=/^[A-Za-z0-9._:-]{16,128}$/;
const ROLES=new Set(['buyer','seller','reviewer','merchant_operator']);
const sha=value=>createHash('sha256').update(value,'utf8').digest('hex');
const reject=code=>{const e=new Error(code);e.code=code;throw e;};
function configuredOrigin(raw){
 let value;
 try{value=new URL(raw)}catch{reject('HOST_SESSION_HTTPS_ORIGIN_REQUIRED')}
 if(value.origin!==raw||value.protocol!=='https:'||
    value.username||value.password||value.search||value.hash||value.port||
    !value.hostname.includes('.')||value.hostname==='localhost'||
    value.hostname.endsWith('.localhost')||
    /^(?:\d+\.){3}\d+$/.test(value.hostname))
  reject('HOST_SESSION_HTTPS_ORIGIN_REQUIRED');
 return value.origin;
}
function cookie(request,origin){
 if(!(request instanceof Request))return null;
 let url;
 try{url=new URL(request.url)}catch{return null}
 if(url.origin!==origin)return null;
 const raw=request.headers.get('cookie')??'';
 if(raw.length>8192)return null;
 const matches=raw.split(';').map(x=>x.trim())
  .filter(x=>x.startsWith(COOKIE+'='));
 if(matches.length!==1)return null;
 const token=matches[0].slice(COOKIE.length+1);
 return TOKEN.test(token)?token:null;
}
function clock(now){
 const stamp=now();
 if(!Number.isSafeInteger(stamp)||stamp<0)reject('HOST_SESSION_CLOCK_INVALID');
 return stamp;
}
function safeMember(member,binding){
 return member?.actorId===binding.actorId&&
   member?.merchantId===binding.merchantId&&member?.active===true&&
   ROLES.has(member.role)&&
   Number.isSafeInteger(member.revision)&&member.revision>=1&&
   (member.role!=='seller'||ID.test(member.sellerProfileId??''));
}
export function createHostVerifiedSessionStore({
 filename,expectedOrigin,trustedIssuer,trustedAudience,
 verifyExternalIdentity,lookupExternalAccount,getMembership,
 isAccountBindingActive,
 now=Date.now,ttlMs=15*60*1000
}={}){
 if(typeof filename!=='string'||!filename.trim()||filename===':memory:'||
    filename.startsWith('file:')||filename.includes('?')||
    typeof verifyExternalIdentity!=='function'||
    typeof lookupExternalAccount!=='function'||
    typeof getMembership!=='function'||typeof now!=='function'||
    (isAccountBindingActive!==undefined&&
     typeof isAccountBindingActive!=='function')||
    !Number.isSafeInteger(ttlMs)||ttlMs<60_000||ttlMs>30*60*1000)
  reject('HOST_SESSION_PRIVATE_DEPENDENCIES_REQUIRED');
 const origin=configuredOrigin(expectedOrigin);
 if(typeof trustedIssuer!=='string'||!trustedIssuer.startsWith('https://')||
    trustedIssuer.length>256||typeof trustedAudience!=='string'||
    !/^[A-Za-z0-9_.:-]{3,128}$/.test(trustedAudience))
  reject('HOST_SESSION_TRUST_CONFIGURATION_REQUIRED');
 const db=new DatabaseSync(filename);
 db.exec('PRAGMA busy_timeout=5000;PRAGMA journal_mode=WAL');
 db.exec(`CREATE TABLE IF NOT EXISTS host_verified_sessions(
  token_sha256 TEXT PRIMARY KEY,
  assertion_sha256 TEXT NOT NULL UNIQUE,
  actor_id TEXT NOT NULL,merchant_id TEXT NOT NULL,
  role TEXT NOT NULL,revision INTEGER NOT NULL,
  csrf_sha256 TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN(0,1))
 )`);
 db.exec('CREATE INDEX IF NOT EXISTS idx_host_session_actor ON host_verified_sessions(actor_id)');
 let closed=false;
 const available=()=>{if(closed)reject('HOST_SESSION_STORE_CLOSED')};
 const fetchRow=token=>db.prepare('SELECT * FROM host_verified_sessions WHERE token_sha256=?').get(sha(token));
 const getCurrent=async token=>{
  available();
  if(!TOKEN.test(token??''))return null;
  const row=fetchRow(token),t=clock(now);
  if(!row||row.revoked!==0||row.expires_at_ms<=t)return null;
  let member;
  try{member=await getMembership(row.actor_id)}catch{return null}
  if(!safeMember(member,{actorId:row.actor_id,merchantId:row.merchant_id})||
     member.role!==row.role||member.revision!==row.revision)return null;
  // Trust must be checked after login too. Membership alone does not imply
  // the external subject-to-account link still exists. Fail closed on
  // revoked bindings, DB faults, or inaccessible binding store.
  if(isAccountBindingActive){
   try{
    const valid=await isAccountBindingActive(Object.freeze({
     actorId:row.actor_id,merchantId:row.merchant_id
    }));
    if(valid!==true)return null;
   }catch{return null}
  }
  // Membership/subject lookups can suspend while another request logs out
  // or rotates CSRF. The original row snapshot cannot remain authority.
  // Recheck the durable session immediately before returning it.
  available();
  const latest=fetchRow(token);
  if(!latest||latest.revoked!==0||latest.expires_at_ms<=clock(now)||
     latest.assertion_sha256!==row.assertion_sha256||
     latest.actor_id!==row.actor_id||latest.merchant_id!==row.merchant_id||
     latest.role!==row.role||latest.revision!==row.revision||
     latest.csrf_sha256!==row.csrf_sha256)
   return null;
  return {row:latest,member};
 };
 async function establish(externalAssertion){
  available();
  let evidence;
  try{evidence=await verifyExternalIdentity(externalAssertion)}
  catch{reject('HOST_IDP_ATTESTATION_UNVERIFIED')}
  const t=clock(now);
  // A cryptographically verified external subject is NEVER an application
  // actor ID. Preprovisioned identity binding is an independent gate.
  if(evidence?.verified!==true||evidence.issuer!==trustedIssuer||
     evidence.audience!==trustedAudience||
     typeof evidence.subject!=='string'||!evidence.subject.trim()||
     evidence.subject.length>256||
     !PROOF.test(evidence.assertionId??'')||
     !Number.isSafeInteger(evidence.authenticatedAtMs)||
     evidence.authenticatedAtMs>t+30_000||
     t-evidence.authenticatedAtMs>5*60*1000)
   reject('HOST_IDP_ATTESTATION_UNVERIFIED');
  let bound,member;
  try{
   bound=await lookupExternalAccount(Object.freeze({
    issuer:evidence.issuer,subject:evidence.subject
   }));
   if(!ID.test(bound?.actorId??'')||!ID.test(bound?.merchantId??''))
    reject('HOST_PREPROVISIONED_ACCOUNT_REQUIRED');
   member=await getMembership(bound.actorId);
  }catch(e){
   if(e?.code==='HOST_PREPROVISIONED_ACCOUNT_REQUIRED')throw e;
   reject('HOST_PREPROVISIONED_ACCOUNT_REQUIRED');
  }
  if(!safeMember(member,bound))
   reject('HOST_CURRENT_MEMBERSHIP_REQUIRED');
  const token=randomBytes(32).toString('base64url');
  const csrf=randomBytes(32).toString('base64url');
  const assertion=sha(evidence.issuer+'\0'+evidence.subject+'\0'+evidence.assertionId);
  try{
   db.prepare(`INSERT INTO host_verified_sessions
    (token_sha256,assertion_sha256,actor_id,merchant_id,role,revision,csrf_sha256,expires_at_ms)
    VALUES(?,?,?,?,?,?,?,?)`).run(sha(token),assertion,bound.actorId,
     bound.merchantId,member.role,member.revision,sha(csrf),t+ttlMs);
  }catch(e){
   if(String(e?.message).includes('UNIQUE'))
    reject('HOST_IDP_ASSERTION_ALREADY_CONSUMED');
   throw e;
  }
  return Object.freeze({
   setCookie:COOKIE+'='+token+'; Secure; HttpOnly; Path=/; SameSite=Strict; Max-Age='+Math.floor(ttlMs/1000),
   csrfToken:csrf,expiresAtMs:t+ttlMs,
   mode:'VERIFIED_IDP_PREPROVISIONED_SESSION_NOT_PUBLIC_AUTH',
   paymentAuthorized:false
  });
 }
 async function resolveRequest(request){
  const token=cookie(request,origin);
  if(!token)return null;
  const current=await getCurrent(token);
  if(!current)return null;
  return Object.freeze({verified:true,
   actorId:current.row.actor_id,merchantId:current.row.merchant_id,
   role:current.row.role,
   membershipRevision:current.row.revision,
   // CSRF proof only returned after a valid session and must never be derived
   // from browser-controlled actor/merchant headers. The caller must submit
   // the original CSRF token; validate its SHA256 before returning it.
   csrfToken:null
  });
 }
 async function resolveForGateway(request){
  const token=cookie(request,origin);
  if(!token)return null;
  const current=await getCurrent(token);
  if(!current)return null;
  // POST CSRF token is never stored as plaintext. Validate it before exposing
  // only the same token to the existing gateway's double-submit guard.
  const submitted=request.headers.get('x-csrf-token')??'';
  let csrfToken;
  if(request.method!=='GET'){
   if(!TOKEN.test(submitted))return null;
   const expected=Buffer.from(current.row.csrf_sha256,'hex');
   const observed=Buffer.from(sha(submitted),'hex');
   if(!timingSafeEqual(expected,observed))return null;
   csrfToken=submitted;
  }
  return Object.freeze({verified:true,actorId:current.row.actor_id,
   merchantId:current.row.merchant_id,role:current.row.role,
   membershipRevision:current.row.revision,
   ...(csrfToken?{csrfToken}:{})
  });
 }
 // Same-origin POST can rotate a hashed CSRF capability after page reload.
 // The HttpOnly session cookie authenticates the principal; Origin prevents
 // cross-site token minting, and prior tokens become invalid atomically.
 async function rotateCsrf(request){
  available();
  const token=cookie(request,origin);
  if(!token||request.method!=='POST'||request.headers.get('origin')!==origin)
   reject('HOST_CSRF_ROTATION_AUTH_REQUIRED');
  const current=await getCurrent(token);
  if(!current)reject('HOST_CSRF_ROTATION_AUTH_REQUIRED');
  const fresh=randomBytes(32).toString('base64url');
  const changed=db.prepare(`UPDATE host_verified_sessions
    SET csrf_sha256=? WHERE token_sha256=? AND csrf_sha256=?
    AND revoked=0 AND expires_at_ms>?`)
   .run(sha(fresh),sha(token),current.row.csrf_sha256,clock(now)).changes;
  if(changed!==1)reject('HOST_CSRF_ROTATION_RACE_REJECTED');
  return Object.freeze({csrfToken:fresh,paymentAuthorized:false});
 }
 async function revokeRequest(request){
  available();
  const token=cookie(request,origin);
  if(!token||request.method!=='POST'||
     request.headers.get('origin')!==origin)
   reject('HOST_LOGOUT_AUTH_REQUIRED');
  const current=await getCurrent(token);
  if(!current)reject('HOST_LOGOUT_AUTH_REQUIRED');
  const supplied=request.headers.get('x-csrf-token')??'';
  if(!TOKEN.test(supplied)||
     !timingSafeEqual(Buffer.from(current.row.csrf_sha256,'hex'),
      Buffer.from(sha(supplied),'hex')))
   reject('HOST_LOGOUT_CSRF_REQUIRED');
  const changed=db.prepare('UPDATE host_verified_sessions SET revoked=1 WHERE token_sha256=? AND revoked=0')
   .run(sha(token)).changes;
  if(changed!==1)reject('HOST_LOGOUT_ALREADY_REVOKED');
  return Object.freeze({revoked:true,
   clearCookie:COOKIE+'=; Secure; HttpOnly; Path=/; SameSite=Strict; Max-Age=0',
   paymentAuthorized:false
  });
 }
 function close(){if(!closed){closed=true;db.close()}}
 return Object.freeze({
  establish,resolveRequest,resolveForGateway,rotateCsrf,revokeRequest,close,
  mode:'HOST_BACKED_SESSION_NO_EXTERNAL_IDP_INCLUDED',
  publicAuthenticationEnabled:false,
  externalIdpVerificationInjected:true,
  bindingRevocationChecked:isAccountBindingActive!==undefined,
  registrationEnabled:false,merchantOwnershipVerified:false,
  sellerIdentityVerified:false,paymentAuthorized:false,
  noProviderOrPaymentCalls:true
 });
}
