// Worker WebCrypto + D1-only session verification. This module cannot mint,
// enroll, impersonate or refresh sessions. Trusted IdP/JWKS verification and
// private provisioning are required before any hosted use (RELEASE HOLD).
export class PrivateSessionError extends Error {
  constructor(code){super(code);this.name='PrivateSessionError';this.code=code;}
}
const denied=()=>new PrivateSessionError('UNAUTHENTICATED');
const valid=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const COOKIE='__Host-proofline_session';
const tokenPattern=/^[A-Za-z0-9_-]{43}$/; // base64url of 32 random bytes

function getToken(request){
  const cookie=request.headers.get('cookie')||'';
  if(cookie.length>4096)throw denied();
  const pairs=cookie.split(';').map(s=>s.trim());
  const found=pairs.filter(s=>s.startsWith(COOKIE+'='));
  if(found.length!==1)throw denied();
  const token=found[0].slice(COOKIE.length+1);
  if(!tokenPattern.test(token))throw denied();
  return token;
}

// Reused only by trusted internal session lifecycle operations; no public
// route can retrieve the raw bearer token through this interface.
export async function hashPrivateSessionCookie(request){
  if(!(request instanceof Request))throw denied();
  const token=getToken(request);
  const hashBytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hashBytes),b=>b.toString(16).padStart(2,'0')).join('');
}

export function createWorkerPrivateSessionResolver({db,now=Date.now}={}){
  if(!db||typeof db.withSession!=='function'||typeof now!=='function')
    throw new PrivateSessionError('SESSION_BINDING_REQUIRED');
  return async function resolveVerifiedPrincipal(request){
    if(!(request instanceof Request))throw denied();
    const hash=await hashPrivateSessionCookie(request);
    let row;
    try{
      const primary=db.withSession('first-primary');
      if(!primary||typeof primary.prepare!=='function')
        throw Error('NO_PRIMARY');
      row=await primary.prepare(`SELECT s.actor_id,s.merchant_id,s.role,s.issuer,s.issuer_verified_at_ms,
        s.expires_at_ms,s.revoked_at_ms,s.binding_subject_hmac,
        s.binding_revision AS session_binding_revision,
        b.active AS binding_active,b.revision AS current_binding_revision,
        b.actor_id AS binding_actor_id,b.merchant_id AS binding_merchant_id,
        b.role AS binding_role
        FROM worker_private_sessions s
        LEFT JOIN worker_private_oidc_bindings b ON b.issuer=s.issuer
          AND b.subject_hmac=s.binding_subject_hmac
        WHERE s.token_sha256=?`).bind(hash).first();
    }catch{throw new PrivateSessionError('SESSION_STORE_UNAVAILABLE');}
    const timestamp=now();
    if(!row||row.role!=='OWNER'||!valid(row.actor_id)||!valid(row.merchant_id)||
      typeof row.issuer!=='string'||!row.issuer||
      !Number.isSafeInteger(timestamp)||
      !Number.isSafeInteger(row.issuer_verified_at_ms)||
      !Number.isSafeInteger(row.expires_at_ms)||
      row.issuer_verified_at_ms<=0||row.issuer_verified_at_ms>timestamp||
      row.expires_at_ms<=timestamp||row.revoked_at_ms!==null||
      !/^[a-f0-9]{64}$/.test(row.binding_subject_hmac??'')||
      !Number.isSafeInteger(row.session_binding_revision)||row.session_binding_revision<1||
      row.binding_active!==1||row.binding_role!=='OWNER'||
      row.binding_actor_id!==row.actor_id||row.binding_merchant_id!==row.merchant_id||
      row.current_binding_revision!==row.session_binding_revision)
      throw denied();
    return Object.freeze({verified:true,actorId:row.actor_id,merchantId:row.merchant_id});
  };
}
