// Read-only private MVP restart diagnostic. No provider calls, secrets, SQL writes,
// order IDs or raw Gemini input ever appear in the returned report.
// This cannot prove an external PayPal or Gemini transaction.
import {DatabaseSync} from 'node:sqlite';
import {lstatSync} from 'node:fs';
import {join} from 'node:path';

const QUOTE_ID='operator_mvp_01';
const allowed=new Set(['PROPOSED','APPROVED','IN_FLIGHT','UNKNOWN',
  'PAID','RESERVED','COMMITTED','ABSENT']);
const bad=code=>{const e=new Error(code);e.code=code;throw e;};
function configuredOrigin(value){
  if(typeof value!=='string'||value.length>240||value!==value.trim())return false;
  let u;
  try{u=new URL(value)}catch{return false}
  return u.protocol==='https:'&&u.origin===value&&!u.port&&!u.username&&
    !u.password&&!u.search&&!u.hash&&u.hostname.includes('.')&&
    !u.hostname.startsWith('[')&&u.hostname!=='localhost'&&
    !u.hostname.endsWith('.localhost')&&!u.hostname.endsWith('.local')&&
    !u.hostname.endsWith('.internal')&&!/^(?:\d+\.){3}\d+$/.test(u.hostname);
}
function sealedDb(directory,basename,fn){
  const filename=join(directory,basename);
  // lstat, not existsSync: symlink or non-regular file must not be followed.
  let stat;
  try{stat=lstatSync(filename)}
  catch(e){
    if(e?.code==='ENOENT')return {kind:'ABSENT',data:null};
    return {kind:'UNREADABLE',data:null};
  }
  if(!stat.isFile()||stat.size>64*1024*1024)
    return {kind:'UNREADABLE',data:null};
  let db;
  try{
    db=new DatabaseSync(filename,{readOnly:true});
    // Never open writeable DB or run schema migrations.
    db.exec('PRAGMA query_only=ON');
    const data=fn(db);
    return {kind:'PRESENT',data};
  }catch{
    return {kind:'UNREADABLE',data:null};
  }finally{try{db?.close()}catch{}}
}
const mark=x=>allowed.has(x)?x:'UNAVAILABLE';
export function inspectOwnerMvpLocalState({directory,now=Date.now()}={}){
  if(typeof directory!=='string'||directory.length===0||
    !Number.isSafeInteger(now)||now<0)
    bad('MVP_STATUS_ARGUMENTS_REQUIRED');
  const checkout=sealedDb(directory,'checkout.sqlite',db=>{
    const quote=db.prepare('SELECT status FROM quotes WHERE id=?')
      .get(QUOTE_ID);
    const quoteCount=db.prepare('SELECT COUNT(*) AS n FROM quotes').get().n;
    const attempts=db.prepare(
      'SELECT operation,state,remote_id FROM payment_attempts').all();
    const summary={quote:quote?mark(quote.status):'ABSENT',
      create:'ABSENT',capture:'ABSENT',quoteCount:Number(quoteCount),
      attemptCount:attempts.length};
    for(const item of attempts){
      if(!['create','capture'].includes(item.operation))bad('MVP_UNKNOWN_OPERATION');
      // Return state only. NEVER expose merchant, request or provider IDs.
      if(summary[item.operation]!=='ABSENT')bad('MVP_DUPLICATE_OPERATION');
      summary[item.operation]=mark(item.state);
    }
    return summary;
  });
  const ai=sealedDb(directory,'gemini_skills.sqlite',db=>{
    const row=db.prepare('SELECT state FROM marketplace_ai_attempts WHERE id=1').get();
    return {attempt:row?mark(row.state):'ABSENT'};
  });
  const session=sealedDb(directory,'checkout_sessions.sqlite',db=>{
    const rows=db.prepare(
      'SELECT revoked,expires_at_ms FROM pilot_checkout_sessions').all();
    const newest=rows[rows.length-1];
    return {count:rows.length,
      status:!newest?'ABSENT':newest.revoked===1?'REVOKED':
        newest.expires_at_ms>now?'ACTIVE':'EXPIRED'};
  });
  const states={quote:checkout.data?.quote??'UNAVAILABLE',
    create:checkout.data?.create??'UNAVAILABLE',
    capture:checkout.data?.capture??'UNAVAILABLE',
    gemini:ai.data?.attempt??'UNAVAILABLE',
    session:session.data?.status??'UNAVAILABLE'};
  const files={checkout:checkout.kind,gemini:ai.kind,session:session.kind};
  // A used AI one-shot reservation or any session/quote means restart must be
  // inspected, NOT bypassed by deleting SQLite or silently repeating POST.
  const unreadable=Object.values(files).includes('UNREADABLE');
  const prior=Object.values(states).some(s=>s!=='ABSENT'&&s!=='UNAVAILABLE')||
    (checkout.data?.quoteCount??0)>0||
    (checkout.data?.attemptCount??0)>0||
    (session.data?.count??0)>0;
  return Object.freeze({
    status:unreadable?'UNREADABLE_PRIVATE_STATE_REVIEW_REQUIRED':
      prior?'PREVIOUS_PRIVATE_ATTEMPT_REVIEW_REQUIRED':
      'CLEAN_LOCAL_ONE_SHOT',
    files,states,
    // Private sqlite may have previously recorded PAID but this is NOT new
    // authenticated PayPal GET evidence. Never print "paid = verified now".
    priorRecordedCapture:states.capture==='PAID',
    priorRecordedCaptureIsFreshProviderProof:false,
    safeToStartNewAttempt:!unreadable&&!prior,
    automaticallyResumeAllowed:false,
    paymentRetryAllowed:false,
    secretsRead:false,networkRequests:0,
    userAction:unreadable?'REVIEW_PRIVATE_DB_WITHOUT_RETRY':
      prior?'REVIEW_PROVIDER_AND_SQLITE_NO_AUTO_RETRY':
      'VERIFY_ACCOUNT_HTTPS_AND_EXPLICIT_CONSENT'
  });
}
export function inspectOwnerMvpConfig({env={}}={}){
  const present=k=>typeof env[k]==='string'&&env[k].trim().length>0;
  const creds={
    geminiKeyPresent:present('GEMINI_API_KEY'),
    sandboxClientIdPresent:present('PAYPAL_SANDBOX_CLIENT_ID'),
    sandboxClientSecretPresent:present('PAYPAL_SANDBOX_CLIENT_SECRET')
  };
  const port=env.PAYPAL_PILOT_CALLBACK_PORT??'8787';
  const checks={
    ...creds,
    sandboxMerchantIdFormatValid:/^[A-Za-z0-9]{13}$/.test(env.PAYPAL_SANDBOX_MERCHANT_ID??''),
    publicHttpsOriginFormatValid:configuredOrigin(env.PAYPAL_PILOT_PUBLIC_ORIGIN),
    callbackPortValid:/^[1-9][0-9]{0,4}$/.test(port)&&
      Number(port)>=1024&&Number(port)<=65535,
  };
  return Object.freeze({checks,
    configShapeReady:Object.values(checks).every(Boolean),
    actualGeminiFreeTierVerified:false,
    actualPayPalSandboxOAuthVerified:false,
    buyerPersonalAccountVerified:false,
    publicHttpsIngressVerified:false,
    realProviderCalls:0,
    credentialsEchoed:false,
    warning:'CONFIG_PRESENCE_NOT_PROVIDER_AUTHORIZATION_OR_PAYMENT_PROOF'});
}
