// Owner-local preparation for ONE new, unapproved $1.50 pilot quote.
// NEVER opens an existing Part1 database for write, approves a quote, or
// contacts Gemini/PayPal. Target filename is reserved with exclusive wx.
import {openSync,closeSync,lstatSync,mkdirSync,realpathSync} from 'node:fs';
import {isAbsolute,join,relative,resolve,sep} from 'node:path';
import {createSqliteLedger} from './sqlite_ledger.mjs';
import {inspectOwnerProposedA2AQuote} from './owner_private_a2a_quote_binding.mjs';

const ID=/^[A-Za-z0-9_-]{1,64}$/;
const MERCHANT=/^[A-Za-z0-9]{13}$/;
const FILE='owner-sandbox150-part1.sqlite';
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const within=(child,base)=>{
 const r=relative(resolve(base),resolve(child));
 return r===''||(!r.startsWith('..'+sep)&&r!=='..'&&!isAbsolute(r));
};
export async function prepareFreshOwnerSandbox150Quote({
 privateDirectory,actorId='operator_owner',merchantId,
 quoteId='worknova_a2a_150_once',cwd=process.cwd()
}={}){
 if(typeof privateDirectory!=='string'||!isAbsolute(privateDirectory)||
    typeof cwd!=='string'||!ID.test(actorId??'')||
    !MERCHANT.test(merchantId??'')||!ID.test(quoteId??''))
  fail('OWNER_SANDBOX150_PREPARE_SCOPE_REQUIRED');
 const dir=resolve(privateDirectory);
 if(within(dir,cwd))fail('OWNER_SANDBOX150_OUTSIDE_REPOSITORY_REQUIRED');
 // Never follow an existing directory symlink into a project or protected
 // location; the owner must explicitly provide a normal private folder.
 try{
  const existing=lstatSync(dir);
  if(!existing.isDirectory()||existing.isSymbolicLink())
   fail('OWNER_SANDBOX150_PRIVATE_DIRECTORY_UNSAFE');
 }catch(e){if(e?.code!=='ENOENT')throw e;}
 mkdirSync(dir,{recursive:true,mode:0o700});
 if(within(realpathSync(dir),cwd))
  fail('OWNER_SANDBOX150_OUTSIDE_REPOSITORY_REQUIRED');
 const filename=join(dir,FILE);
 // O_EXCL means an existing file, even a damaged/partially created one,
 // is NEVER overwritten, migrated, repaired or automatically deleted.
 let fd;
 try{fd=openSync(filename,'wx',0o600);}
 catch(e){
  if(e?.code==='EEXIST')fail('OWNER_SANDBOX150_EXISTING_DB_REVIEW_REQUIRED');
  throw e;
 }
 closeSync(fd);
 let ledger;
 try{
  ledger=createSqliteLedger({filename});
  await ledger.provisionLocalMember({actorId,merchantId,role:'buyer'});
  await ledger.insertQuote({id:quoteId,ownerId:actorId,merchantId,
   version:1,status:'PROPOSED',currency:'USD'});
 }finally{try{ledger?.close()}catch{}}
 const bound=inspectOwnerProposedA2AQuote({
  filename,actorId,merchantId,quoteId,cwd
 });
 return Object.freeze({
  status:'OWNER_PRIVATE_PROPOSED_QUOTE_CREATED',
  quoteId:bound.quoteId,quoteVersion:bound.quoteVersion,
  quoteFingerprint:bound.quoteFingerprint,
  targetNegotiationAmountMinor:150,currency:'USD',
  quoteHumanApproved:false,merchantOwnershipVerified:false,
  paymentAuthorized:false,paypalCreatePerformed:false,
  paypalCapturePerformed:false,geminiPostPerformed:false,
  networkRequests:0,
  localLedgerEnvironmentName:'WORKNOVA_OWNER_LEDGER_PATH',
  localEvidenceLocation:'PRIVATE_OWNER_HOME_ONLY'
 });
}
