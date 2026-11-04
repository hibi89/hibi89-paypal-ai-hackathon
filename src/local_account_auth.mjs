// Opt-in preprovisioned credential login for the loopback demo, never public auth.
// Passwords/tokens are not stored as plaintext. No self-registration or payment authority.
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash,scryptSync,timingSafeEqual} from 'node:crypto';
import {QuoteApiError,parseSmallJson,reply} from './quote_api.mjs';

const ID=/^[A-Za-z0-9_-]{1,64}$/;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const COOKIE='paypal_local_session';
const hash=x=>createHash('sha256').update(x).digest('hex');
const validPassword=p=>typeof p==='string'&&p.length>=12&&p.length<=256;
const fail=(code,status=403)=>{throw new QuoteApiError(code,status);};
const asBytes=(password,salt)=>scryptSync(password,Buffer.from(salt,'hex'),32,{
  N:16384,r:8,p:1,maxmem:32*1024*1024
});
function cookieToken(request){
  const header=request?.headers?.get('cookie')||'';
  const values=header.split(';').map(x=>x.trim())
    .filter(x=>x.startsWith(COOKIE+'='));
  if(values.length!==1)return null;
  const token=values[0].slice(COOKIE.length+1);
  return TOKEN.test(token)?token:null;
}
export function createLocalAccountAuth({filename,accounts,now=Date.now,ttlMs=30*60*1000}={}){
  if(typeof filename!=='string'||!filename||filename===':memory:'||
     !Array.isArray(accounts)||accounts.length<1||accounts.length>10||
     typeof now!=='function'||!Number.isSafeInteger(ttlMs)||
     ttlMs<60_000||ttlMs>12*60*60*1000)
    throw new TypeError('INVALID_LOCAL_AUTH_CONFIGURATION');
  const seen=new Set();
  for(const a of accounts){
    if(!a||Object.keys(a).sort().join(',')!=='actorId,merchantId,password'||
       !ID.test(a.actorId)||!ID.test(a.merchantId)||!validPassword(a.password)||
       seen.has(a.actorId))
      throw new TypeError('INVALID_LOCAL_AUTH_ACCOUNT');
    seen.add(a.actorId);
  }
  const db=new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000');
  db.exec('CREATE TABLE IF NOT EXISTS local_auth_accounts ('+
    'actor TEXT PRIMARY KEY, merchant TEXT NOT NULL, salt TEXT NOT NULL, verifier TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS local_auth_sessions ('+
    'token_hash TEXT PRIMARY KEY, actor TEXT NOT NULL REFERENCES local_auth_accounts(actor),'+
    'expires_at INTEGER NOT NULL, csrf TEXT NOT NULL)');
  try{
    for(const a of accounts){
      const prior=db.prepare('SELECT * FROM local_auth_accounts WHERE actor=?').get(a.actorId);
      if(prior){
        const candidate=asBytes(a.password,prior.salt);
        if(prior.merchant!==a.merchantId||
           !timingSafeEqual(candidate,Buffer.from(prior.verifier,'hex')))
          throw new TypeError('LOCAL_AUTH_ACCOUNT_CONFIGURATION_CHANGED');
      }else{
        const salt=randomBytes(16).toString('hex');
        db.prepare('INSERT INTO local_auth_accounts(actor,merchant,salt,verifier) VALUES(?,?,?,?)')
          .run(a.actorId,a.merchantId,salt,asBytes(a.password,salt).toString('hex'));
      }
    }
  }catch(e){db.close();throw e;}
  const dummySalt=randomBytes(16).toString('hex');
  function login(actorId,password){
    if(typeof actorId!=='string'||!ID.test(actorId)||!validPassword(password))
      fail('INVALID_CREDENTIALS',401);
    const row=db.prepare('SELECT * FROM local_auth_accounts WHERE actor=?').get(actorId);
    const digest=asBytes(password,row?.salt??dummySalt);
    if(!row||!timingSafeEqual(digest,Buffer.from(row.verifier,'hex')))
      fail('INVALID_CREDENTIALS',401);
    const token=randomBytes(32).toString('base64url');
    const csrf=randomBytes(24).toString('base64url');
    const stamp=now();
    if(!Number.isSafeInteger(stamp))throw new TypeError('INVALID_AUTH_CLOCK');
    db.prepare('INSERT INTO local_auth_sessions(token_hash,actor,expires_at,csrf) VALUES(?,?,?,?)')
      .run(hash(token),row.actor,stamp+ttlMs,csrf);
    return {token,expiresAt:stamp+ttlMs};
  }
  function resolveRequest(request){
    const token=cookieToken(request);
    if(!token)return null;
    const row=db.prepare('SELECT a.actor,a.merchant,s.expires_at,s.csrf '+
      'FROM local_auth_sessions s JOIN local_auth_accounts a ON a.actor=s.actor '+
      'WHERE s.token_hash=?').get(hash(token));
    if(!row||row.expires_at<=now())return null;
    return {verified:true,actorId:row.actor,merchantId:row.merchant,csrfToken:row.csrf};
  }
  function logout(request){
    const token=cookieToken(request);
    if(!token||!resolveRequest(request))fail('LOGIN_REQUIRED',401);
    db.prepare('DELETE FROM local_auth_sessions WHERE token_hash=?').run(hash(token));
  }
  async function handleApi(request){
    try{
      if(!(request instanceof Request))fail('REQUEST_REQUIRED',400);
      const url=new URL(request.url);
      if(!['/api/demo/auth/login','/api/demo/auth/logout','/api/demo/auth/session']
        .includes(url.pathname)||url.search)fail('NOT_FOUND',404);
      if(url.pathname==='/api/demo/auth/session'){
        if(request.method!=='GET')return reply({error:'METHOD_NOT_ALLOWED'},405,{allow:'GET'});
        const session=resolveRequest(request);
        if(!session)fail('LOGIN_REQUIRED',401);
        return reply({identity:{actorId:session.actorId,merchantId:session.merchantId},
          csrfToken:session.csrfToken,mode:'LOCAL_CREDENTIALS_ONLY',
          realSellerVerified:false,merchantOwnershipVerified:false,paymentAuthorized:false});
      }
      if(request.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405,{allow:'POST'});
      if(request.headers.get('origin')!==url.origin)fail('ORIGIN_REQUIRED',403);
      if(url.pathname==='/api/demo/auth/logout'){
        const session=resolveRequest(request);
        if(!session)fail('LOGIN_REQUIRED',401);
        if(request.headers.get('x-csrf-token')!==session.csrfToken)fail('CSRF_REQUIRED',403);
        logout(request);
        return reply({loggedOut:true,paymentAuthorized:false},200,
          {'set-cookie':COOKIE+'=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0'});
      }
      if(request.headers.get('content-type')!=='application/json')
        fail('JSON_CONTENT_TYPE_REQUIRED',415);
      const body=await parseSmallJson(request);
      if(Object.keys(body).sort().join(',')!=='actorId,password')
        fail('INVALID_LOGIN_FIELDS',400);
      const issued=login(body.actorId,body.password);
      return reply({authenticated:true,expiresAt:issued.expiresAt,
        mode:'LOCAL_CREDENTIALS_ONLY',paymentAuthorized:false},200,
        {'set-cookie':COOKIE+'='+issued.token+'; HttpOnly; Path=/; SameSite=Strict'});
    }catch(e){
      return reply({error:e instanceof QuoteApiError?e.code:'INTERNAL_ERROR'},
        e instanceof QuoteApiError?e.status:500);
    }
  }
  return Object.freeze({login,logout,resolveRequest,handleApi,close:()=>db.close(),
    mode:'LOOPBACK_PREPROVISIONED_CREDENTIALS_ONLY',
    publicAuthenticationEnabled:false,paymentAuthorized:false});
}
