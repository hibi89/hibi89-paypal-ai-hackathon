// Read-only cross-part approved quote <-> synthetic A2A transcript bridge.
// INTERNAL HOST ONLY. This NEVER creates, authorizes, captures, or verifies a payment.
// Separate SQLite databases cannot be atomically committed as one provider transaction.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {approvedAmount} from './payment_contract.mjs';

const ID=/^[A-Za-z0-9_-]{1,64}$/;
const HASH=/^[a-f0-9]{64}$/;
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const digest=data=>createHash('sha256').update(JSON.stringify(data)).digest('hex');
const TTL=15*60*1000;
const valid=x=>typeof x==='string'&&ID.test(x);
const resultView=x=>Object.freeze({
 status:'SYNTHETIC_CROSS_PART_REVIEW_ONLY',
 quoteId:x.quoteId,consentId:x.consentId,
 amountMinor:x.amountMinor,currency:'USD',
 quoteVersion:x.quoteVersion,
 reviewFingerprint:x.reviewFingerprint,
 paymentAuthorized:false,paypalOrderCreated:false,
 paypalCapturePerformed:false,merchantOwnershipVerified:false,
 sellerIdentityVerified:false,realProviderEvidence:false,
 mode:'PRIVATE_LOCAL_REVIEW_LINK_NOT_CHECKOUT_AUTHORITY'
});

export function createCrossPartReviewBridge({
 filename,ledger,innovationStore,identityPolicy,authorizeLink,now=Date.now
}={}){
 if(typeof filename!=='string'||!filename||filename===':memory:'||
  typeof ledger?.get!=='function'||
  typeof innovationStore?.state!=='function'||
  typeof identityPolicy?.issueProof!=='function'||
  typeof identityPolicy?.authorize!=='function'||
  typeof authorizeLink!=='function'||typeof now!=='function')
  fail('CROSS_PART_TRUSTED_DEPENDENCIES_REQUIRED');
 const db=new DatabaseSync(filename);
 db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000');
 db.exec("CREATE TABLE IF NOT EXISTS cross_part_review_links("+
   "actor TEXT NOT NULL,merchant TEXT NOT NULL,quote_id TEXT NOT NULL,"+
   "consent_id TEXT NOT NULL,quote_version INTEGER NOT NULL,"+
   "amount_minor INTEGER NOT NULL,review_fingerprint TEXT NOT NULL,"+
   "created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,revoked_at INTEGER,"+
   "PRIMARY KEY(actor,merchant,quote_id),"+
   "UNIQUE(actor,merchant,consent_id))");
 // Keep the contents of existing local review databases during migration.
 if(!db.prepare('PRAGMA table_info(cross_part_review_links)').all()
   .some(column=>column.name==='revoked_at'))
  db.exec('ALTER TABLE cross_part_review_links ADD COLUMN revoked_at INTEGER');
 const q=sql=>db.prepare(sql);
 function clock(){
  const ms=now();
  if(!Number.isSafeInteger(ms)||ms<0||ms>8_640_000_000_000_000)
   fail('CROSS_PART_CLOCK_INVALID');
  return ms;
 }
 async function evidence(hostHandle,quoteId,consentId){
  if(!valid(quoteId)||!valid(consentId))
   fail('CROSS_PART_IDENTIFIERS_REQUIRED');
  // Trusted session + persistent membership are re-read on every operation.
  const proof=await identityPolicy.issueProof(hostHandle);
  const quote=await ledger.get(quoteId);
  if(!quote||quote.id!==quoteId||quote.status!=='APPROVED'||
    !valid(quote.ownerId)||!valid(quote.merchantId)||
    !Number.isSafeInteger(quote.version)||quote.version<1)
   fail('CROSS_PART_APPROVED_QUOTE_REQUIRED');
  const grant=await identityPolicy.authorize(proof,{
   action:'quote.read',resource:{quoteId,ownerId:quote.ownerId,
    merchantId:quote.merchantId}
  });
  if(grant.role!=='buyer'||grant.actorId!==quote.ownerId||
    grant.merchantId!==quote.merchantId)
   fail('CROSS_PART_VERIFIED_BUYER_REQUIRED');
  let amountMinor;
  try{amountMinor=approvedAmount(quote)}catch{
   fail('CROSS_PART_APPROVED_QUOTE_REQUIRED');
  }
  const state=innovationStore.state({actor:grant.actorId,merchant:grant.merchantId});
  if(state?.mode!=='OFFLINE_SYNTHETIC_ONLY'||
     state?.providerCalls!==0||state?.realPayPal!==false||
     !Array.isArray(state.consents)||!Array.isArray(state.events))
   fail('CROSS_PART_SYNTHETIC_EVIDENCE_REQUIRED');
  const consent=state.consents.find(x=>x.id===consentId);
  const matches=state.events.filter(x=>x.kind==='a2a'&&
    x.result?.consentId===consentId);
  if(!consent||consent.category!=='services'||consent.revoked||
    consent.usedMinor!==amountMinor||consent.maxMinor<amountMinor||
    consent.expiresAt<=clock()||matches.length!==1)
   fail('CROSS_PART_SCOPED_CONSENT_REQUIRED');
  const a2a=matches[0].result;
  if(a2a.status!=='SYNTHETIC_AGREEMENT'||
     a2a.protocolStatus!=='AGREED_OFFLINE_CONTRACT'||
     a2a.accepted!==true||a2a.agreedMinor!==amountMinor||
     a2a.reservedMinor!==amountMinor||
     a2a.paymentAuthorized!==false||
     a2a.providerCalls!==0||a2a.paypalCapturePerformed!==false||
     a2a.paymentState!=='NOT_PAID'||a2a.checkout!=='DISABLED'||
     a2a.mode!=='OFFLINE_SYNTHETIC_ONLY'||!HASH.test(a2a.transcriptSha256??''))
   fail('CROSS_PART_A2A_EVIDENCE_MISMATCH');
  const payload={actorId:grant.actorId,merchantId:grant.merchantId,
   quoteId,quoteVersion:quote.version,amountMinor,consentId,
   transcriptSha256:a2a.transcriptSha256,
   mandateRevision:consent.revision,expiresAt:consent.expiresAt};
  return {payload,fingerprint:digest(payload)};
 }
 async function link({hostHandle,quoteId,consentId}={}){
  const before=await evidence(hostHandle,quoteId,consentId);
  // The trusted host callback is not an HTTP body flag. Explicit review only.
  const allowed=await authorizeLink(Object.freeze({
   action:'LINK_SYNTHETIC_A2A_TO_APPROVED_QUOTE',
   ...before.payload,paymentAuthorized:false,providerCalls:0
  }));
  if(allowed!==true)fail('CROSS_PART_EXPLICIT_REVIEW_REQUIRED');
  const after=await evidence(hostHandle,quoteId,consentId);
  if(before.fingerprint!==after.fingerprint)
   fail('CROSS_PART_EVIDENCE_CHANGED');
  const stamp=clock();
  db.exec('BEGIN IMMEDIATE');
  let row;
  try{
   const previous=q("SELECT * FROM cross_part_review_links "+
    "WHERE actor=? AND merchant=? AND quote_id=?").get(
      after.payload.actorId,after.payload.merchantId,quoteId);
   if(previous){
    if(previous.revoked_at!==null)fail('CROSS_PART_LINK_REVOKED');
    if(previous.consent_id!==consentId||
       previous.review_fingerprint!==after.fingerprint)
     fail('CROSS_PART_LINK_CONFLICT');
    row=previous;
   }else{
    const occupied=q("SELECT 1 FROM cross_part_review_links "+
     "WHERE actor=? AND merchant=? AND consent_id=?").get(
      after.payload.actorId,after.payload.merchantId,consentId);
    if(occupied)fail('CROSS_PART_CONSENT_ALREADY_LINKED');
    q("INSERT INTO cross_part_review_links"+
      "(actor,merchant,quote_id,consent_id,quote_version,amount_minor,"+
      "review_fingerprint,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)")
     .run(after.payload.actorId,after.payload.merchantId,quoteId,consentId,
      after.payload.quoteVersion,after.payload.amountMinor,after.fingerprint,
      stamp,Math.min(stamp+TTL,after.payload.expiresAt));
    row={expires_at:Math.min(stamp+TTL,after.payload.expiresAt)};
   }
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e}
  if(stamp>=row.expires_at)fail('CROSS_PART_LINK_EXPIRED');
  // Post-persist verification limits cross-DB race window; this is still
  // explicitly NON-PAYMENT evidence and must never authorize provider POST.
  const last=await evidence(hostHandle,quoteId,consentId);
  if(last.fingerprint!==after.fingerprint)
   fail('CROSS_PART_EVIDENCE_CHANGED');
  // The final cross-DB recheck may itself await past the persisted TTL.
  if(clock()>=row.expires_at)fail('CROSS_PART_LINK_EXPIRED');
  return resultView({...after.payload,reviewFingerprint:after.fingerprint});
 }
 async function inspect({hostHandle,quoteId}={}){
  if(!valid(quoteId))fail('CROSS_PART_IDENTIFIERS_REQUIRED');
  const proof=await identityPolicy.issueProof(hostHandle);
  const quote=await ledger.get(quoteId);
  if(!quote||quote.id!==quoteId)fail('CROSS_PART_LINK_UNAVAILABLE');
  const grant=await identityPolicy.authorize(proof,{
    action:'quote.read',resource:{quoteId,ownerId:quote.ownerId,
     merchantId:quote.merchantId}
  });
  if(grant.role!=='buyer'||grant.actorId!==quote.ownerId||
     grant.merchantId!==quote.merchantId)
   fail('CROSS_PART_VERIFIED_BUYER_REQUIRED');
  const row=q("SELECT * FROM cross_part_review_links "+
   "WHERE actor=? AND merchant=? AND quote_id=?").get(
     grant.actorId,grant.merchantId,quoteId);
  if(!row||row.revoked_at!==null||row.expires_at<=clock())
   fail('CROSS_PART_LINK_UNAVAILABLE');
  const current=await evidence(hostHandle,quoteId,row.consent_id);
  // Evidence reads can await across DBs; expiration must be checked again
  // after those reads, not only before them.
  if(row.expires_at<=clock())fail('CROSS_PART_LINK_UNAVAILABLE');
  if(row.review_fingerprint!==current.fingerprint||
    row.quote_version!==current.payload.quoteVersion||
    row.amount_minor!==current.payload.amountMinor)
   fail('CROSS_PART_LINK_STALE');
  return resultView({...current.payload,reviewFingerprint:row.review_fingerprint});
 }
 // Buyer withdrawal is a local review action, never payment consent.
 // Preserve a tombstone so the same consent cannot silently be reused.
 async function revoke({hostHandle,quoteId}={}){
  if(!valid(quoteId))fail('CROSS_PART_IDENTIFIERS_REQUIRED');
  const proof=await identityPolicy.issueProof(hostHandle);
  const quote=await ledger.get(quoteId);
  if(!quote||quote.id!==quoteId)fail('CROSS_PART_LINK_UNAVAILABLE');
  const grant=await identityPolicy.authorize(proof,{
   action:'quote.read',resource:{quoteId,ownerId:quote.ownerId,
    merchantId:quote.merchantId}
  });
  if(grant.role!=='buyer'||grant.actorId!==quote.ownerId||
     grant.merchantId!==quote.merchantId)
   fail('CROSS_PART_VERIFIED_BUYER_REQUIRED');
  const again=await identityPolicy.issueProof(hostHandle);
  const current=await identityPolicy.authorize(again,{
   action:'quote.read',resource:{quoteId,ownerId:quote.ownerId,
    merchantId:quote.merchantId}
  });
  if(current.role!=='buyer'||current.actorId!==grant.actorId||
     current.merchantId!==grant.merchantId)
   fail('CROSS_PART_VERIFIED_BUYER_REQUIRED');
  const stamp=clock();
  db.exec('BEGIN IMMEDIATE');
  try{
   const changed=q('UPDATE cross_part_review_links SET revoked_at=? '+
    'WHERE actor=? AND merchant=? AND quote_id=? '+
    'AND revoked_at IS NULL AND expires_at>?').run(
     stamp,current.actorId,current.merchantId,quoteId,stamp);
   if(changed.changes!==1)fail('CROSS_PART_LINK_UNAVAILABLE');
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e}
  return Object.freeze({status:'SYNTHETIC_REVIEW_REVOKED',quoteId,
   paymentAuthorized:false,paypalCapturePerformed:false,
   providerCalls:0,realProviderEvidence:false});
 }
 return Object.freeze({link,inspect,revoke,close:()=>db.close(),
  mode:'INTERNAL_SYNTHETIC_REVIEW_ONLY',publicHttpEnabled:false,
  paypalProviderCalls:0,autoPaymentAuthorized:false});
}
