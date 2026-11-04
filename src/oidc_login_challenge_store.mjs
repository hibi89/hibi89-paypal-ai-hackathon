// Server-only, crash-safe OIDC Authorization Code + PKCE challenge store.
// PREPARES AND CONSUMES a browser-bound login challenge: no IdP HTTP, tokens,
// automatic login, PayPal authority, cookies sent over any network, or listener.
// A trusted HTTPS host owns OAuth redirect, code exchange and rate limits.
// Only a server-private, separately configured 32-byte key decrypts the
// one-shot nonce and PKCE verifier; never serialize that key to a response.
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash,createCipheriv,createDecipheriv,timingSafeEqual}
  from 'node:crypto';

const COOKIE='__Host-proofline_oidc';
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const CODE=/^[A-Za-z0-9._~+\/-]{8,2048}$/;
const sha=x=>createHash('sha256').update(x).digest();
const shaHex=x=>sha(x).toString('hex');
const fail=(code='OIDC_CHALLENGE_REJECTED')=>{
 const error=new Error(code);error.code=code;throw error;
};
function strictHttps(uri){
 let url;
 try{url=new URL(uri)}catch{fail('OIDC_HTTPS_URL_REQUIRED')}
 if(url.protocol!=='https:'||url.username||url.password||
    url.hash||url.search||url.port||!url.hostname.includes('.')||
    url.hostname==='localhost'||url.hostname.endsWith('.localhost')||
    /^(?:\d+\.){3}\d+$/.test(url.hostname)||
    url.href!==uri)fail('OIDC_HTTPS_URL_REQUIRED');
 return url;
}
function cookie(request){
 const header=request.headers.get('cookie')??'';
 if(header.length>8192)return null;
 const values=header.split(';').map(x=>x.trim())
   .filter(x=>x.startsWith(COOKIE+'='));
 if(values.length!==1)return null;
 const value=values[0].slice(COOKIE.length+1);
 return TOKEN.test(value)?value:null;
}
function compareDigest(a,b){
 if(!Buffer.isBuffer(a)||!Buffer.isBuffer(b))return false;
 return a.length===b.length&&timingSafeEqual(a,b);
}
export function createOidcLoginChallengeStore({
 filename,secretKey,issuer,clientId,startUri,redirectUri,
 now=Date.now,ttlMs=5*60*1000
}={}){
 if(typeof filename!=='string'||!filename.trim()||filename===':memory:'||
    filename.startsWith('file:')||filename.includes('?')||
    !Buffer.isBuffer(secretKey)||secretKey.length!==32||
    typeof issuer!=='string'||!issuer.startsWith('https://')||
    typeof clientId!=='string'||!/^[A-Za-z0-9._:-]{3,128}$/.test(clientId)||
    typeof now!=='function'||!Number.isSafeInteger(ttlMs)||
    ttlMs<60_000||ttlMs>10*60*1000)
  fail('OIDC_PRIVATE_CHALLENGE_CONFIGURATION_REQUIRED');
 const start=strictHttps(startUri),redirect=strictHttps(redirectUri);
 if(start.origin!==redirect.origin||start.pathname!=='/api/auth/oidc/start'||
    redirect.pathname!=='/api/auth/oidc/callback')fail('OIDC_ROUTE_CONFIGURATION_REQUIRED');
 const db=new DatabaseSync(filename);
 db.exec('PRAGMA busy_timeout=5000;PRAGMA journal_mode=WAL');
 db.exec(`CREATE TABLE IF NOT EXISTS oidc_login_challenges(
  state_digest TEXT PRIMARY KEY,
  browser_digest TEXT NOT NULL,
  payload_ciphertext BLOB NOT NULL,
  payload_iv BLOB NOT NULL,
  payload_tag BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
 )`);
 db.exec('CREATE INDEX IF NOT EXISTS idx_oidc_challenge_expiry ON oidc_login_challenges(expires_at)');
 let closed=false;
 const active=()=>{if(closed)fail('OIDC_CHALLENGE_STORE_CLOSED')};
 const timestamp=()=>{
  const t=now();
  if(!Number.isSafeInteger(t)||t<0)fail('OIDC_CHALLENGE_CLOCK_INVALID');
  return t;
 };
 const transaction=fn=>{
  db.exec('BEGIN IMMEDIATE');
  try{const result=fn();db.exec('COMMIT');return result}
  catch(e){db.exec('ROLLBACK');throw e}
 };
 const aad=digest=>Buffer.from(issuer+'\0'+clientId+'\0'+redirect.href+'\0'+digest);
 function encrypt(payload,digest){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',secretKey,iv);
  cipher.setAAD(aad(digest));
  const contents=Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]);
  return {contents,iv,tag:cipher.getAuthTag()};
 }
 function decrypt(row,digest){
  try{
   const cipher=createDecipheriv('aes-256-gcm',secretKey,
    Buffer.from(row.payload_iv));
   cipher.setAAD(aad(digest));
   cipher.setAuthTag(Buffer.from(row.payload_tag));
   const raw=Buffer.concat([
    cipher.update(Buffer.from(row.payload_ciphertext)),cipher.final()
   ]);
   const data=JSON.parse(raw.toString('utf8'));
   if(!TOKEN.test(data.nonce)||!TOKEN.test(data.verifier))
    fail('OIDC_CHALLENGE_CORRUPTED');
   return data;
  }catch{fail('OIDC_CHALLENGE_CORRUPTED')}
 }
 function validStart(request){
  if(!(request instanceof Request)||request.method!=='POST'||
     request.url!==start.href||request.headers.get('origin')!==start.origin)
   fail('OIDC_START_ORIGIN_REQUIRED');
 }
 function begin(request){
  active();validStart(request);
  const state=randomBytes(32).toString('base64url');
  const browser=randomBytes(32).toString('base64url');
  const nonce=randomBytes(32).toString('base64url');
  const verifier=randomBytes(32).toString('base64url');
  const challenge=sha(verifier).toString('base64url');
  const t=timestamp(),digest=shaHex(state);
  const {contents,iv,tag}=encrypt({nonce,verifier},digest);
  transaction(()=>{
   db.prepare('DELETE FROM oidc_login_challenges WHERE expires_at < ?')
     .run(t-24*60*60*1000);
   const total=db.prepare(`SELECT COUNT(*) AS count FROM oidc_login_challenges
     WHERE consumed_at IS NULL AND expires_at>?`).get(t).count;
   if(total>=1000)fail('OIDC_CHALLENGE_CAPACITY_EXCEEDED');
   db.prepare(`INSERT INTO oidc_login_challenges
     (state_digest,browser_digest,payload_ciphertext,payload_iv,payload_tag,created_at,expires_at)
     VALUES(?,?,?,?,?,?,?)`).run(
      digest,shaHex(browser),contents,iv,tag,t,t+ttlMs
     );
  });
  return Object.freeze({
   state,nonce,codeChallenge:challenge,codeChallengeMethod:'S256',
   // Lax is required for an OIDC provider's cross-site top-level GET redirect.
   // The random cookie + state provide CSRF binding; Strict would suppress it.
   setCookie:COOKIE+'='+browser+'; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age='+
     Math.floor(ttlMs/1000),
   expiresAtMs:t+ttlMs,issuer,clientId,redirectUri:redirect.href,
   mode:'OFFLINE_ONE_TIME_OIDC_PKCE_CHALLENGE',
   loginCompleted:false,paymentAuthorized:false
  });
 }
 function consume(request){
  active();
  if(!(request instanceof Request)||request.method!=='GET')
   fail('OIDC_CALLBACK_METHOD_REQUIRED');
  let url;
  try{url=new URL(request.url)}catch{fail('OIDC_CALLBACK_ROUTE_REQUIRED')}
  if(url.origin!==redirect.origin||url.pathname!==redirect.pathname||
     url.hash||url.username||url.password)fail('OIDC_CALLBACK_ROUTE_REQUIRED');
  const params=url.searchParams;
  const keys=[...params.keys()];
  if(keys.some(k=>!['code','state','iss'].includes(k))||
    params.getAll('state').length!==1||params.getAll('code').length!==1||
    params.getAll('iss').length>1||
    (params.has('iss')&&params.get('iss')!==issuer))
   fail('OIDC_CALLBACK_PARAMETERS_REJECTED');
  const state=params.get('state'),code=params.get('code');
  const browser=cookie(request);
  if(!TOKEN.test(state??'')||!CODE.test(code??'')||!browser)
   fail('OIDC_CALLBACK_BINDING_REQUIRED');
  const t=timestamp(),digest=shaHex(state);
  return transaction(()=>{
   const row=db.prepare('SELECT * FROM oidc_login_challenges WHERE state_digest=?')
     .get(digest);
   if(!row||row.consumed_at!==null||row.expires_at<=t||
      !compareDigest(Buffer.from(row.browser_digest,'hex'),sha(browser)))
    fail('OIDC_CHALLENGE_UNAVAILABLE_OR_REPLAYED');
   const payload=decrypt(row,digest);
   const changed=db.prepare(`UPDATE oidc_login_challenges SET consumed_at=?
     WHERE state_digest=? AND consumed_at IS NULL AND expires_at>?`)
     .run(t,digest,t).changes;
   if(changed!==1)fail('OIDC_CHALLENGE_UNAVAILABLE_OR_REPLAYED');
   // Private host-only result: send code+verifier only to its preconfigured
   // IdP token endpoint through a separately approved exchange component.
   return Object.freeze({
    code,codeVerifier:payload.verifier,expectedNonce:payload.nonce,
    clientId,issuer,redirectUri:redirect.href,
    clearCookie:COOKIE+'=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0',
    exchanged:false,authenticated:false,paymentAuthorized:false
   });
  });
 }
 return Object.freeze({
  begin,consume,close:()=>{if(!closed){closed=true;db.close()}},
  mode:'HOST_ONLY_DURABLE_ONE_TIME_OIDC_CHALLENGE',
  externalCalls:0,codeExchangeEnabled:false,
  publicAuthenticationEnabled:false,paymentAuthorized:false
 });
}
