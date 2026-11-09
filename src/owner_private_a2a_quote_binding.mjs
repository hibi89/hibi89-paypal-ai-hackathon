// Owner-only preflight: bind a private $1.50 Gemini negotiation to an
// existing, still-PROPOSED Part1 quote. No network, approval or payment writes.
// The file is opened read-only and must already exist outside this repository.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {lstatSync,realpathSync} from 'node:fs';
import {isAbsolute,relative,resolve,sep} from 'node:path';

const ID=/^[A-Za-z0-9_-]{1,64}$/;
const MERCHANT=/^[A-Za-z0-9]{13}$/;
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const outside=(path,base)=>{
 const rel=relative(base,path);
 return rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel);
};
const fingerprint=value=>createHash('sha256')
 .update(JSON.stringify(value)).digest('hex');

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
 let db;
 let row,used;
 try{
  db=new DatabaseSync(actual,{readOnly:true});
  row=db.prepare('SELECT id,owner_id,merchant_id,version,currency,status,'+
   'scope_text,ai_suggested_minor,approval_actor,approval_version,'+
   'approval_amount_minor,rejection_reason FROM quotes WHERE id=?')
   .get(quoteId);
  used=db.prepare('SELECT 1 AS found FROM payment_attempts WHERE quote_id=? LIMIT 1')
   .get(quoteId);
 }catch{fail('OWNER_A2A_LOCAL_LEDGER_READ_FAILED');}
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
  quoteFingerprint:fingerprint({
   id:row.id,owner:row.owner_id,merchant:row.merchant_id,
   version:row.version,currency:row.currency,status:row.status,
   scope:row.scope_text,draft:row.ai_suggested_minor
  }),
  quoteStatus:'PROPOSED_NOT_PAYMENT_AUTHORITY'
 };
 return Object.freeze(binding);
}
