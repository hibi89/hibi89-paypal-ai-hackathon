// OFF by default; a reader of operator-provisioned OIDC-bound D1 sessions.
// This module cannot mint sessions, enroll identities or invoke providers.
import {PrivateSessionError} from './worker_private_session_resolver.mjs';

const NAME='__Host-proofline_contract_role';
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const HEX=/^[a-f0-9]{64}$/;
const denied=()=>{throw new PrivateSessionError('UNAUTHENTICATED');};
const SQL=[
 'SELECT s.actor_id,s.merchant_id,s.role,s.issuer,s.subject_hmac,',
 's.binding_revision,s.membership_revision,s.assertion_sha256,',
 's.issued_at_ms,s.expires_at_ms,s.revoked_at_ms,',
 'b.actor_id AS bound_actor,b.merchant_id AS bound_merchant,',
 'b.role AS bound_role,b.active AS bound_active,b.revision AS bound_revision,',
 'm.role AS member_role,m.active AS member_active,m.revision AS member_revision',
 'FROM worker_contract_role_sessions s',
 'LEFT JOIN worker_contract_role_bindings b',
 'ON b.issuer=s.issuer AND b.subject_hmac=s.subject_hmac',
 'LEFT JOIN worker_contract_memberships m',
 'ON m.actor_id=s.actor_id AND m.merchant_id=s.merchant_id',
 'WHERE s.token_sha256=?'
].join(' ');
async function getSessionHash(request){
 if(!(request instanceof Request))denied();
 const raw=request.headers.get('cookie')??'';
 if(raw.length>4096)denied();
 const cookies=raw.split(';').map(x=>x.trim()).filter(x=>x.startsWith(NAME+'='));
 if(cookies.length!==1||!TOKEN.test(cookies[0].slice(NAME.length+1)))denied();
 const value=cookies[0].slice(NAME.length+1);
 const buffer=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return Array.from(new Uint8Array(buffer),x=>x.toString(16).padStart(2,'0')).join('');
}
export function createWorkerContractRoleSessionResolver({db,now=Date.now}={}){
 if(typeof db?.withSession!=='function'||typeof now!=='function')
  throw new PrivateSessionError('ROLE_SESSION_DEPENDENCIES_REQUIRED');
 return async function resolveVerifiedContractRole(request){
  const sessionHash=await getSessionHash(request);
  let row;
  try{
   const primary=db.withSession('first-primary');
   if(typeof primary?.prepare!=='function')throw Error('D1_UNAVAILABLE');
   row=await primary.prepare(SQL).bind(sessionHash).first();
  }catch{throw new PrivateSessionError('ROLE_SESSION_STORE_UNAVAILABLE');}
  const time=now();
  if(!row||!Number.isSafeInteger(time)||time<=0||
     !['SELLER','REVIEWER'].includes(row.role)||!ID.test(row.actor_id??'')||
     !ID.test(row.merchant_id??'')||!HEX.test(row.subject_hmac??'')||
     !HEX.test(row.assertion_sha256??'')||typeof row.issuer!=='string'||
     row.issuer.length<8||row.issuer.length>200||
     !Number.isSafeInteger(row.binding_revision)||row.binding_revision<1||
     !Number.isSafeInteger(row.membership_revision)||row.membership_revision<1||
     !Number.isSafeInteger(row.issued_at_ms)||row.issued_at_ms<=0||
     row.issued_at_ms>time||!Number.isSafeInteger(row.expires_at_ms)||
     row.expires_at_ms<=time||row.expires_at_ms>row.issued_at_ms+1800000||
     row.revoked_at_ms!==null||row.bound_active!==1||row.member_active!==1||
     row.bound_actor!==row.actor_id||row.bound_merchant!==row.merchant_id||
     row.bound_role!==row.role||row.member_role!==row.role||
     row.bound_revision!==row.binding_revision||
     row.member_revision!==row.membership_revision)denied();
  return Object.freeze({verified:true,actorId:row.actor_id,
   merchantId:row.merchant_id,identityRole:row.role,
   roleSessionHash:sessionHash,roleBindingRevision:row.binding_revision});
 };
}
