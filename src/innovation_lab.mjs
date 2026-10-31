// Proofline Part 2: offline five-skill lab. No AI or payment transport.
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';
import {QuoteApiError,reply,parseSmallJson} from './quote_api.mjs';
import {authorizePersistedLocalAction} from './marketplace_identity_policy.mjs';
import {runBoundedA2A,createOfflineRoleAgents} from './agentic_a2a_protocol.mjs';
import {buildSyntheticMerchantDossier} from './merchant_dossier.mjs';
import {buildSyntheticChurnProposal} from './churn_retention_policy.mjs';
import {selectSyntheticGift} from './gift_policy.mjs';
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
export function saveChurnOffer(input){
 if(input!==undefined)return buildSyntheticChurnProposal(input);
 return {status:'DRAFT_ONLY',subscriptionId:'fictional-monthly-maintenance',
  currentMinor:2500,discountMinor:2000,alternative:'PAUSE_REQUEST',
  approvalRequired:true,paypalPlanChanged:false,source:'SYNTHETIC_SCENARIO'};
}
export function prepareInvoiceDispute(input){
 if(input!==undefined)return buildSyntheticMerchantDossier(input);
 return {status:'DRAFT_ONLY',invoice:{amountMinor:29900,currency:'USD',sent:false},
  dispute:{submitted:false,evidence:['Synthetic contract terms','Synthetic delivery checklist',
    'Synthetic reviewer decision']},paypalInvoiceCreated:false,source:'SYNTHETIC_SCENARIO'};
}
export function createInnovationLab({filename,now=Date.now,agentsFactory=createOfflineRoleAgents}={}){
 if(typeof agentsFactory!=='function'||typeof now!=='function')throw new TypeError('AGENTS_FACTORY_REQUIRED');
 if(typeof filename!=='string'||!filename||filename===':memory:')throw new TypeError('LAB_FILE_REQUIRED');
 const db=new DatabaseSync(filename);
 db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
 db.exec('CREATE TABLE IF NOT EXISTS innovation_delegations (id TEXT PRIMARY KEY,actor TEXT NOT NULL,merchant TEXT NOT NULL,category TEXT NOT NULL,cap INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0,expires INTEGER NOT NULL)');
 db.exec('CREATE TABLE IF NOT EXISTS innovation_events (id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT NOT NULL,merchant TEXT NOT NULL,kind TEXT NOT NULL,request_key TEXT NOT NULL,fingerprint TEXT NOT NULL,result TEXT NOT NULL,created INTEGER NOT NULL,UNIQUE(actor,merchant,kind,request_key))');
 // Non-destructive migration for older temporary fixtures.
 const cols=db.prepare('PRAGMA table_info(innovation_delegations)').all().map(c=>c.name);
 if(!cols.includes('revoked'))db.exec('ALTER TABLE innovation_delegations ADD COLUMN revoked INTEGER NOT NULL DEFAULT 0');
 if(!cols.includes('revision'))db.exec('ALTER TABLE innovation_delegations ADD COLUMN revision INTEGER NOT NULL DEFAULT 1');
 db.exec("CREATE TABLE IF NOT EXISTS innovation_a2a_attempts (actor TEXT NOT NULL,merchant TEXT NOT NULL,request_key TEXT NOT NULL,consent_id TEXT NOT NULL UNIQUE,fingerprint TEXT NOT NULL,revision INTEGER NOT NULL,cap INTEGER NOT NULL,expires INTEGER NOT NULL,state TEXT NOT NULL,result TEXT,created INTEGER NOT NULL,PRIMARY KEY(actor,merchant,request_key))");
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
 function trade({actor,merchant,key,consentId,kind,giftPreferences}={}){
  if(!['a2a','gift'].includes(kind)||!validId(consentId))err('INVALID_TRADE');
  if(giftPreferences!==undefined&&kind!=='gift')err('INVALID_TRADE');
  return action({actor,merchant,key,kind,
   input:giftPreferences===undefined?{consentId}:{consentId,giftPreferences},
   execute:()=>{
   const grant=query('SELECT * FROM innovation_delegations WHERE id=? AND actor=? AND merchant=?')
    .get(consentId,actor,merchant);
   if(!grant)err('DELEGATION_NOT_FOUND',404);
   if(grant.category!==(kind==='a2a'?'services':'gifts'))err('DELEGATION_SCOPE_DENIED',403);
   if(grant.expires<=now())err('DELEGATION_EXPIRED',403);
   if(grant.revoked)err('DELEGATION_REVOKED',403);
   if(query('SELECT 1 FROM innovation_a2a_attempts WHERE consent_id=?').get(consentId))err('DELEGATION_ALREADY_CLAIMED',409);
   if(grant.used>0)err('DELEGATION_ALREADY_SPENT',409);
   let result;
   if(kind==='a2a')result=negotiateA2A(grant.cap);
   else if(giftPreferences!==undefined){
    try{result=selectSyntheticGift(giftPreferences);}
    catch(e){if(e?.code==='INVALID_SYNTHETIC_GIFT_PREFERENCES')err(e.code);throw e;}
    if(result.maxPriceMinor>grant.cap)err('DELEGATION_CAP_DENIED',403);
   }else result=findGift(grant.cap);
   const amount=kind==='a2a'?result.agreedMinor:result.selected?.priceMinor;
   if(result.accepted){
    if(!Number.isSafeInteger(amount)||amount>grant.cap||
       (giftPreferences!==undefined&&amount>giftPreferences.maxPriceMinor))
     err('DELEGATION_CAP_DENIED',403);
    const claim=query('UPDATE innovation_delegations SET used=? WHERE id=? AND used=0 AND expires>?')
      .run(amount,consentId,now());
    if(claim.changes!==1)err('DELEGATION_ALREADY_SPENT',409);
   }
   return safe({...result,consentId,reservedMinor:result.accepted?amount:0,
    contractOnly:true,paypalCapturePerformed:false});
  }});
 }
 
 // CLAIM -> asynchronous role-agent dialogue -> COMPARE AND SWAP completion.
 // Never await a model or external service within a SQLite write transaction.
 function claimA2A({actor,merchant,key,consentId}){
  if(!validId(actor)||!validId(merchant)||!validId(key)||!validId(consentId))err('INVALID_A2A_INPUT');
  return transact(()=>{
   const fingerprint=hash({consentId});
   const done=query('SELECT fingerprint,result FROM innovation_events WHERE actor=? AND merchant=? AND kind=? AND request_key=?').get(actor,merchant,'a2a',key);
   if(done){
    if(done.fingerprint!==fingerprint)err('REPLAY_CONFLICT',409);
    return {replayed:true,result:{...JSON.parse(done.result),replayed:true}};
   }
   const old=query('SELECT * FROM innovation_a2a_attempts WHERE actor=? AND merchant=? AND request_key=?').get(actor,merchant,key);
   if(old){
    if(old.fingerprint!==fingerprint)err('REPLAY_CONFLICT',409);
    err('A2A_PENDING_OR_UNKNOWN',409); // crash-safe: never invoke a model twice
   }
   const mandate=query('SELECT * FROM innovation_delegations WHERE id=? AND actor=? AND merchant=?').get(consentId,actor,merchant);
   if(!mandate)err('DELEGATION_NOT_FOUND',404);
   if(mandate.category!=='services')err('DELEGATION_SCOPE_DENIED',403);
   if(mandate.revoked)err('DELEGATION_REVOKED',403);
   if(mandate.expires<=now())err('DELEGATION_EXPIRED',403);
   if(mandate.used!==0)err('DELEGATION_ALREADY_SPENT',409);
   if(query('SELECT 1 FROM innovation_a2a_attempts WHERE consent_id=?').get(consentId))err('DELEGATION_ALREADY_CLAIMED',409);
   query('INSERT INTO innovation_a2a_attempts(actor,merchant,request_key,consent_id,fingerprint,revision,cap,expires,state,created) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(actor,merchant,key,consentId,fingerprint,mandate.revision,mandate.cap,mandate.expires,'PENDING',now());
   return {replayed:false,cap:mandate.cap};
  });
 }
 function completeA2A({actor,merchant,key,consentId},result){
  return transact(()=>{
   const attempt=query('SELECT * FROM innovation_a2a_attempts WHERE actor=? AND merchant=? AND request_key=? AND consent_id=?').get(actor,merchant,key,consentId);
   if(!attempt||attempt.state!=='PENDING')err('A2A_NOT_PENDING',409);
   const mandate=query('SELECT * FROM innovation_delegations WHERE id=? AND actor=? AND merchant=?').get(consentId,actor,merchant);
   const stillValid=mandate&&mandate.revoked===0&&mandate.used===0&&
    mandate.expires>now()&&mandate.revision===attempt.revision&&
    mandate.cap===attempt.cap&&mandate.expires===attempt.expires;
   const success=stillValid&&result.status==='AGREED_OFFLINE_CONTRACT'&&
    Number.isSafeInteger(result.agreedMinor)&&result.agreedMinor>=27000&&
    result.agreedMinor<=attempt.cap;
   if(success){
    const written=query('UPDATE innovation_delegations SET used=? WHERE id=? AND actor=? AND merchant=? AND revoked=0 AND used=0 AND revision=? AND expires>?')
     .run(result.agreedMinor,consentId,actor,merchant,attempt.revision,now());
    if(written.changes!==1)err('CONCURRENT_MANDATE_MODIFICATION',409);
   }
   const record=safe({...result,consentId,protocolStatus:result.status,
    status:!stillValid?'BLOCKED_DELEGATION_CHANGED':success?'SYNTHETIC_AGREEMENT':result.status,
    accepted:!!success,reservedMinor:success?result.agreedMinor:0,
    agentMode:'SEPARATE_OFFLINE_ROLE_AGENTS',paymentState:'NOT_PAID',
    paypalCapturePerformed:false,contractOnly:true,checkout:'DISABLED'});
   query('INSERT INTO innovation_events(actor,merchant,kind,request_key,fingerprint,result,created) VALUES(?,?,?,?,?,?,?)')
    .run(actor,merchant,'a2a',key,attempt.fingerprint,JSON.stringify(record),now());
   query('UPDATE innovation_a2a_attempts SET state=?,result=? WHERE actor=? AND merchant=? AND request_key=?')
    .run('DONE',JSON.stringify(record),actor,merchant,key);
   return {...record,replayed:false};
  });
 }
 async function a2a(input){
  const claimed=claimA2A(input);
  if(claimed.replayed)return claimed.result;
  let result;
  try{
   const {buyerAgent,sellerAgent}=agentsFactory();
   result=await runBoundedA2A({buyerAgent,sellerAgent,buyerMaxMinor:claimed.cap,
    sellerMinMinor:27000,maxTurns:8,turnTimeoutMs:1000});
  }catch{
   result={status:'BLOCKED',reason:'TRUSTED_AGENT_ADAPTER_FAILED',
    messages:[],agreedMinor:null,transcriptSha256:null,
    paymentAuthorized:false,providerCalls:0,paypalCapturePerformed:false};
  }
  return completeA2A(input,result);
 }
 function revoke({actor,merchant,key,consentId}={}){
  if(!validId(consentId))err('INVALID_CONSENT_ID');
  return action({actor,merchant,kind:'revoke',key,input:{consentId},execute:()=>{
   const mandate=query('SELECT * FROM innovation_delegations WHERE id=? AND actor=? AND merchant=?').get(consentId,actor,merchant);
   if(!mandate)err('DELEGATION_NOT_FOUND',404);
   if(mandate.used!==0)err('DELEGATION_ALREADY_SPENT',409);
   if(mandate.revoked)err('DELEGATION_ALREADY_REVOKED',409);
   query('UPDATE innovation_delegations SET revoked=1,revision=revision+1 WHERE id=?').run(consentId);
   return safe({status:'DELEGATION_REVOKED',consentId,paymentState:'NOT_PAID'});
  }});
 }
 function skill({actor,merchant,key,kind,dossierInput,churnInput}={}){
  if(!['churn','invoice'].includes(kind))err('UNSUPPORTED_SKILL');
  if((kind!=='invoice'&&dossierInput!==undefined)||
     (kind!=='churn'&&churnInput!==undefined))err('INVALID_BODY');
  const input=kind==='invoice'?dossierInput:churnInput;
  return action({actor,merchant,key,kind,
   input:input===undefined?{kind}:(kind==='invoice'?{kind,dossierInput}:{kind,churnInput}),
   execute:()=>{
    let draft;
    try{draft=kind==='churn'?saveChurnOffer(churnInput):prepareInvoiceDispute(dossierInput);}
    catch(e){
     if(e?.code==='INVALID_SYNTHETIC_DOSSIER'||e?.code==='INVALID_SYNTHETIC_CHURN')
      err(e.code);
     throw e;
    }
    return safe(draft);
   }});
 }
 function state({actor,merchant}={}){
  if(!validId(actor)||!validId(merchant))err('INVALID_ACTOR');
  const consents=query('SELECT id,category,cap AS maxMinor,used AS usedMinor,expires AS expiresAt,revoked,revision FROM innovation_delegations WHERE actor=? AND merchant=? ORDER BY rowid DESC LIMIT 20').all(actor,merchant);
  const pendingAttempts=query("SELECT consent_id AS consentId,request_key AS requestKey,created AS createdAt FROM innovation_a2a_attempts WHERE actor=? AND merchant=? AND state='PENDING' ORDER BY created DESC LIMIT 10").all(actor,merchant);
  const events=query('SELECT kind,result,created FROM innovation_events WHERE actor=? AND merchant=? ORDER BY id DESC LIMIT 30').all(actor,merchant)
   .map(x=>({kind:x.kind,result:JSON.parse(x.result),createdAt:x.created}));
  return safe({part:'PART_2',skills:['a2a','delegation','gift','churn','invoice_dispute'],
   consents:consents.map(c=>({...c,active:!c.revoked&&c.expiresAt>now()&&c.usedMinor===0})),pendingAttempts,
   events,paymentState:'NOT_PAID',realGemini:false,realPayPal:false});
 }
 return Object.freeze({delegate,trade,a2a,revoke,skill,state,close:()=>db.close()});
}
export function createInnovationApi({store,resolveSession,identityPolicy}={}){
 if(!store||typeof store.a2a!=='function'||typeof store.revoke!=='function'||typeof resolveSession!=='function'||!identityPolicy)throw new TypeError('LAB_DEPENDENCIES_REQUIRED');
 return async request=>{
  try{
   const url=new URL(request.url);
   const match=/^\/api\/demo\/innovation\/(state|delegate|revoke|a2a|gift|churn|invoice)$/.exec(url.pathname);
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
   if(route==='revoke'){
    if(!exact(body,['idempotencyKey','consentId']))err('INVALID_BODY');
    return reply(store.revoke({actor,merchant,key,consentId:body.consentId}));
   }
   if(route==='a2a'||route==='gift'){
    const typedGift=route==='gift'&&exact(body,[
     'idempotencyKey','consentId','category','style','priority','maxPriceMinor'
    ]);
    if(!exact(body,['idempotencyKey','consentId'])&&!typedGift)
     err('INVALID_BODY');
    const giftPreferences=typedGift?{
     category:body.category,style:body.style,priority:body.priority,
     maxPriceMinor:body.maxPriceMinor
    }:undefined;
    return reply(route==='a2a'
     ?await store.a2a({actor,merchant,key,consentId:body.consentId})
     :store.trade({actor,merchant,key,kind:route,consentId:body.consentId,
       giftPreferences}));
   }
   if(route==='churn'&&exact(body,[
    'idempotencyKey','subscriptionRef','currentMinor','remainingMonths',
    'churnRisk','maxDiscountBps','pauseAllowed'
   ])){
    return reply(store.skill({actor,merchant,key,kind:'churn',churnInput:{
     subscriptionRef:body.subscriptionRef,currentMinor:body.currentMinor,
     remainingMonths:body.remainingMonths,churnRisk:body.churnRisk,
     maxDiscountBps:body.maxDiscountBps,pauseAllowed:body.pauseAllowed
    }}));
   }
   if(route==='invoice'&&exact(body,[
    'idempotencyKey','contractRef','amountMinor','issueType',
    'deliveryStatus','evidenceKinds'
   ])){
    return reply(store.skill({actor,merchant,key,kind:'invoice',dossierInput:{
     contractRef:body.contractRef,amountMinor:body.amountMinor,
     issueType:body.issueType,deliveryStatus:body.deliveryStatus,
     evidenceKinds:body.evidenceKinds
    }}));
   }
   if(!exact(body,['idempotencyKey']))err('INVALID_BODY');
   return reply(store.skill({actor,merchant,key,kind:route}));
  }catch(e){return reply({error:e instanceof QuoteApiError?e.code:'INTERNAL_ERROR'},
   e instanceof QuoteApiError?e.status:500);}
 };
}
