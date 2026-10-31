// Proofline Part 2: offline five-skill lab. No AI or payment transport.
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';
import {QuoteApiError,reply,parseSmallJson} from './quote_api.mjs';
import {authorizePersistedLocalAction} from './marketplace_identity_policy.mjs';
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(x);
const err=(code,status=400)=>{throw new QuoteApiError(code,status)};
const hash=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&
  Object.keys(v).sort().join(',')===keys.slice().sort().join(',');
export function negotiateA2A(maxMinor){
 if(!Number.isSafeInteger(maxMinor)||maxMinor<100||maxMinor>1000000)err('INVALID_BUDGET');
 const messages=[{agent:'SELLER_AGENT',action:'OFFER',amountMinor:34500}];
 if(maxMinor<27000){
  messages.push({agent:'BUYER_AGENT',action:'REJECT',reason:'SELLER_FLOOR_ABOVE_LIMIT'});
  return {status:'NO_AGREEMENT',agreedMinor:null,messages,accepted:false};
 }
 const counter=Math.min(maxMinor,29000),agreed=Math.max(27000,Math.min(29900,maxMinor));
 messages.push({agent:'BUYER_AGENT',action:'COUNTER',amountMinor:counter});
 messages.push({agent:'SELLER_AGENT',action:'COUNTER',amountMinor:agreed});
 messages.push({agent:'BUYER_AGENT',action:'ACCEPT',amountMinor:agreed});
 messages.push({agent:'SELLER_AGENT',action:'ACCEPT',amountMinor:agreed});
 return {status:'SYNTHETIC_AGREEMENT',agreedMinor:agreed,messages,accepted:true,
  agentMode:'DETERMINISTIC_POLICY_NOT_LLM',paymentState:'NOT_PAID'};
}
const CATALOG=Object.freeze([
 {id:'desk-light-a',category:'lighting',priceMinor:4300,source:'FICTIONAL_CATALOG'},
 {id:'desk-light-b',category:'lighting',priceMinor:3800,source:'FICTIONAL_CATALOG'},
 {id:'gift-mug-c',category:'mug',priceMinor:1700,source:'FICTIONAL_CATALOG'}]);
export function findGift(maxMinor){
 if(!Number.isSafeInteger(maxMinor)||maxMinor<100||maxMinor>1000000)err('INVALID_BUDGET');
 const products=CATALOG.filter(x=>x.category==='lighting'&&x.priceMinor<=maxMinor)
  .sort((a,b)=>a.priceMinor-b.priceMinor);
 return {status:products.length?'SYNTHETIC_ITEM_SELECTED':'NO_ELIGIBLE_GIFT',
  selected:products[0]||null,accepted:products.length>0,
  comparedCatalogItems:2,checkout:'DISABLED',paymentState:'NOT_PAID'};
}
export function saveChurnOffer(){
 return {status:'DRAFT_ONLY',subscriptionId:'fictional-monthly-maintenance',
  currentMinor:2500,discountMinor:2000,alternative:'PAUSE_REQUEST',
  approvalRequired:true,paypalPlanChanged:false,source:'SYNTHETIC_SCENARIO'};
}
export function prepareInvoiceDispute(){
 return {status:'DRAFT_ONLY',invoice:{amountMinor:29900,currency:'USD',sent:false},
  dispute:{submitted:false,evidence:['Synthetic contract terms','Synthetic delivery checklist',
    'Synthetic reviewer decision']},paypalInvoiceCreated:false,source:'SYNTHETIC_SCENARIO'};
}
export function createInnovationLab({filename,now=Date.now}={}){
 if(typeof filename!=='string'||!filename||filename===':memory:')throw new TypeError('LAB_FILE_REQUIRED');
 const db=new DatabaseSync(filename);
 db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
 db.exec('CREATE TABLE IF NOT EXISTS innovation_delegations (id TEXT PRIMARY KEY,actor TEXT NOT NULL,merchant TEXT NOT NULL,category TEXT NOT NULL,cap INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0,expires INTEGER NOT NULL)');
 db.exec('CREATE TABLE IF NOT EXISTS innovation_events (id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT NOT NULL,merchant TEXT NOT NULL,kind TEXT NOT NULL,request_key TEXT NOT NULL,fingerprint TEXT NOT NULL,result TEXT NOT NULL,created INTEGER NOT NULL,UNIQUE(actor,merchant,kind,request_key))');
 const query=s=>db.prepare(s);
 function transact(fn){
  db.exec('BEGIN IMMEDIATE');
  try{const result=fn();db.exec('COMMIT');return result;}
  catch(e){db.exec('ROLLBACK');throw e;}
 }
 function action({actor,merchant,kind,key,input,execute}){
  if(!validId(actor)||!validId(merchant)||!validId(key))err('INVALID_ACTOR_OR_KEY');
  return transact(()=>{
   const fingerprint=hash(input);
   const old=query('SELECT fingerprint,result FROM innovation_events WHERE actor=? AND merchant=? AND kind=? AND request_key=?').get(actor,merchant,kind,key);
   if(old){
    if(old.fingerprint!==fingerprint)err('REPLAY_CONFLICT',409);
    return {...JSON.parse(old.result),replayed:true};
   }
   const result=execute();
   query('INSERT INTO innovation_events(actor,merchant,kind,request_key,fingerprint,result,created) VALUES(?,?,?,?,?,?,?)')
    .run(actor,merchant,kind,key,fingerprint,JSON.stringify(result),now());
   return {...result,replayed:false};
  });
 }
 const safe=x=>({...x,mode:'OFFLINE_SYNTHETIC_ONLY',providerCalls:0,paymentAuthorized:false});
 function delegate({actor,merchant,key,category,maxMinor,expiresInMinutes}={}){
  if(!['services','gifts'].includes(category)||!Number.isSafeInteger(maxMinor)||
    maxMinor<100||maxMinor>1000000||!Number.isSafeInteger(expiresInMinutes)||
    expiresInMinutes<1||expiresInMinutes>1440)err('INVALID_DELEGATION');
  return action({actor,merchant,key,kind:'delegate',input:{category,maxMinor,expiresInMinutes},
   execute:()=>{
    const consentId=randomUUID();
    query('INSERT INTO innovation_delegations(id,actor,merchant,category,cap,expires) VALUES(?,?,?,?,?,?)')
     .run(consentId,actor,merchant,category,maxMinor,now()+expiresInMinutes*60000);
    return safe({status:'SYNTHETIC_CONSENT_CREATED',consentId,category,maxMinor,
     expiryMinutes:expiresInMinutes,realPaymentDelegated:false});
   }});
 }
 function trade({actor,merchant,key,consentId,kind}={}){
  if(!['a2a','gift'].includes(kind)||!validId(consentId))err('INVALID_TRADE');
  return action({actor,merchant,key,kind,input:{consentId},execute:()=>{
   const grant=query('SELECT * FROM innovation_delegations WHERE id=? AND actor=? AND merchant=?')
    .get(consentId,actor,merchant);
   if(!grant)err('DELEGATION_NOT_FOUND',404);
   if(grant.category!==(kind==='a2a'?'services':'gifts'))err('DELEGATION_SCOPE_DENIED',403);
   if(grant.expires<=now())err('DELEGATION_EXPIRED',403);
   if(grant.used>0)err('DELEGATION_ALREADY_SPENT',409);
   const result=kind==='a2a'?negotiateA2A(grant.cap):findGift(grant.cap);
   const amount=kind==='a2a'?result.agreedMinor:result.selected?.priceMinor;
   if(result.accepted){
    if(!Number.isSafeInteger(amount)||amount>grant.cap)err('DELEGATION_CAP_DENIED',403);
    const claim=query('UPDATE innovation_delegations SET used=? WHERE id=? AND used=0 AND expires>?')
      .run(amount,consentId,now());
    if(claim.changes!==1)err('DELEGATION_ALREADY_SPENT',409);
   }
   return safe({...result,consentId,reservedMinor:result.accepted?amount:0,
    contractOnly:true,paypalCapturePerformed:false});
  }});
 }
 function skill({actor,merchant,key,kind}={}){
  if(!['churn','invoice'].includes(kind))err('UNSUPPORTED_SKILL');
  return action({actor,merchant,key,kind,input:{kind},
   execute:()=>safe(kind==='churn'?saveChurnOffer():prepareInvoiceDispute())});
 }
 function state({actor,merchant}={}){
  if(!validId(actor)||!validId(merchant))err('INVALID_ACTOR');
  const consents=query('SELECT id,category,cap AS maxMinor,used AS usedMinor,expires AS expiresAt FROM innovation_delegations WHERE actor=? AND merchant=? ORDER BY rowid DESC LIMIT 20').all(actor,merchant);
  const events=query('SELECT kind,result,created FROM innovation_events WHERE actor=? AND merchant=? ORDER BY id DESC LIMIT 30').all(actor,merchant)
   .map(x=>({kind:x.kind,result:JSON.parse(x.result),createdAt:x.created}));
  return safe({part:'PART_2',skills:['a2a','delegation','gift','churn','invoice_dispute'],
   consents:consents.map(c=>({...c,active:c.expiresAt>now()&&c.usedMinor===0})),
   events,paymentState:'NOT_PAID',realGemini:false,realPayPal:false});
 }
 return Object.freeze({delegate,trade,skill,state,close:()=>db.close()});
}
export function createInnovationApi({store,resolveSession,identityPolicy}={}){
 if(!store||typeof resolveSession!=='function'||!identityPolicy)throw new TypeError('LAB_DEPENDENCIES_REQUIRED');
 return async request=>{
  try{
   const url=new URL(request.url);
   const match=/^\/api\/demo\/innovation\/(state|delegate|a2a|gift|churn|invoice)$/.exec(url.pathname);
   if(!match||url.search)err('NOT_FOUND',404);
   const route=match[1],read=route==='state';
   if(request.method!==(read?'GET':'POST'))
    return reply({error:'METHOD_NOT_ALLOWED'},405,{allow:read?'GET':'POST'});
   const session=await resolveSession(request);
   if(!session?.verified)err('AUTHENTICATION_REQUIRED',401);
   if(session.actorId!=='synthetic-owner'||session.merchantId!=='synthetic-merchant')
    err('OWNER_ONLY',403);
   await authorizePersistedLocalAction({policy:identityPolicy,request,session,action:'marketplace.match'});
   const actor=session.actorId,merchant=session.merchantId;
   if(read)return reply(store.state({actor,merchant}));
   if(request.headers.get('origin')!==url.origin||
      request.headers.get('x-csrf-token')!==session.csrfToken)err('CSRF_REQUIRED',403);
   const body=await parseSmallJson(request),key=body.idempotencyKey;
   if(route==='delegate'){
    if(!exact(body,['idempotencyKey','category','maxMinor','expiresInMinutes']))err('INVALID_BODY');
    return reply(store.delegate({actor,merchant,key,category:body.category,
      maxMinor:body.maxMinor,expiresInMinutes:body.expiresInMinutes}),201);
   }
   if(route==='a2a'||route==='gift'){
    if(!exact(body,['idempotencyKey','consentId']))err('INVALID_BODY');
    return reply(store.trade({actor,merchant,key,kind:route,consentId:body.consentId}));
   }
   if(!exact(body,['idempotencyKey']))err('INVALID_BODY');
   return reply(store.skill({actor,merchant,key,kind:route}));
  }catch(e){return reply({error:e instanceof QuoteApiError?e.code:'INTERNAL_ERROR'},
   e instanceof QuoteApiError?e.status:500);}
 };
}
