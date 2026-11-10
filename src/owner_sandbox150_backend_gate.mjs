// Local-only read-only progression gate for the exact USD $1.50 owner pilot.
// Does not authenticate an external buyer, attest Gemini, authorize a payment,
// create/capture a Sandbox order or imply Production readiness.
import {DatabaseSync} from 'node:sqlite';
import {lstatSync,realpathSync} from 'node:fs';
import {join,resolve,relative,sep,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectOwnerSandbox150ApprovalReadiness}
 from './owner_sandbox_150_quote_approval.mjs';
import {inspectOwnerSandbox150CrossPartReadiness}
 from './owner_private_crosspart_readiness.mjs';
import {inspectOwnerSandbox150ExistingOrder}
 from './owner_sandbox_150_get_recovery.mjs';

const FILE='owner-sandbox150-part1.sqlite';
const ID=/^[A-Za-z0-9_-]{1,64}$/;
const MERCHANT=/^[A-Za-z0-9]{13}$/;
const deny=code=>{const e=new Error(code);e.code=code;throw e};
const OUT=Object.freeze({
 mode:'WORKNOVA_OWNER_150_READONLY_BACKEND_GATE',
 networkRequests:0,fileWritesPerformed:false,providerPostsPerformed:false,
 geminiProviderAttested:false,paypalProviderAttested:false,
 independentBuyerIdentityVerified:false,merchantOwnershipVerified:false,
 paymentAuthorized:false,productionReady:false,autoRetry:false
});
const stage=(status,nextAction,more={})=>
 Object.freeze({...OUT,status,nextAction,...more});
function checkedPrivateDir(dir,cwd){
 if(typeof dir!=='string'||!isAbsolute(dir)||typeof cwd!=='string')
  deny('OWNER150_GATE_ISOLATED_PATH_REQUIRED');
 let st,actual;
 try{
  st=lstatSync(dir);actual=realpathSync(dir);
 }catch{deny('OWNER150_GATE_PRIVATE_DIRECTORY_NOT_FOUND')}
 const rel=relative(resolve(cwd),actual);
 if(!st.isDirectory()||st.isSymbolicLink()||
    !(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)))
  deny('OWNER150_GATE_PRIVATE_DIRECTORY_UNSAFE');
 return actual;
}
function checkedDb(file,dir,cwd){
 if(typeof file!=='string'||resolve(file)!==resolve(join(dir,FILE)))
  deny('OWNER150_GATE_DEDICATED_QUOTE_REQUIRED');
 let st,actual;
 try{st=lstatSync(file);actual=realpathSync(file)}
 catch{deny('OWNER150_GATE_QUOTE_NOT_FOUND')}
 const rel=relative(resolve(cwd),actual);
 if(!st.isFile()||st.isSymbolicLink()||st.size<100||
    st.size>64*1024*1024||
    !(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)))
  deny('OWNER150_GATE_QUOTE_UNSAFE');
 for(const suffix of ['-wal','-shm']){
  try{lstatSync(file+suffix);deny('OWNER150_GATE_ACTIVE_SQLITE_STOP')}
  catch(e){if(e?.code!=='ENOENT')throw e}
 }
 return actual;
}
function quoteSnapshot(filename,scope){
 let db;
 try{
  db=new DatabaseSync(pathToFileURL(filename).href+'?immutable=1',
   {readOnly:true});
  db.exec('PRAGMA query_only=ON');
  const q=db.prepare('SELECT id,owner_id,merchant_id,version,currency,status,'+
   'approval_actor,approval_version,approval_amount_minor,rejection_reason '+
   'FROM quotes WHERE id=?').get(scope.quoteId);
  const member=db.prepare('SELECT merchant_id,role,active,revision '+
   'FROM marketplace_actor_memberships WHERE actor_id=?').get(scope.actorId);
  const attempts=db.prepare('SELECT COUNT(*) AS n FROM payment_attempts WHERE quote_id=?')
   .get(scope.quoteId)?.n;
  if(!q||q.id!==scope.quoteId||q.owner_id!==scope.actorId||
     q.merchant_id!==scope.merchantId||q.version!==1||
     q.currency!=='USD'||!['PROPOSED','APPROVED'].includes(q.status)||
     q.rejection_reason!==null||
     member?.merchant_id!==scope.merchantId||member.role!=='buyer'||
     member.active!==1||!Number.isSafeInteger(member.revision)||
     member.revision<1||!Number.isSafeInteger(attempts)||attempts<0||
     attempts>2)
    deny('OWNER150_GATE_QUOTE_OR_MEMBERSHIP_INVALID');
  if(q.status==='PROPOSED'&&
    (q.approval_actor!==null||q.approval_version!==null||
     q.approval_amount_minor!==null||attempts!==0))
   deny('OWNER150_GATE_PROPOSAL_CHANGED');
  if(q.status==='APPROVED'&&
    (q.approval_actor!==scope.actorId||
     q.approval_version!==1||q.approval_amount_minor!==150))
   deny('OWNER150_GATE_APPROVAL_MISMATCH');
  return {status:q.status,attempts};
 }catch(e){
  if(e?.code?.startsWith('OWNER150_GATE_'))throw e;
  deny('OWNER150_GATE_SQLITE_INSPECTION_FAILED');
 }finally{try{db?.close()}catch{}}
}
// Optional explicit operator inspection. Avoid calling this during ordinary
// tests, imports or a no-flag CLI invocation. This is NOT release proof.
export function inspectOwnerSandbox150BackendGate({
 privateDirectory,quoteScope,part2Filename,budgetFilename,
 cwd=process.cwd(),now=Date.now
}={}){
 const dir=checkedPrivateDir(privateDirectory,cwd);
 if(!quoteScope||!ID.test(quoteScope.actorId??'')||
    !MERCHANT.test(quoteScope.merchantId??'')||
    !ID.test(quoteScope.quoteId??'')||
    resolve(quoteScope.filename??'')!==resolve(join(dir,FILE))||
    resolve(part2Filename??'')!==resolve(join(dir,'part2-owner-sandbox150.sqlite'))||
    resolve(budgetFilename??'')!==resolve(join(dir,'part2-owner-sandbox150-quota.sqlite')))
  deny('OWNER150_GATE_ISOLATED_PATH_REQUIRED');
 const file=checkedDb(quoteScope.filename,dir,cwd);
 const snapshot=quoteSnapshot(file,quoteScope);
 if(snapshot.status==='PROPOSED'){
  // Distinguish a complete private model negotiation from a mere quote
  // proposal. Neither state grants payment approval or warrants another
  // Gemini POST if prior budget claims are UNKNOWN.
  try{
   const approval=inspectOwnerSandbox150ApprovalReadiness({
    privateDirectory:dir,quoteScope,part2Filename,budgetFilename,cwd
   });
   if(approval.status==='OWNER_SANDBOX150_EXACT_AGREEMENT_READY_FOR_LOCAL_APPROVAL')
    return stage('A2A_AGREEMENT_READY_FOR_HUMAN_APPROVAL_ONLY',
     'OWNER_EXPLICIT_EXACT_QUOTE_APPROVAL_SEPARATE_FROM_PAYMENT');
  }catch{}
  return stage('QUOTE_PROPOSED_NOT_HUMAN_APPROVED',
   'REVIEW_EXISTING_PART2_EVIDENCE_THEN_SEPARATELY_APPROVE_EXACT_QUOTE');
 }
 if(snapshot.attempts>0){
  // A first-claim exists. Never suggest a new POST, even if the order ID
  // was not persisted: the provider may have committed before a timeout.
  try{
   const recovery=inspectOwnerSandbox150ExistingOrder(quoteScope);
   return stage('PAYPAL_ORDER_ALREADY_CLAIMED_GET_ONLY',
    'EXPLICIT_EXISTING_SANDBOX_GET_RECONCILIATION_ONLY',{
     localCreateState:recovery.localCreateState,
     localCaptureState:recovery.localCaptureState
    });
  }catch{
   return stage('PAYPAL_CLAIM_UNKNOWN_MANUAL_REVIEW_NO_RETRY',
    'REVIEW_PRIVATE_PAYMENT_LEDGER_NO_CREATE_OR_CAPTURE_RETRY');
  }
 }
 try{
  const cross=inspectOwnerSandbox150CrossPartReadiness({
   privateDirectory:dir,quoteScope,part2Filename,budgetFilename,cwd,now
  });
  if(cross.status!=='OWNER_PRIVATE_150_LOCAL_CROSSPART_CANDIDATE_NOT_LINKED'||
     cross.amountMinor!==150||cross.localQuoteApproved!==true||
     cross.localA2ARecordsMatch!==true)
   deny('OWNER150_GATE_CROSSPART_NOT_READY');
  return stage('LOCAL_SAME_QUOTE_CANDIDATE_READY_NOT_PAYMENT',
   'INDEPENDENT_OIDC_BUYER_AND_SEPARATELY_AUTHORIZED_SANDBOX_LIFECYCLE_REQUIRED',{
    sameQuoteLocalEvidence:true,crossPartReviewLinked:false
   });
 }catch{
  return stage('APPROVED_QUOTE_CROSSPART_REVIEW_REQUIRED',
   'REVIEW_LOCAL_PART2_CONSENT_AND_QUOTE_BEFORE_TRUSTED_BUYER_SESSION');
 }
}
