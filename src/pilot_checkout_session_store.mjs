// P0 owner-only checkout session proof for a future trusted server.
// Stores token SHA-256 only. NO provider HTTP, cookies, or user login.
// Only a trusted identity resolver may issue or verify sessions.
// In-memory proof branding blocks callers forging {verified:true}.
import {createHash,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {approvedAmount} from './payment_contract.mjs';

const PROOFS=new WeakMap();
const MERCHANT=/^[A-Za-z0-9]{13}$/;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const SESSION_TTL_MS=15*60*1000;
const deny=(code='PILOT_SESSION_NOT_VERIFIED')=>{const e=new Error(code);e.code=code;throw e;};
const digest=t=>createHash('sha256').update(t).digest('hex');
const hasId=x=>typeof x==='string' && /^[A-Za-z0-9_-]{1,64}$/.test(x);
function checkQuote(quote,principal){
 if(quote?.status!=='APPROVED'||!hasId(quote?.id)||!MERCHANT.test(quote?.merchantId??'')||
    principal?.verified!==true||principal.actorId!==quote.ownerId||
    principal.merchantId!==quote.merchantId||
    quote.approval?.actorId!==principal.actorId||
    quote.approval?.quoteVersion!==quote.version)
   deny();
 let amount;
 try{amount=approvedAmount(quote)}catch{deny()}
 if(amount>200)deny('PILOT_AMOUNT_LIMIT_EXCEEDED');
 return amount;
}
const snapshot=q=>[q.id,q.version,q.ownerId,q.merchantId,q.approval.amountMinor];
export function createPilotCheckoutSessionStore({filename,now=Date.now}={}){
 if(typeof filename!=='string'||!filename.trim()||filename===':memory:'||
    filename.startsWith('file:')||typeof now!=='function')
    deny('DURABLE_PILOT_SESSION_FILE_REQUIRED');
 const db=new DatabaseSync(filename);
 db.exec('PRAGMA journal_mode=WAL');
 db.exec('PRAGMA busy_timeout=5000');
 db.exec(`CREATE TABLE IF NOT EXISTS pilot_checkout_sessions (
  token_hash TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  quote_id TEXT NOT NULL, quote_version INTEGER NOT NULL,
  actor_id TEXT NOT NULL, merchant_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  issued_at_ms INTEGER NOT NULL, expires_at_ms INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1)),
  UNIQUE(quote_id,quote_version,merchant_id)
 )`);
 let closed=false;
 const current=()=>{
  if(closed)deny();
  const t=now();
  if(!Number.isSafeInteger(t)||t<0)deny();
  return t;
 };
 const lookup=hash=>db.prepare('SELECT * FROM pilot_checkout_sessions WHERE token_hash=?').get(hash);
 const matches=(row,quote,principal,t)=>!!row&&!row.revoked&&row.expires_at_ms>t&&
   row.quote_id===quote.id&&row.quote_version===quote.version&&
   row.actor_id===principal.actorId&&row.merchant_id===principal.merchantId&&
   row.amount_minor===quote.approval.amountMinor;
 function issue({quote,principal}={}){
  const amount=checkQuote(quote,principal);
  const t=current(),token=randomBytes(32).toString('base64url');
  const hash=digest(token),sessionId=randomBytes(24).toString('hex');
  try{
   db.prepare(`INSERT INTO pilot_checkout_sessions
    (token_hash,session_id,quote_id,quote_version,actor_id,merchant_id,amount_minor,issued_at_ms,expires_at_ms)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(hash,sessionId,quote.id,quote.version,principal.actorId,
      principal.merchantId,amount,t,t+SESSION_TTL_MS);
  }catch(e){
   if(String(e?.message).includes('UNIQUE constraint'))deny('PILOT_SESSION_ALREADY_ISSUED');
   throw e;
  }
  // Bearer token is shown once to the trusted backend, never stored or logged.
  return Object.freeze({token,expiresAtMs:t+SESSION_TTL_MS});
 }
 function verify({token,quote,principal}={}){
  checkQuote(quote,principal);
  const t=current();
  if(typeof token!=='string'||!TOKEN.test(token))deny();
  const hash=digest(token),row=lookup(hash);
  if(!matches(row,quote,principal,t))deny();
  const proof=Object.freeze({kind:'PERSISTED_PILOT_SESSION_PROOF'});
  PROOFS.set(proof,Object.freeze({db,lookup,current,principal:{
    actorId:principal.actorId,merchantId:principal.merchantId},tokenHash:hash,
    fields:snapshot(quote)}));
  return proof;
 }
 function revoke({token,quote,principal}={}){
  checkQuote(quote,principal);
  current();
  if(typeof token!=='string'||!TOKEN.test(token))deny();
  const hash=digest(token),row=lookup(hash);
  if(!row||row.quote_id!==quote.id||row.quote_version!==quote.version||
    row.actor_id!==principal.actorId||row.merchant_id!==principal.merchantId)deny();
  db.prepare('UPDATE pilot_checkout_sessions SET revoked=1 WHERE token_hash=? AND revoked=0').run(hash);
  return Object.freeze({revoked:true});
 }
 function close(){if(!closed){closed=true;db.close()}}
 return Object.freeze({issue,verify,revoke,close,
   mode:'DURABLE_LOCAL_SESSION_PROOF_NO_AUTH_PROVIDER_NO_NETWORK'});
}
export function boundServerSessionFromStoredProof(proof,quote){
 const p=PROOFS.get(proof);
 if(!p||!quote||p.fields.some((x,i)=>x!==snapshot(quote)[i]))deny();
 const t=p.current(),row=p.lookup(p.tokenHash);
 if(!matches(row,quote,p.principal,t))deny();
 return Object.freeze({verified:true,actorId:p.principal.actorId,
   merchantId:p.principal.merchantId,checkoutSessionId:row.session_id});
}
