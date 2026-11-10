// Owner-only preflight: bind a private $1.50 Gemini negotiation to an
// existing, still-PROPOSED Part1 quote. No network, approval or payment writes.
// The file is opened read-only and must already exist outside this repository.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {lstatSync,realpathSync} from 'node:fs';
import {isAbsolute,join,relative,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';

const ID=/^[A-Za-z0-9_-]{1,64}$/;
const MERCHANT=/^[A-Za-z0-9]{13}$/;
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const outside=(path,base)=>{
 const rel=relative(base,path);
 return rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel);
};
const fingerprint=value=>createHash('sha256')
 .update(JSON.stringify(value)).digest('hex');

// Quote contract fields are unchanged by a normal human approval.
// Exclude status and approval fields so a PRE-APPROVED negotiation can be
// checked against the later APPROVED view without assuming approval authority.
export function fingerprintOwnerQuoteContract(quote){
 if(!quote||!ID.test(quote.id??'')||!ID.test(quote.ownerId??'')||
    !MERCHANT.test(quote.merchantId??'')||
    !Number.isSafeInteger(quote.version)||quote.version<1||
    quote.currency!=='USD')
  fail('OWNER_A2A_CONTRACT_FINGERPRINT_INVALID');
 return fingerprint({
  id:quote.id,owner:quote.ownerId,merchant:quote.merchantId,
  version:quote.version,currency:quote.currency,
  scope:quote.scope??null,draft:quote.aiSuggestedMinor??null
 });
}

// Resolve the SAME owner-local $1.50 identity for both model preflight and
// postflight and the read-only evidence command. Never read provider keys.
export function resolveOwnerSandbox150QuoteScope({
 environment={},privateDirectory
}={}){
 const fromWorknova=environment.WORKNOVA_SANDBOX_MERCHANT_ID;
 const fromPaypal=environment.PAYPAL_SANDBOX_MERCHANT_ID;
 if(fromWorknova&&fromPaypal&&fromWorknova!==fromPaypal)
  fail('OWNER_A2A_MERCHANT_ENV_CONFLICT');
 const actorId=environment.WORKNOVA_OWNER_ACTOR_ID||'operator_owner';
 const merchantId=fromWorknova||fromPaypal;
 const quoteId=environment.WORKNOVA_PILOT_QUOTE_ID||'worknova_a2a_150_once';
 const filename=environment.WORKNOVA_OWNER_LEDGER_PATH||
  (typeof privateDirectory==='string'&&isAbsolute(privateDirectory)
   ?join(privateDirectory,'owner-sandbox150-part1.sqlite'):null);
 if(!ID.test(actorId)||!MERCHANT.test(merchantId??'')||
    !ID.test(quoteId)||typeof filename!=='string'||!isAbsolute(filename))
  fail('OWNER_A2A_LOCAL_QUOTE_SCOPE_REQUIRED');
 return Object.freeze({filename,actorId,merchantId,quoteId});
}

/**
 * Local quote identity is NOT proof that a PayPal Business merchant owns an
 * OAuth app or that the Gemini output came from Google. Human approval and
 * provider payment checks remain independent and mandatory.
 */
export function inspectOwnerProposedA2AQuote({
 filename,actorId,merchantId,quoteId,cwd=process.cwd()
}={}){
 if(!ID.test(actorId??'')||!MERCHANT.test(merchantId??'')||
    !ID.test(quoteId??'')||typeof filename!=='string'||
    !isAbsolute(filename)||typeof cwd!=='string')
  fail('OWNER_A2A_LOCAL_QUOTE_SCOPE_REQUIRED');
 let actual;
 try{
  // Reject symlink file and all repo-relative or repo-resolving paths.
  if(!lstatSync(filename).isFile())throw Error('NOT_REGULAR_FILE');
  actual=realpathSync(filename);
  if(!outside(actual,resolve(cwd)))throw Error('INSIDE_REPO');
 }catch{fail('OWNER_A2A_EXISTING_OUTSIDE_REPO_LEDGER_REQUIRED');}
 // Opening a closed WAL-mode SQLite file with ordinary readOnly can itself
 // leave -wal/-shm files even after close. If no pending WAL frames exist,
 // use a truly immutable read; retain live WAL-aware reads when an existing
 // writer has already committed uncheckpointed frames (legacy behavior).
 // Never discard non-empty WAL, rewrite it, or hide concurrent changes.
 let pendingWal=false;
 try{pendingWal=lstatSync(actual+'-wal').size>0}
 catch(e){if(e?.code!=='ENOENT')fail('OWNER_A2A_LOCAL_LEDGER_READ_FAILED')}
 let db;
 let row,used;
 try{
  db=new DatabaseSync(pendingWal?actual:
   pathToFileURL(actual).href+'?immutable=1',{readOnly:true});
  db.exec('PRAGMA query_only=ON');
  row=db.prepare('SELECT id,owner_id,merchant_id,version,currency,status,'+
   'scope_text,ai_suggested_minor,approval_actor,approval_version,'+
   'approval_amount_minor,rejection_reason FROM quotes WHERE id=?')
   .get(quoteId);
  used=db.prepare('SELECT 1 AS found FROM payment_attempts WHERE quote_id=? LIMIT 1')
   .get(quoteId);
  // An immutable snapshot must not be accepted if a concurrent writer
  // started appending WAL frames after the initial filesystem check.
  if(!pendingWal){
   try{
    if(lstatSync(actual+'-wal').size>0)
     fail('OWNER_A2A_LEDGER_CHANGED_DURING_INSPECTION');
   }catch(e){if(e?.code!=='ENOENT')throw e}
  }
 }catch(e){
  if(e?.code==='OWNER_A2A_LEDGER_CHANGED_DURING_INSPECTION')throw e;
  fail('OWNER_A2A_LOCAL_LEDGER_READ_FAILED');
 }
 finally{try{db?.close()}catch{}}
 if(!row||row.id!==quoteId||row.owner_id!==actorId||
    row.merchant_id!==merchantId||row.currency!=='USD'||
    row.status!=='PROPOSED'||!Number.isSafeInteger(row.version)||
    row.version<1||row.approval_actor!==null||
    row.approval_version!==null||row.approval_amount_minor!==null||
    row.rejection_reason!==null||used)
  fail('OWNER_A2A_UNAPPROVED_UNPAID_QUOTE_REQUIRED');
 const binding={
  actorId,merchantId,quoteId,quoteVersion:row.version,
  currency:'USD',amountMinor:150,
  quoteFingerprint:fingerprintOwnerQuoteContract({
   id:row.id,ownerId:row.owner_id,merchantId:row.merchant_id,
   version:row.version,currency:row.currency,
   scope:row.scope_text,aiSuggestedMinor:row.ai_suggested_minor
  }),
  quoteStatus:'PROPOSED_NOT_PAYMENT_AUTHORITY'
 };
 return Object.freeze(binding);
}
