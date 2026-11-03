// NON-DEFAULT Worker/D1 Part1 contract workflow candidate.
// Verified principal is injected ONLY by a separately reviewed OIDC host.
// Buyer/seller/reviewer grants are operator-preprovisioned D1 data, never
// request JSON/headers. No user registration, PayPal, Gemini or public route.
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const SHORT=/^[A-Za-z0-9_-]{1,64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLLECTION='/__private/contracts';
const ACTION=/^\/__private\/contracts\/([A-Za-z0-9_-]{1,128})\/milestones\/([A-Za-z0-9_-]{1,64})\/(submit|accept|reject)$/;
const H={'content-type':'application/json; charset=utf-8','cache-control':'no-store, max-age=0',
 'pragma':'no-cache','vary':'Cookie','x-content-type-options':'nosniff',
 'x-frame-options':'DENY','referrer-policy':'no-referrer',
 'content-security-policy':"default-src 'none'; frame-ancestors 'none'"};
const reply=(status,body)=>new Response(JSON.stringify({...body,paymentAuthorized:false,
 providerCalls:0}),{status,headers:H});
const MEMBERSHIP=`SELECT role,revision FROM worker_contract_memberships
 WHERE actor_id=? AND merchant_id=? AND active=1`;
const AUTH=`EXISTS(SELECT 1 FROM worker_contract_memberships g
 WHERE g.actor_id=? AND g.merchant_id=? AND g.active=1 AND
 g.role=? AND g.revision=?)`;
const CREATE=`INSERT INTO worker_contracts(
 id,quote_id,merchant_id,buyer_id,seller_id,reviewer_id,milestone_id,
 milestone_title,amount_minor,currency,state,version,last_event_id,
 last_action,last_actor_id,last_detail,created_at_ms)
 SELECT ?,q.id,q.merchant_id,q.owner_id,?,?,?,?,
 q.approval_amount_minor,'USD','PENDING',1,?,'CREATE',q.owner_id,'',?
 FROM quotes q
 JOIN worker_contract_memberships buyer ON buyer.actor_id=q.owner_id
 AND buyer.merchant_id=q.merchant_id AND buyer.role='BUYER' AND buyer.active=1
 JOIN worker_contract_memberships seller ON seller.actor_id=?
 AND seller.merchant_id=q.merchant_id AND seller.role='SELLER' AND seller.active=1
 JOIN worker_contract_memberships reviewer ON reviewer.actor_id=?
 AND reviewer.merchant_id=q.merchant_id AND reviewer.role='REVIEWER' AND reviewer.active=1
 WHERE q.id=? AND q.owner_id=? AND q.merchant_id=? AND q.version=?
 AND q.status='APPROVED' AND q.approval_actor=q.owner_id
 AND q.approval_version=q.version AND q.approval_amount_minor BETWEEN 100 AND 1000000
 AND buyer.revision=? ON CONFLICT DO NOTHING`;
const ONE=`SELECT id,quote_id,merchant_id,buyer_id,seller_id,reviewer_id,
 milestone_id,milestone_title,amount_minor,currency,state,version,
 last_event_id,last_action,last_actor_id,last_detail
 FROM worker_contracts WHERE id=? AND merchant_id=?`;
const LIST=`SELECT id,quote_id,merchant_id,buyer_id,seller_id,reviewer_id,
 milestone_id,milestone_title,amount_minor,currency,state,version,
 last_event_id,last_action,last_actor_id,last_detail
 FROM worker_contracts WHERE merchant_id=? AND
 ((?='BUYER' AND buyer_id=?) OR (?='SELLER' AND seller_id=?) OR
 (?='REVIEWER' AND reviewer_id=?)) ORDER BY id DESC LIMIT ?`;
const UPDATE=`UPDATE worker_contracts SET state=?,version=version+1,
 last_event_id=?,last_action=?,last_actor_id=?,last_detail=?
 WHERE id=? AND milestone_id=? AND merchant_id=? AND version=? AND
 state IN (?,?) AND
 ((?='SELLER' AND seller_id=?) OR (?='REVIEWER' AND reviewer_id=?))
 AND ${AUTH}`;
const stateOf=x=>x==='submit'?'SUBMITTED':x==='accept'?'ACCEPTED':'REJECTED';
const roleOf=x=>x==='submit'?'SELLER':'REVIEWER';
const actionOf=x=>x.toUpperCase();
const changes=result=>{
 const n=result?.meta?.changes;
 if(!Number.isSafeInteger(n)||n<0||n>1)throw Error('D1_WRITE_RESULT_UNAVAILABLE');
 return n;
};
function mapRow(row){
 if(!row||!ID.test(row.id)||!ID.test(row.quote_id)||!ID.test(row.merchant_id)||
    !ID.test(row.buyer_id)||!ID.test(row.seller_id)||!ID.test(row.reviewer_id)||
    !SHORT.test(row.milestone_id)||typeof row.milestone_title!=='string'||
    row.milestone_title.length<12||row.milestone_title.length>160||
    !Number.isSafeInteger(row.amount_minor)||row.amount_minor<100||
    row.amount_minor>1000000||row.currency!=='USD'||
    !['PENDING','SUBMITTED','REJECTED','ACCEPTED'].includes(row.state)||
    !Number.isSafeInteger(row.version)||row.version<1||
    !ID.test(row.last_event_id)||!['CREATE','SUBMIT','ACCEPT','REJECT'].includes(row.last_action))
   throw Error('INVALID_CONTRACT_ROW');
 return Object.freeze({
  contractId:row.id,quoteId:row.quote_id,milestoneId:row.milestone_id,
  milestoneTitle:row.milestone_title,amountMinor:row.amount_minor,
  currency:'USD',state:row.state,version:row.version,
  buyerId:row.buyer_id,sellerId:row.seller_id,reviewerId:row.reviewer_id,
  lastAction:row.last_action,paymentState:'NOT_AUTHORIZED'
 });
}
async function parseSmallJson(request){
 const type=request.headers.get('content-type')??'';
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(type))throw Error('BAD_TYPE');
 const len=request.headers.get('content-length');
 if(len!==null&&(!/^\d{1,5}$/.test(len)||Number(len)>4096))throw Error('BODY_TOO_LARGE');
 if(!request.body)throw Error('BODY_REQUIRED');
 const reader=request.body.getReader(),parts=[];let total=0;
 try{while(true){
  const {done,value}=await reader.read();if(done)break;
  if(!(value instanceof Uint8Array)||(total+=value.length)>4096)throw Error('BODY_TOO_LARGE');
  parts.push(value);
 }}finally{try{await reader.cancel()}catch{}try{reader.releaseLock()}catch{}}
 const buffer=new Uint8Array(total);let at=0;
 for(const part of parts){buffer.set(part,at);at+=part.length;}
 const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('NOT_OBJECT');
 return parsed;
}
const exact=(body,names)=>Object.keys(body).sort().join(',')===names.slice().sort().join(',');
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
async function contractKey(scope){
 const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(scope));
 return 'ctr_'+hex(b).slice(0,32);
}
export function createWorkerD1ContractFlow({db,allowedOrigin,resolveVerifiedPrincipal,now=Date.now}={}){
 let origin;
 try{const u=new URL(allowedOrigin);
  if(typeof allowedOrigin==='string'&&u.protocol==='https:'&&u.origin===allowedOrigin&&
     !u.username&&!u.password)origin=allowedOrigin;}catch{}
 if(!origin||typeof db?.withSession!=='function'||typeof resolveVerifiedPrincipal!=='function'||
    typeof now!=='function')throw Error('CONTRACT_TRUSTED_D1_DEPENDENCIES_REQUIRED');
 const primary=()=>{
  const session=db.withSession('first-primary');
  if(typeof session?.prepare!=='function')throw Error('D1_PRIMARY_REQUIRED');
  return session;
 };
 async function trusted(req){
  const p=await resolveVerifiedPrincipal(req);
  if(p?.verified!==true||!ID.test(p.actorId)||!ID.test(p.merchantId))
   throw Error('VERIFIED_OIDC_PRINCIPAL_REQUIRED');
  return {actor:p.actorId,merchant:p.merchantId};
 }
 async function grant(dbp,scope){
  const g=await dbp.prepare(MEMBERSHIP).bind(scope.actor,scope.merchant).first();
  if(!g||!['BUYER','SELLER','REVIEWER'].includes(g.role)||
     !Number.isSafeInteger(g.revision)||g.revision<1)
   throw Error('PREPROVISIONED_CONTRACT_ROLE_REQUIRED');
  return {role:g.role,revision:g.revision};
 }
 async function current(req,scope,previous){
  const same=await trusted(req);
  if(same.actor!==scope.actor||same.merchant!==scope.merchant)
   throw Error('PRINCIPAL_CHANGED');
  const g=await grant(primary(),scope);
  if(g.role!==previous.role||g.revision!==previous.revision)
   throw Error('GRANT_REVOKED_OR_CHANGED');
 }
 return Object.freeze({async fetch(request){
  if(!(request instanceof Request))return reply(400,{error:'INVALID_REQUEST'});
  let url;try{url=new URL(request.url)}catch{return reply(400,{error:'INVALID_REQUEST'});}
  if(url.origin!==origin||url.username||url.password)return reply(403,{error:'ORIGIN_NOT_ALLOWED'});
  const event=ACTION.exec(url.pathname),collection=url.pathname===COLLECTION;
  if(!collection&&!event||url.hash)return reply(404,{error:'NOT_FOUND'});
  if(collection&&!['GET','POST'].includes(request.method)||
     event&&request.method!=='POST')return reply(405,{error:'METHOD_NOT_ALLOWED'});
  const site=request.headers.get('sec-fetch-site');
  if(site&&site!=='none'&&site!=='same-origin')return reply(403,{error:'CROSS_SITE_BLOCKED'});
  const from=request.headers.get('origin');
  if(from&&from!==origin)return reply(403,{error:'ORIGIN_NOT_ALLOWED'});
  if(request.method==='POST'&&(from!==origin||!['same-origin','none'].includes(site)||
     request.headers.get('x-proofline-intent')!==(collection?'contract-create':'contract-'+event[3])))
   return reply(403,{error:'EXPLICIT_WRITE_INTENT_REQUIRED'});
  let limit=10;
  if(collection&&request.method==='GET'){
   const keys=[...url.searchParams.keys()];
   if(keys.length>1||keys.some(x=>x!=='limit')||
      (url.searchParams.has('limit')&&!/^(?:[1-9]|1[0-9]|20)$/.test(url.searchParams.get('limit')??'')))
    return reply(400,{error:'INVALID_QUERY'});
   if(url.searchParams.has('limit'))limit=Number(url.searchParams.get('limit'));
  }else if(url.search)return reply(400,{error:'INVALID_QUERY'});
  let scope,g,dbp;
  try{scope=await trusted(request);dbp=primary();g=await grant(dbp,scope);}
  catch{return reply(401,{error:'UNAUTHENTICATED_OR_ROLE_UNAVAILABLE'});}
  let body;
  if(request.method==='POST')try{body=await parseSmallJson(request);}
   catch{return reply(400,{error:'INVALID_BODY'});}
  let output;
  const tick=now();
  if(!Number.isSafeInteger(tick)||tick<1)return reply(503,{error:'DEPENDENCY_UNAVAILABLE'});
  try{
   if(collection&&request.method==='GET'){
    const rows=(await dbp.prepare(LIST).bind(scope.merchant,
     g.role,scope.actor,g.role,scope.actor,g.role,scope.actor,limit).all())?.results;
    if(!Array.isArray(rows)||rows.length>limit)throw Error('INVALID_ROWS');
    output=reply(200,{contracts:rows.map(mapRow),count:rows.length,
     source:'D1_CONTRACT_CANDIDATE'});
   }else if(collection){
    if(g.role!=='BUYER')return reply(403,{error:'BUYER_ONLY'});
    if(!exact(body,['quoteId','quoteVersion','sellerId','reviewerId','milestoneId',
       'milestoneTitle','clientRequestId'])||
       !ID.test(body.quoteId)||!ID.test(body.sellerId)||!ID.test(body.reviewerId)||
       body.sellerId===body.reviewerId||body.sellerId===scope.actor||
       body.reviewerId===scope.actor||!SHORT.test(body.milestoneId)||
       typeof body.milestoneTitle!=='string'||
       body.milestoneTitle.length<12||body.milestoneTitle.length>160||
       !Number.isSafeInteger(body.quoteVersion)||body.quoteVersion<1||
       !UUID.test(body.clientRequestId))
     return reply(400,{error:'INVALID_CONTRACT'});
    const contractId=await contractKey('proofline:contract:v1\0'+scope.merchant+'\0'+scope.actor+'\0'+body.clientRequestId);
    const createdEvent=contractId+'_create';
    const n=changes(await dbp.prepare(CREATE).bind(contractId,
     body.sellerId,body.reviewerId,body.milestoneId,body.milestoneTitle,
     createdEvent,tick,body.sellerId,body.reviewerId,body.quoteId,
     scope.actor,scope.merchant,body.quoteVersion,g.revision).run());
    const row=await dbp.prepare(ONE).bind(contractId,scope.merchant).first();
    if(!row)return reply(409,{error:'QUOTE_OR_ROLES_NOT_AVAILABLE'});
    if(row.quote_id!==body.quoteId||row.seller_id!==body.sellerId||
       row.reviewer_id!==body.reviewerId||row.milestone_id!==body.milestoneId||
       row.milestone_title!==body.milestoneTitle||row.buyer_id!==scope.actor)
     return reply(409,{error:'CONTRACT_IDEMPOTENCY_CONFLICT'});
    output=reply(n?201:200,{contract:mapRow(row),created:n===1,idempotentReplay:n===0});
   }else{
    const verb=event[3],role=roleOf(verb);
    if(g.role!==role)return reply(403,{error:'ROLE_ACTION_FORBIDDEN'});
    if(!exact(body,['expectedVersion','eventId','detail'])||
       !Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<1||
       !UUID.test(body.eventId)||typeof body.detail!=='string'||
       body.detail.length>500||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(body.detail))
     return reply(400,{error:'INVALID_MILESTONE_EVENT'});
    const next=stateOf(verb),from1=verb==='submit'?'PENDING':'SUBMITTED',
     from2=verb==='submit'?'REJECTED':'SUBMITTED';
    const n=changes(await dbp.prepare(UPDATE).bind(next,body.eventId,actionOf(verb),
     scope.actor,body.detail,event[1],event[2],scope.merchant,body.expectedVersion,
     from1,from2,role,scope.actor,role,scope.actor,
     scope.actor,scope.merchant,role,g.revision).run());
    const row=await dbp.prepare(ONE).bind(event[1],scope.merchant).first();
    if(!row)return reply(404,{error:'CONTRACT_NOT_FOUND'});
    if(row.milestone_id!==event[2])return reply(404,{error:'MILESTONE_NOT_FOUND'});
    if(!n&&!(row.last_event_id===body.eventId&&
      row.version===body.expectedVersion+1&&row.state===next&&
      row.last_actor_id===scope.actor))
      return reply(409,{error:'CONTRACT_STATE_OR_VERSION_CONFLICT'});
    output=reply(200,{contract:mapRow(row),transitioned:n===1,
      idempotentReplay:n===0,auditEventId:body.eventId});
   }
  }catch{return reply(503,{error:'D1_CONTRACT_DEPENDENCY_UNAVAILABLE'});}
  try{await current(request,scope,g);}
  catch{return reply(401,{error:'TRUST_CHANGED'});}
  return output;
 }});
}
