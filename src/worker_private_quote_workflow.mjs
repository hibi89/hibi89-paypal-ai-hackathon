// Authenticated real D1 quote draft/approval; no AI/PayPal or synthetic user.
// Existing 0001 quote and immutable-when-claimed constraints remain unchanged.
import {createWorkerPrivateSessionResolver,hashPrivateSessionCookie,PrivateSessionError} from './worker_private_session_resolver.mjs';
const H={'content-type':'application/json; charset=utf-8','cache-control':'no-store, max-age=0',
 'pragma':'no-cache','vary':'Cookie','x-content-type-options':'nosniff',
 'x-frame-options':'DENY','referrer-policy':'no-referrer',
 'content-security-policy':"default-src 'none'; frame-ancestors 'none'"};
const reply=(status,obj,extra={})=>new Response(JSON.stringify({...obj,
 providerCalls:0,paymentAuthorized:false}),{status,headers:{...H,...extra}});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const APPROVE=/^\/__private\/quotes\/([A-Za-z0-9_-]{1,128})\/approve$/;
const REVISE=/^\/__private\/quotes\/([A-Za-z0-9_-]{1,128})\/revise$/;
const FRESH=`SELECT 1 FROM worker_private_sessions s
 JOIN worker_private_oidc_bindings b ON b.issuer=s.issuer AND b.subject_hmac=s.binding_subject_hmac
 WHERE s.token_sha256=? AND s.revoked_at_ms IS NULL AND s.expires_at_ms>? AND
 s.issuer_verified_at_ms<=? AND s.role='OWNER' AND b.active=1 AND b.role='OWNER' AND
 s.binding_revision=b.revision AND s.actor_id=b.actor_id AND s.merchant_id=b.merchant_id AND
 s.actor_id=? AND s.merchant_id=?`;
const INS=`INSERT INTO quotes (id,owner_id,merchant_id,version,currency,status,scope_text,suggestion_source)
 SELECT ?,s.actor_id,s.merchant_id,1,'USD','PROPOSED',?,'HUMAN_DRAFT_NO_AI'
 FROM worker_private_sessions s JOIN worker_private_oidc_bindings b
 ON b.issuer=s.issuer AND b.subject_hmac=s.binding_subject_hmac
 WHERE s.token_sha256=? AND s.revoked_at_ms IS NULL AND s.expires_at_ms>? AND
 s.issuer_verified_at_ms<=? AND s.role='OWNER' AND b.active=1 AND b.role='OWNER' AND
 s.binding_revision=b.revision AND s.actor_id=b.actor_id AND s.merchant_id=b.merchant_id AND
 s.actor_id=? AND s.merchant_id=? ON CONFLICT(id) DO NOTHING`;
const UPD=`UPDATE quotes SET status='APPROVED',approval_actor=owner_id,
 approval_version=version,approval_amount_minor=?
 WHERE id=? AND owner_id=? AND merchant_id=? AND version=? AND status='PROPOSED'
 AND EXISTS (${FRESH})`;
// One SQL CAS: existing quoted payments are immutable, no D1 migration needed.
const REV=`UPDATE quotes SET version=version+1,scope_text=?,suggestion_source='HUMAN_DRAFT_NO_AI'
 WHERE id=? AND owner_id=? AND merchant_id=? AND version=? AND status='PROPOSED'
 AND NOT EXISTS (SELECT 1 FROM payment_attempts a WHERE a.quote_id=quotes.id)
 AND EXISTS (${FRESH})`;
const LIST=`SELECT id,version,currency,status,scope_text,suggestion_source,
 approval_version,approval_amount_minor FROM quotes
 WHERE owner_id=? AND merchant_id=? ORDER BY id DESC LIMIT ?`;
const ONE=`SELECT id,version,currency,status,scope_text,suggestion_source,
 approval_version,approval_amount_minor FROM quotes
 WHERE id=? AND owner_id=? AND merchant_id=?`;
function mapQuote(row){
 if(!row||!ID.test(row.id)||!Number.isSafeInteger(row.version)||row.version<1||
    row.currency!=='USD'||!['PROPOSED','APPROVED'].includes(row.status)||
    (row.scope_text!==null&&(typeof row.scope_text!=='string'||row.scope_text.length>600))||
    (row.status==='APPROVED'&&(!Number.isSafeInteger(row.approval_amount_minor)||
      row.approval_amount_minor<100||row.approval_amount_minor>1000000||
      row.approval_version!==row.version)))throw Error('INVALID_QUOTE_ROW');
 return {quoteId:row.id,version:row.version,currency:'USD',status:row.status,
  scopeText:row.scope_text,approvedAmountMinor:row.status==='APPROVED'?row.approval_amount_minor:null,
  source:row.suggestion_source==='HUMAN_DRAFT_NO_AI'?'HUMAN_DRAFT_NO_AI':'OTHER',
  paymentState:'NOT_AUTHORIZED'};
}
const changes=r=>{const n=r?.meta?.changes;if(!Number.isSafeInteger(n)||n<0||n>1)throw Error('INVALID_WRITE_RESULT');return n};
async function smallJson(req,bodyReadTimeoutMs){
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers.get('content-type')??''))
  throw Error('BAD_TYPE');
 const header=req.headers.get('content-length');
 if(header!==null&&(!/^\d{1,5}$/.test(header)||Number(header)>4096))throw Error('OVERSIZE');
 if(!req.body)throw Error('NO_BODY');
 // An absolute upload deadline cannot be extended by slow trickle.
 // A malicious stream may ignore cancellation, so never await cancel().
 const reader=req.body.getReader(),chunks=[];let size=0,timer,onAbort;
 const deadline=new Promise((_,reject)=>{
  timer=setTimeout(()=>reject(Error('BODY_READ_TIMEOUT')),bodyReadTimeoutMs);
 });
 const aborted=new Promise((_,reject)=>{
  onAbort=()=>reject(Error('BODY_ABORTED'));
  req.signal.addEventListener('abort',onAbort,{once:true});
  if(req.signal.aborted)onAbort();
 });
 try{while(true){
  const {value,done}=await Promise.race([reader.read(),deadline,aborted]);
  if(done)break;
  if(!(value instanceof Uint8Array)||(size+=value.byteLength)>4096)throw Error('OVERSIZE');
  chunks.push(value);
 }}finally{
  clearTimeout(timer);
  req.signal.removeEventListener('abort',onAbort);
  try{const cancellation=reader.cancel();cancellation?.catch?.(()=>{});}catch{}
  try{reader.releaseLock()}catch{}
 }
 const bytes=new Uint8Array(size);let offset=0;
 for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength}
 const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('BAD_JSON');
 return data;
}

const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
async function requestQuoteId(actor,merchant,requestId){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(
  'proofline:quote:v1\0'+actor+'\0'+merchant+'\0'+requestId));
 return 'q_'+hex(bytes).slice(0,32);
}
export function createWorkerPrivateQuoteWorkflow({db,allowedOrigin,now=Date.now,bodyReadTimeoutMs=2000}={}){
 let origin;
 try{const u=new URL(allowedOrigin);if(u.protocol==='https:'&&u.origin===allowedOrigin&&!u.username&&!u.password)origin=allowedOrigin}catch{}
 if(!origin||typeof db?.withSession!=='function'||typeof now!=='function'||
    !Number.isSafeInteger(bodyReadTimeoutMs)||bodyReadTimeoutMs<100||bodyReadTimeoutMs>5000)
  throw Error('QUOTE_WORKFLOW_DEPENDENCIES_REQUIRED');
 const resolve=createWorkerPrivateSessionResolver({db,now});
 return Object.freeze({async fetch(request){
  if(!(request instanceof Request))return reply(400,{error:'INVALID_REQUEST'});
  let url;try{url=new URL(request.url)}catch{return reply(400,{error:'INVALID_REQUEST'})}
  if(url.origin!==origin)return reply(403,{error:'ORIGIN_NOT_ALLOWED'});
  const approval=APPROVE.exec(url.pathname),revision=REVISE.exec(url.pathname),
   collection=url.pathname==='/__private/quotes';
  if((!collection&&!approval&&!revision)||url.hash)return reply(404,{error:'NOT_FOUND'});
  const listing=collection&&request.method==='GET',draft=collection&&request.method==='POST',
   approving=!!approval&&request.method==='POST',
   revising=!!revision&&request.method==='POST';
  if(!listing&&!draft&&!approving&&!revising)return reply(405,{error:'METHOD_NOT_ALLOWED'},
   {allow:collection?'GET, POST':'POST'});
  const site=request.headers.get('sec-fetch-site');
  if(site&&!['same-origin','none'].includes(site))return reply(403,{error:'CROSS_SITE_BLOCKED'});
  const from=request.headers.get('origin');
  if(from&&from!==origin)return reply(403,{error:'ORIGIN_NOT_ALLOWED'});
  if(draft||approving||revising){
   if(from!==origin||!['same-origin','none'].includes(site)||
      request.headers.get('x-proofline-intent')!==(draft?'quote-draft':
        approving?'quote-approve':'quote-revise'))
    return reply(403,{error:'WRITE_INTENT_REQUIRED'});
  }
  let limit=10;
  if(listing){
   const keys=[...url.searchParams.keys()];
   if(keys.length>1||keys.some(k=>k!=='limit')||
      (url.searchParams.has('limit')&&!/^(?:[1-9]|1[0-9]|20)$/.test(url.searchParams.get('limit')??'')))
    return reply(400,{error:'INVALID_QUERY'});
   if(url.searchParams.has('limit'))limit=Number(url.searchParams.get('limit'));
  }else if(url.search)return reply(400,{error:'INVALID_QUERY'});
  let identity;
  try{identity=await resolve(request)}catch(e){
   return reply(e instanceof PrivateSessionError&&e.code==='SESSION_STORE_UNAVAILABLE'?503:401,
    {error:e?.code==='SESSION_STORE_UNAVAILABLE'?'DEPENDENCY_UNAVAILABLE':'UNAUTHENTICATED'});
  }
  let data;
  if(!listing){try{data=await smallJson(request,bodyReadTimeoutMs)}catch{return reply(400,{error:'INVALID_BODY'})}}
  const t=now();
  if(!Number.isSafeInteger(t)||t<=0)return reply(503,{error:'DEPENDENCY_UNAVAILABLE'});
  let result;
  try{
   const dbp=db.withSession('first-primary');
   if(!dbp?.prepare)throw Error('D1_UNAVAILABLE');
   const actor=identity.actorId,merchant=identity.merchantId;
   if(listing){
    const rows=(await dbp.prepare(LIST).bind(actor,merchant,limit).all())?.results;
    if(!Array.isArray(rows)||rows.length>limit)throw Error('INVALID_ROWS');
    result=reply(200,{quotes:rows.map(mapQuote),count:rows.length,source:'D1_OWNER_QUOTES',
      verifiedPayPalGet:false});
   }else if(draft){
    if(Object.keys(data).sort().join(',')!=='clientRequestId,scopeText'||
       !UUID.test(data.clientRequestId??'')||typeof data.scopeText!=='string'||
       data.scopeText.trim().length<12||data.scopeText.length>600||
       /[\x00-\x1f\x7f]/.test(data.scopeText))
     return reply(400,{error:'INVALID_DRAFT'});
    const scope=data.scopeText.trim();
    const id=await requestQuoteId(actor,merchant,data.clientRequestId);
    const written=changes(await dbp.prepare(INS).bind(id,scope,
      await hashPrivateSessionCookie(request),t,t,actor,merchant).run());
    const item=mapQuote(await dbp.prepare(ONE).bind(id,actor,merchant).first());
    if(item.scopeText!==scope)return reply(409,{error:'QUOTE_IDEMPOTENCY_CONFLICT'});
    result=reply(written?201:200,{quote:item,created:written===1,idempotentReplay:written===0});
   }else if(revising){
    if(Object.keys(data).sort().join(',')!=='expectedVersion,scopeText'||
       !Number.isSafeInteger(data.expectedVersion)||data.expectedVersion<1||
       data.expectedVersion>=Number.MAX_SAFE_INTEGER||
       typeof data.scopeText!=='string'||data.scopeText.trim().length<12||
       data.scopeText.length>600||/[\x00-\x1f\x7f]/.test(data.scopeText))
      return reply(400,{error:'INVALID_REVISION'});
    const scope=data.scopeText.trim();
    const written=changes(await dbp.prepare(REV).bind(scope,revision[1],
      actor,merchant,data.expectedVersion,await hashPrivateSessionCookie(request),
      t,t,actor,merchant).run());
    const row=await dbp.prepare(ONE).bind(revision[1],actor,merchant).first();
    if(!row)return reply(404,{error:'QUOTE_NOT_FOUND'});
    if(written!==1)return reply(409,{error:'QUOTE_REVISION_CONFLICT'});
    const item=mapQuote(row);
    if(item.version!==data.expectedVersion+1||item.status!=='PROPOSED'||
       item.scopeText!==scope)throw Error('REVISION_PROOF_INVALID');
    result=reply(200,{quote:item,revised:true,humanApprovalRequired:true});
   }else{
    if(Object.keys(data).sort().join(',')!=='amountMinor,expectedVersion'||
       !Number.isSafeInteger(data.amountMinor)||data.amountMinor<100||
       data.amountMinor>1000000||!Number.isSafeInteger(data.expectedVersion)||data.expectedVersion<1)
     return reply(400,{error:'INVALID_APPROVAL'});
    const written=changes(await dbp.prepare(UPD).bind(data.amountMinor,approval[1],
      actor,merchant,data.expectedVersion,await hashPrivateSessionCookie(request),
      t,t,actor,merchant).run());
    const row=await dbp.prepare(ONE).bind(approval[1],actor,merchant).first();
    if(!row)return reply(404,{error:'QUOTE_NOT_FOUND'});
    const item=mapQuote(row);
    if(!written&&!(item.status==='APPROVED'&&item.version===data.expectedVersion&&
       item.approvedAmountMinor===data.amountMinor))
     return reply(409,{error:'QUOTE_APPROVAL_CONFLICT'});
    result=reply(200,{quote:item,approved:written===1,
      idempotentReplay:written===0,humanApproval:true});
   }
  }catch{return reply(503,{error:'DEPENDENCY_UNAVAILABLE'})}
  try{const latest=await resolve(request);
   if(latest.actorId!==identity.actorId||latest.merchantId!==identity.merchantId)throw Error('REVOKED')
  }catch{return reply(401,{error:'UNAUTHENTICATED'})}
  return result;
 }});
}
