// Runtime read-only adapter for a FINISHED owner $1.50 A2A negotiation.
// The checkout host must not reopen the paid/free Gemini transport or hold its
// API key just to inspect an existing private local consent. Never make provider
// requests, claim Gemini quota, create DBs, or reinterpret local hashes as
// independent provider attestation.
import {DatabaseSync} from 'node:sqlite';
import {lstatSync,realpathSync} from 'node:fs';
import {join,resolve,relative,isAbsolute,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectPrivatePart2A2A} from './owner_private_two_part_evidence.mjs';

const ID=/^[A-Za-z0-9_-]{1,64}$/;
const MERCHANT=/^[A-Za-z0-9]{13}$/;
const SHA=/^[a-f0-9]{64}$/;
const deny=code=>{const error=new Error(code);error.code=code;throw error;};
const outside=(path,root)=>{
 const diff=relative(resolve(root),resolve(path));
 return diff==='..'||diff.startsWith('..'+sep)||isAbsolute(diff);
};
const fileNames=Object.freeze({
 quote:'owner-sandbox150-part1.sqlite',
 part2:'part2-owner-sandbox150.sqlite',
 budget:'part2-owner-sandbox150-quota.sqlite'
});
const noSidecars=file=>{
 for(const suffix of ['-wal','-shm']){
  try{lstatSync(file+suffix);deny('OWNER150_A2A_READONLY_ACTIVE_SQLITE')}
  catch(e){if(e?.code!=='ENOENT')throw e}
 }
};
function checkedDir(dir,cwd){
 let dirStat,real;
 try{dirStat=lstatSync(dir);real=realpathSync(dir)}
 catch{deny('OWNER150_A2A_READONLY_PRIVATE_DIRECTORY_REQUIRED')}
 if(!dirStat.isDirectory()||dirStat.isSymbolicLink()||
    !outside(real,cwd))
  deny('OWNER150_A2A_READONLY_PRIVATE_DIRECTORY_REQUIRED');
 return real;
}
function checkedFile(file,expected,root,cwd,{readSnapshot=true}={}){
 if(typeof file!=='string'||!isAbsolute(file)||
    resolve(file)!==resolve(join(root,expected)))
  deny('OWNER150_A2A_READONLY_EXACT_PATH_REQUIRED');
 let stat,real;
 try{stat=lstatSync(file);real=realpathSync(file)}
 catch{deny('OWNER150_A2A_READONLY_FILE_UNAVAILABLE')}
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>64*1024*1024||
    !outside(real,cwd)||resolve(real)!==resolve(file))
  deny('OWNER150_A2A_READONLY_FILE_UNSAFE');
 // The approved Part1 quote is owned by the active checkout ledger, which
 // legitimately keeps its own SQLite WAL/SHM while serving requests. We only
 // validate that file's fixed path; do not read it via an immutable snapshot.
 // The Part2 evidence and quota files *are* read here and must be quiescent.
 if(readSnapshot)noSidecars(file);
 return file;
}
// Completely inert creation: validated config only. No env access, credentials,
// provider transport, network or DB allocation. Read occurs on .state().
export function createOwnerSandbox150ReadOnlyA2AStore({
 privateDirectory,quoteScope,part2Filename,budgetFilename,
 quoteBinding,cwd=process.cwd(),now=Date.now
}={}){
 if(typeof privateDirectory!=='string'||!isAbsolute(privateDirectory)||
    typeof cwd!=='string'||!ID.test(quoteScope?.quoteId??'')||
    !ID.test(quoteScope?.actorId??'')||
    !MERCHANT.test(quoteScope?.merchantId??'')||
    typeof quoteScope?.filename!=='string'||
    resolve(quoteScope.filename)!==resolve(join(privateDirectory,fileNames.quote))||
    resolve(part2Filename??'')!==resolve(join(privateDirectory,fileNames.part2))||
    resolve(budgetFilename??'')!==resolve(join(privateDirectory,fileNames.budget))||
    quoteBinding?.quoteId!==quoteScope.quoteId||
    quoteBinding?.actorId!==quoteScope.actorId||
    quoteBinding?.merchantId!==quoteScope.merchantId||
    quoteBinding?.quoteStatus!=='PROPOSED_NOT_PAYMENT_AUTHORITY'||
    quoteBinding?.amountMinor!==150||quoteBinding?.currency!=='USD'||
    !Number.isSafeInteger(quoteBinding?.quoteVersion)||
    quoteBinding.quoteVersion<1||
    !SHA.test(quoteBinding?.quoteFingerprint??'')||
    typeof now!=='function')
  deny('OWNER150_A2A_READONLY_CONFIG_REQUIRED');
 let closed=false;
 const scope=Object.freeze({
  actor:quoteScope.actorId,merchant:quoteScope.merchantId,
  job:'part2_sandbox_150_once'
 });
 const status=()=>Object.freeze({
  mode:'PRIVATE_A2A_READ_ONLY_NO_PROVIDER',
  geminiCalls:0,paypalCalls:0,
  independentProviderAttestation:false,paymentAuthorized:false
 });
 function state({actor,merchant}={}){
  if(closed)deny('OWNER150_A2A_READONLY_STORE_CLOSED');
  if(actor!==scope.actor||merchant!==scope.merchant)
   deny('OWNER150_A2A_READONLY_ACTOR_SCOPE_REQUIRED');
  const base=checkedDir(privateDirectory,cwd);
  checkedFile(quoteScope.filename,fileNames.quote,base,cwd,{readSnapshot:false});
  const part=checkedFile(part2Filename,fileNames.part2,base,cwd);
  const budget=checkedFile(budgetFilename,fileNames.budget,base,cwd);
  const proof=inspectPrivatePart2A2A({
   filename:part,budgetFilename:budget,scope,
   sandboxPilotQuoteId:quoteScope.quoteId
  });
  if(proof.status!=='PRIVATE_A2A_SQLITE_RESULT_NOT_GEMINI_ATTESTED'||
     proof.amountMinor!==150||proof.quotaClaims<2||proof.quotaClaims>4||
     proof.delegationStillValidNow!==true||
     proof.boundQuoteId!==quoteBinding.quoteId||
     proof.boundQuoteVersion!==quoteBinding.quoteVersion||
     proof.boundQuoteFingerprint!==quoteBinding.quoteFingerprint)
   deny('OWNER150_A2A_READONLY_AGREEMENT_NOT_CURRENT');
  let db;
  try{
   db=new DatabaseSync(pathToFileURL(part).href+'?immutable=1',{readOnly:true});
   db.exec('PRAGMA query_only=ON');
   const events=db.prepare("SELECT result,created FROM innovation_events "+
    "WHERE actor=? AND merchant=? AND kind='a2a' ORDER BY id DESC LIMIT 2")
    .all(actor,merchant);
   if(events.length!==1)deny('OWNER150_A2A_READONLY_UNIQUE_EVENT_REQUIRED');
   const result=JSON.parse(events[0].result);
   const consent=db.prepare("SELECT id,category,cap AS maxMinor,"+
    "used AS usedMinor,expires AS expiresAt,revoked,revision "+
    "FROM innovation_delegations WHERE id=? AND actor=? AND merchant=?")
    .get(result.consentId,actor,merchant);
   const current=now();
   if(!Number.isSafeInteger(current)||current<0||
      !consent||consent.category!=='services'||consent.revoked!==0||
      consent.usedMinor!==150||consent.maxMinor!==150||
      consent.expiresAt<=current||
      result.transcriptSha256!==proof.transcriptSha256||
      result.quoteBinding?.quoteId!==quoteBinding.quoteId||
      result.quoteBinding?.quoteVersion!==quoteBinding.quoteVersion||
      result.quoteBinding?.quoteFingerprint!==quoteBinding.quoteFingerprint)
    deny('OWNER150_A2A_READONLY_CONSENT_INVALID');
   const view=Object.freeze({
    mode:'PRIVATE_INJECTED_AGENT_NOT_ATTESTED',
    providerCalls:'NOT_ATTESTED',
    providerEvidence:'EXTERNAL_TRANSPORT_NOT_ATTESTED',
    realGemini:false,realPayPal:false,
    paymentState:'NOT_PAID',paymentAuthorized:false,
    consents:Object.freeze([Object.freeze({...consent,active:false})]),
    events:Object.freeze([Object.freeze({
     kind:'a2a',createdAt:events[0].created,
     result:Object.freeze(result)
    })])
   });
   noSidecars(part);
   noSidecars(budget);
   return view;
  }catch(e){
   if(typeof e?.code==='string'&&e.code.startsWith('OWNER150_A2A_READONLY_'))
    throw e;
   deny('OWNER150_A2A_READONLY_EVIDENCE_UNAVAILABLE');
  }finally{try{db?.close()}catch{}}
 }
 return Object.freeze({
  state,status,close:()=>{closed=true},
  mode:'PRIVATE_COMPLETED_A2A_READ_ONLY_NOT_ATTESTED',
  networkEnabled:false,geminiTransportProvided:false,
  paypalTransportProvided:false,paymentAuthorized:false
 });
}
