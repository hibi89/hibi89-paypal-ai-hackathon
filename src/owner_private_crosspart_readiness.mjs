// Read-only owner-local check AFTER independent quote approval.
// This report cannot create trusted buyer sessions, review links or PayPal orders.
// Part1 and Part2 SQLite are separate consistency domains (not atomic).
import {DatabaseSync} from 'node:sqlite';
import {lstatSync,realpathSync} from 'node:fs';
import {join,resolve,isAbsolute,relative,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {fingerprintOwnerQuoteContract} from './owner_private_a2a_quote_binding.mjs';
import {inspectPrivatePart2A2A} from './owner_private_two_part_evidence.mjs';

const ID=/^[A-Za-z0-9_-]{1,64}$/;
const MERCHANT=/^[A-Za-z0-9]{13}$/;
const fail=code=>{const e=new Error(code);e.code=code;throw e};
const inside=(child,base)=>{
 const r=relative(resolve(base),resolve(child));
 return r===''||(!r.startsWith('..'+sep)&&r!=='..'&&!isAbsolute(r));
};
const FILES=Object.freeze({
 quote:'owner-sandbox150-part1.sqlite',
 part2:'part2-owner-sandbox150.sqlite',
 budget:'part2-owner-sandbox150-quota.sqlite'
});
function checkedFile(path,base,cwd){
 if(typeof path!=='string'||!isAbsolute(path)||
    resolve(path)!==resolve(join(base,FILES.quote))&&
    resolve(path)!==resolve(join(base,FILES.part2))&&
    resolve(path)!==resolve(join(base,FILES.budget)))
  fail('OWNER_150_CROSSPART_ISOLATED_PATH_REQUIRED');
 try{
  const stat=lstatSync(path);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>64*1024*1024||
     inside(realpathSync(path),cwd))throw Error('UNSAFE');
  for(const ext of ['-wal','-shm']){
   try{lstatSync(path+ext);throw Error('ACTIVE_WAL')}
   catch(e){if(e?.code!=='ENOENT')throw e}
  }
 }catch{fail('OWNER_150_CROSSPART_READONLY_FILE_UNAVAILABLE');}
 return path;
}
function readImmutable(path,fn){
 let db;
 try{
  db=new DatabaseSync(pathToFileURL(path).href+'?immutable=1',{readOnly:true});
  db.exec('PRAGMA query_only=ON');
  return fn(db);
 }catch(e){
  if(e?.code?.startsWith('OWNER_150_'))throw e;
  fail('OWNER_150_CROSSPART_READONLY_INSPECTION_FAILED');
 }finally{try{db?.close()}catch{}}
}
export function inspectOwnerSandbox150CrossPartReadiness({
 privateDirectory,quoteScope,part2Filename,budgetFilename,cwd=process.cwd(),
 now=Date.now
}={}){
 if(typeof privateDirectory!=='string'||!isAbsolute(privateDirectory)||
    typeof cwd!=='string'||typeof now!=='function'||
    !quoteScope||!ID.test(quoteScope.actorId??'')||
    !MERCHANT.test(quoteScope.merchantId??'')||
    !ID.test(quoteScope.quoteId??'')||
    resolve(quoteScope.filename??'')!==resolve(join(privateDirectory,FILES.quote))||
    resolve(part2Filename??'')!==resolve(join(privateDirectory,FILES.part2))||
    resolve(budgetFilename??'')!==resolve(join(privateDirectory,FILES.budget))||
    inside(privateDirectory,cwd))
  fail('OWNER_150_CROSSPART_ISOLATED_PATH_REQUIRED');
 let dir;
 try{dir=lstatSync(privateDirectory)}
 catch{fail('OWNER_150_CROSSPART_PRIVATE_DIRECTORY_REQUIRED')}
 if(!dir.isDirectory()||dir.isSymbolicLink()||
    inside(realpathSync(privateDirectory),cwd))
  fail('OWNER_150_CROSSPART_PRIVATE_DIRECTORY_REQUIRED');
 const quoteFile=checkedFile(quoteScope.filename,privateDirectory,cwd);
 const part2File=checkedFile(part2Filename,privateDirectory,cwd);
 const budgetFile=checkedFile(budgetFilename,privateDirectory,cwd);
 const scope={actor:quoteScope.actorId,merchant:quoteScope.merchantId,
  job:'part2_sandbox_150_once'};
 function readQuote(){
  return readImmutable(quoteFile,db=>{
   const quote=db.prepare(
    'SELECT id,owner_id,merchant_id,version,currency,status,scope_text,'+
    'ai_suggested_minor,approval_actor,approval_version,approval_amount_minor,'+
    'rejection_reason FROM quotes WHERE id=?'
   ).get(quoteScope.quoteId);
   const member=db.prepare(
    'SELECT merchant_id,role,active,revision FROM marketplace_actor_memberships WHERE actor_id=?'
   ).get(quoteScope.actorId);
   const attempts=db.prepare(
    'SELECT COUNT(*) AS n FROM payment_attempts WHERE quote_id=?'
   ).get(quoteScope.quoteId).n;
   if(!quote||quote.status!=='APPROVED'||quote.currency!=='USD'||
      quote.owner_id!==quoteScope.actorId||
      quote.merchant_id!==quoteScope.merchantId||
      !Number.isSafeInteger(quote.version)||quote.version<1||
      quote.approval_actor!==quoteScope.actorId||
      quote.approval_version!==quote.version||
      quote.approval_amount_minor!==150||
      quote.rejection_reason!==null||attempts!==0||
      !member||member.merchant_id!==quoteScope.merchantId||
      member.role!=='buyer'||member.active!==1||
      !Number.isSafeInteger(member.revision)||member.revision<1)
    fail('OWNER_150_CROSSPART_APPROVED_QUOTE_OR_BUYER_INVALID');
   return {
    version:quote.version,revision:member.revision,
    fingerprint:fingerprintOwnerQuoteContract({
     id:quote.id,ownerId:quote.owner_id,merchantId:quote.merchant_id,
     version:quote.version,currency:quote.currency,
     scope:quote.scope_text,aiSuggestedMinor:quote.ai_suggested_minor
    })
   };
  });
 }
 const before=readQuote();
 const evidence=inspectPrivatePart2A2A({
  filename:part2File,budgetFilename:budgetFile,scope,
  sandboxPilotQuoteId:quoteScope.quoteId
 });
 if(evidence.status!=='PRIVATE_A2A_SQLITE_RESULT_NOT_GEMINI_ATTESTED'||
    evidence.amountMinor!==150||evidence.delegationStillValidNow!==true||
    evidence.boundQuoteId!==quoteScope.quoteId||
    evidence.boundQuoteVersion!==before.version||
    evidence.boundQuoteFingerprint!==before.fingerprint||
    evidence.quotaClaims<2||evidence.quotaClaims>4)
  fail('OWNER_150_CROSSPART_BOUND_A2A_EVIDENCE_REQUIRED');
 const linkCandidate=readImmutable(part2File,db=>{
  const matches=db.prepare(
   "SELECT result FROM innovation_events WHERE actor=? AND merchant=? AND kind='a2a'"
  ).all(scope.actor,scope.merchant);
  if(matches.length!==1)fail('OWNER_150_CROSSPART_UNIQUE_EVENT_REQUIRED');
  const event=JSON.parse(matches[0].result);
  const grant=db.prepare(
   'SELECT actor,merchant,category,cap,used,revoked,expires,revision '+
   'FROM innovation_delegations WHERE id=?'
  ).get(event.consentId);
  const stamp=now();
  if(!Number.isSafeInteger(stamp)||stamp<0||
     !event||!ID.test(event.consentId??'')||
     event.transcriptSha256!==evidence.transcriptSha256||
     event.quoteBinding?.quoteId!==quoteScope.quoteId||
     event.quoteBinding?.quoteVersion!==before.version||
     event.quoteBinding?.quoteFingerprint!==before.fingerprint||
     !grant||grant.actor!==scope.actor||grant.merchant!==scope.merchant||
     grant.category!=='services'||grant.cap!==150||grant.used!==150||
     grant.revoked!==0||grant.expires<=stamp||
     !Number.isSafeInteger(grant.revision)||grant.revision<1)
   fail('OWNER_150_CROSSPART_BOUND_CONSENT_INVALID');
  return {consentId:event.consentId,consentRevision:grant.revision,
   expiresAt:grant.expires};
 });
 const after=readQuote();
 if(after.version!==before.version||after.revision!==before.revision||
    after.fingerprint!==before.fingerprint||linkCandidate.expiresAt<=now())
  fail('OWNER_150_CROSSPART_EVIDENCE_CHANGED_DURING_READ');
 return Object.freeze({
  status:'OWNER_PRIVATE_150_LOCAL_CROSSPART_CANDIDATE_NOT_LINKED',
  quoteId:quoteScope.quoteId,quoteVersion:before.version,
  quoteFingerprint:before.fingerprint,
  consentId:linkCandidate.consentId,
  consentRevision:linkCandidate.consentRevision,
  expiresAt:linkCandidate.expiresAt,
  transcriptSha256:evidence.transcriptSha256,
  amountMinor:150,currency:'USD',
  localQuoteApproved:true,localA2ARecordsMatch:true,
  trustLevel:'LOCAL_SQLITE_CONSISTENCY_ONLY',
  trustedBuyerSessionVerified:false,
  merchantOwnershipVerified:false,independentGeminiAttestation:false,
  crossPartReviewLinked:false,sameTransactionProven:false,
  paymentAuthorized:false,paypalCreatePerformed:false,
  paypalCapturePerformed:false,networkRequests:0,fileWritesPerformed:false
 });
}
