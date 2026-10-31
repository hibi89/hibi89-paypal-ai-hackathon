// Durable, OFFLINE-ONLY server-authoritative binding of fictional candidates
// to an exact owner/merchant/quote version. Never authorizes PayPal or payout.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {QuoteApiError,parseSmallJson,reply} from './quote_api.mjs';
import {matchSyntheticMarketplaceSkills,matchSyntheticGeneralServiceSkills} from './marketplace_match.mjs';

const reject=(code,status=400)=>{throw new QuoteApiError(code,status)};
const identifier=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(x);
const token=x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);

export function createMarketplaceSelectionStore(filename,{recommendations,quotes}={}) {
  if(typeof filename!=='string'||!filename||filename===':memory:'||
     typeof recommendations?.get!=='function'||typeof recommendations?.scopeMatches!=='function'||
     typeof quotes?.get!=='function')
    throw new TypeError('PERSISTED_SELECTION_DEPENDENCIES_REQUIRED');
  const db=new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON');
  db.exec("CREATE TABLE IF NOT EXISTS marketplace_selections ("+
    "quote_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, merchant_id TEXT NOT NULL,"+
    "quote_version INTEGER NOT NULL, recommendation_id TEXT NOT NULL,"+
    "set_round INTEGER NOT NULL, profile_id TEXT NOT NULL,"+
    "skills_json TEXT NOT NULL, created_at INTEGER NOT NULL)");
  const getRow=quoteId=>db.prepare('SELECT * FROM marketplace_selections WHERE quote_id=?').get(quoteId);
  async function get({ownerId,merchantId,quoteId}={}){
    if(!identifier(ownerId)||!identifier(merchantId)||!identifier(quoteId))return null;
    const row=db.prepare('SELECT * FROM marketplace_selections WHERE quote_id=? AND owner_id=? AND merchant_id=?')
      .get(quoteId,ownerId,merchantId);
    if(!row)return null;
    const quote=await quotes.get(quoteId);
    if(!quote||quote.ownerId!==ownerId||quote.merchantId!==merchantId)return null;
    const current=quote.version===row.quote_version;
    return {quoteId,quoteVersion:row.quote_version,sessionId:row.recommendation_id,
      round:row.set_round,profileId:row.profile_id,requiredSkills:JSON.parse(row.skills_json),
      status:current?'BOUND':'STALE_QUOTE_VERSION',
      approvalAuthorized:false,paymentAuthorized:false};
  }
  async function select({ownerId,merchantId,quoteId,expectedQuoteVersion,
    sessionId,round,profileId}={}){
    if(!identifier(ownerId)||!identifier(merchantId)||!identifier(quoteId)||
       !token(sessionId)||!identifier(profileId)||
       !Number.isSafeInteger(expectedQuoteVersion)||expectedQuoteVersion<1||
       !Number.isInteger(round)||round<1||round>3)
      reject('INVALID_CANDIDATE_SELECTION');
    const rec=recommendations.get(ownerId,sessionId);
    if(!rec)reject('RECOMMENDATION_SESSION_NOT_FOUND',404);
    if(round>rec.round+1)reject('RECOMMENDATION_SET_NOT_VIEWED',409);
    const selectedIds=rec.roster?.[round-1];
    if(!Array.isArray(selectedIds)||selectedIds.length!==3||
       !selectedIds.includes(profileId))reject('CANDIDATE_NOT_IN_SAVED_SET',409);
    const match=rec.vertical==='ai_work'
      ? matchSyntheticMarketplaceSkills(rec.skills,{round:round-1,profileIds:selectedIds})
      : matchSyntheticGeneralServiceSkills(rec.skills,{round:round-1,profileIds:selectedIds});
    const candidate=match.profiles.find(x=>x.id===profileId);
    if(!candidate?.eligible)reject('CANDIDATE_MISSING_REQUIRED_SKILLS',409);
    const quote=await quotes.get(quoteId);
    if(!quote||quote.ownerId!==ownerId||quote.merchantId!==merchantId)
      reject('QUOTE_NOT_FOUND',404);
    if(quote.status!=='PROPOSED'||quote.version!==expectedQuoteVersion)
      reject('STALE_OR_APPROVED_QUOTE',409);
    if(!recommendations.scopeMatches(ownerId,sessionId,profileId,quote.scope))
      reject('QUOTE_SCOPE_CANDIDATE_MISMATCH',409);
    // A serialized selection transaction disallows switching candidates on the
    // same quote version. A revised quote requires a fresh explicit selection.
    db.exec('BEGIN IMMEDIATE');
    try{
      const prior=getRow(quoteId);
      if(prior){
        if(prior.owner_id!==ownerId||prior.merchant_id!==merchantId)
          reject('QUOTE_SELECTION_CONFLICT',409);
        if(prior.quote_version>=expectedQuoteVersion){
          if(prior.quote_version!==expectedQuoteVersion||
             prior.recommendation_id!==sessionId||prior.set_round!==round||
             prior.profile_id!==profileId)
            reject('QUOTE_SELECTION_ALREADY_BOUND',409);
        }else{
          db.prepare('UPDATE marketplace_selections SET quote_version=?,recommendation_id=?,set_round=?,profile_id=?,skills_json=?,created_at=? WHERE quote_id=? AND owner_id=? AND merchant_id=?')
            .run(expectedQuoteVersion,sessionId,round,profileId,
              JSON.stringify(match.requestedSkills),Date.now(),quoteId,ownerId,merchantId);
        }
      }else{
        db.prepare('INSERT INTO marketplace_selections(quote_id,owner_id,merchant_id,quote_version,recommendation_id,set_round,profile_id,skills_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
          .run(quoteId,ownerId,merchantId,expectedQuoteVersion,sessionId,round,
            profileId,JSON.stringify(match.requestedSkills),Date.now());
      }
      db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
    const latest=await quotes.get(quoteId);
    if(!latest||latest.version!==expectedQuoteVersion||latest.status!=='PROPOSED'||
       latest.ownerId!==ownerId||latest.merchantId!==merchantId)
      reject('QUOTE_CHANGED_AFTER_SELECTION',409);
    return get({ownerId,merchantId,quoteId});
  }
  async function assertCurrent({ownerId,merchantId,quoteId,expectedQuoteVersion}={}){
    const prior=identifier(quoteId)?getRow(quoteId):null;
    if(!prior)return; // legacy offline quote approval without a recommendation
    if(prior.owner_id!==ownerId||prior.merchant_id!==merchantId||
       prior.quote_version!==expectedQuoteVersion)
      reject('QUOTE_SELECTION_STALE',409);
    const proof=await get({ownerId,merchantId,quoteId});
    if(!proof||proof.status!=='BOUND')reject('QUOTE_SELECTION_STALE',409);
    const quote=await quotes.get(quoteId);
    if(!recommendations.scopeMatches(ownerId,prior.recommendation_id,prior.profile_id,quote?.scope))
      reject('QUOTE_SCOPE_CANDIDATE_MISMATCH',409);
  }
  return {select,get,assertCurrent,close:()=>db.close()};
}

export function createMarketplaceSelectionApi({resolveSession,store}={}){
  if(typeof resolveSession!=='function'||!store)throw new TypeError('SELECTION_API_DEPENDENCIES_REQUIRED');
  return async request=>{
    try{
      if(!(request instanceof Request))reject('REQUEST_REQUIRED');
      const url=new URL(request.url);
      if(url.pathname!=='/api/demo/marketplace/selection')reject('NOT_FOUND',404);
      const isRead=request.method==='GET';
      if(!isRead&&request.method!=='POST')
        return reply({error:'METHOD_NOT_ALLOWED'},405,{allow:'GET, POST'});
      const session=await resolveSession(request);
      if(session?.verified!==true||session.actorId!=='synthetic-owner'||
         session.merchantId!=='synthetic-merchant')
        reject('OWNER_SESSION_REQUIRED',403);
      const origin=request.headers.get('origin');
      if(origin!==null&&origin!==url.origin)reject('ORIGIN_MISMATCH',403);
      if(isRead){
        if(url.searchParams.size!==1)reject('INVALID_SELECTION_QUERY');
        const result=await store.get({ownerId:session.actorId,merchantId:session.merchantId,
          quoteId:url.searchParams.get('quoteId')});
        if(!result)reject('CANDIDATE_SELECTION_NOT_FOUND',404);
        return reply(result);
      }
      if(request.headers.get('x-csrf-token')!==session.csrfToken||
         !session.csrfToken)reject('CSRF_REQUIRED',403);
      const body=await parseSmallJson(request);
      const allowed=['quoteId','expectedQuoteVersion','sessionId','round','profileId'];
      if(Object.keys(body).some(k=>!allowed.includes(k)))reject('UNEXPECTED_FIELDS');
      return reply(await store.select({...body,ownerId:session.actorId,
        merchantId:session.merchantId}),201);
    }catch(e){
      return reply({error:e instanceof QuoteApiError?e.code:'INTERNAL_ERROR'},
        e instanceof QuoteApiError?e.status:500);
    }
  };
}

/**
 * Single-ledger bridge for local synthetic 3x3 recommendations.
 * Only the trusted local API uses this. Neither a browser session nor this
 * module is a real seller credential, entitlement, or payment authorization.
 */
export function createLedgerMarketplaceSelectionStore({recommendations,quotes}={}){
  if(!recommendations||typeof recommendations.get!=='function'||
    typeof recommendations.scopeMatches!=='function'||!quotes||
    typeof quotes.bindMarketplaceCandidate!=='function'||
    typeof quotes.getMarketplaceCandidate!=='function'||
    typeof quotes.assertMarketplaceCandidate!=='function')
    throw new TypeError('ATOMIC_LEDGER_SELECTION_DEPENDENCIES_REQUIRED');
  async function select({ownerId,merchantId,quoteId,expectedQuoteVersion,
    sessionId,round,profileId}={}){
    if(!identifier(ownerId)||!identifier(merchantId)||!identifier(quoteId)||
       !token(sessionId)||!identifier(profileId)||
       !Number.isSafeInteger(expectedQuoteVersion)||expectedQuoteVersion<1||
       !Number.isInteger(round)||round<1||round>3)
      reject('INVALID_CANDIDATE_SELECTION');
    const rec=recommendations.get(ownerId,sessionId);
    if(!rec)reject('RECOMMENDATION_SESSION_NOT_FOUND',404);
    if(round>rec.round+1)reject('RECOMMENDATION_SET_NOT_VIEWED',409);
    const ids=rec.roster?.[round-1];
    if(!Array.isArray(ids)||ids.length!==3||!ids.includes(profileId))
      reject('CANDIDATE_NOT_IN_SAVED_SET',409);
    const match=rec.vertical==='ai_work'
      ? matchSyntheticMarketplaceSkills(rec.skills,{round:round-1,profileIds:ids})
      : matchSyntheticGeneralServiceSkills(rec.skills,{round:round-1,profileIds:ids});
    if(!match.profiles.find(p=>p.id===profileId)?.eligible)
      reject('CANDIDATE_MISSING_REQUIRED_SKILLS',409);
    const quote=await quotes.get(quoteId);
    if(!quote||quote.ownerId!==ownerId||quote.merchantId!==merchantId)
      reject('QUOTE_NOT_FOUND',404);
    if(quote.status!=='PROPOSED'||quote.version!==expectedQuoteVersion)
      reject('STALE_OR_APPROVED_QUOTE',409);
    if(!recommendations.scopeMatches(ownerId,sessionId,profileId,quote.scope))
      reject('QUOTE_SCOPE_CANDIDATE_MISMATCH',409);
    // The ledger re-reads and CAS-validates quote & scope INSIDE its own
    // BEGIN IMMEDIATE; no split-file check/write race at the source of truth.
    const scopeDigest=createHash('sha256').update(quote.scope).digest('hex');
    return quotes.bindMarketplaceCandidate({
      quoteId,ownerId,merchantId,expectedQuoteVersion,sessionId,round,profileId,
      requiredSkills:match.requestedSkills,scopeDigest
    });
  }
  return {
    select,
    get:({ownerId,merchantId,quoteId}={})=>
      quotes.getMarketplaceCandidate({quoteId,ownerId,merchantId}),
    assertCurrent:({ownerId,merchantId,quoteId,expectedQuoteVersion}={})=>
      quotes.assertMarketplaceCandidate({quoteId,ownerId,merchantId,expectedQuoteVersion}),
    close:()=>{} // Same lifetime as the existing quote/contract ledger.
  };
}
