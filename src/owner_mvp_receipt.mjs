// Read-only owner-side evidence snapshot after one privately authorized Sandbox
// MVP run. NEVER performs fresh PayPal GET, Gemini, payment POST or a DB write.
// Local SQLite can be altered by the file owner: no third-party attestation.
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {lstatSync} from 'node:fs';
import {join} from 'node:path';
import {inspectOwnerMvpLocalState} from './owner_mvp_local_status.mjs';
import {verifyLocalAudit} from './ledger_audit.mjs';
import {MARKETPLACE_SKILL_NAMES} from './marketplace_match.mjs';

const fail=code=>{const e=new Error(code);e.code=code;throw e};
const EXPECTED_QUOTE='operator_mvp_01';
const EXPECTED_ACTOR='local_operator';
const EXPECTED_AMOUNT=150;
const MAX_DB_BYTES=64*1024*1024;
const skillSet=new Set(MARKETPLACE_SKILL_NAMES);
function checkedRead(directory,name,read){
  const file=join(directory,name);
  let info;
  try{info=lstatSync(file)}
  catch{fail('PRIVATE_RECEIPT_FILE_UNAVAILABLE')}
  if(!info.isFile()||info.size>MAX_DB_BYTES)
    fail('PRIVATE_RECEIPT_FILE_UNSAFE');
  let db;
  try {
    db=new DatabaseSync(file,{readOnly:true});
    db.exec('PRAGMA query_only=ON');
    return read(db);
  }finally{try{db?.close()}catch{}}
}
const digest=value=>createHash('sha256').update(value).digest('hex');
function inspectAI(directory,actor,merchant){
  return checkedRead(directory,'gemini_skills.sqlite',db=>{
    const rows=db.prepare('SELECT actor_id,merchant_id,brief_hash,state,'+
      'skills_json,result_hash FROM marketplace_ai_attempts').all();
    if(rows.length!==1)return {state:'REVIEW_REQUIRED',skills:[],integrity:false};
    const row=rows[0];
    if(row.state!=='COMMITTED'||row.actor_id!==actor||row.merchant_id!==merchant||
       typeof row.brief_hash!=='string'||!/^[0-9a-f]{64}$/.test(row.brief_hash)||
       typeof row.skills_json!=='string'||typeof row.result_hash!=='string')
      return {state:'REVIEW_REQUIRED',skills:[],integrity:false};
    let skills;
    try {skills=JSON.parse(row.skills_json)}
    catch {return {state:'REVIEW_REQUIRED',skills:[],integrity:false}}
    if(!Array.isArray(skills)||skills.length===0||
      skills.length>MARKETPLACE_SKILL_NAMES.length||
      skills.some(s=>typeof s!=='string'||!skillSet.has(s))||
      new Set(skills).size!==skills.length||
      JSON.stringify(MARKETPLACE_SKILL_NAMES.filter(s=>skills.includes(s)))!==row.skills_json||
      digest(JSON.stringify([actor,merchant,row.brief_hash,row.skills_json]))!==row.result_hash)
      return {state:'REVIEW_REQUIRED',skills:[],integrity:false};
    return {state:'COMMITTED',skills,integrity:true};
  });
}
function inspectCheckout(directory){
 return checkedRead(directory,'checkout.sqlite',db=>{
  const quotes=db.prepare('SELECT id,owner_id,merchant_id,version,currency,'+
    'status,approval_actor,approval_version,approval_amount_minor FROM quotes').all();
  const attempts=db.prepare('SELECT quote_id,quote_version,merchant_id,'+
    'operation,state,remote_id,amount_minor,currency,observed_at '+
    'FROM payment_attempts').all();
  const audit=verifyLocalAudit(db);
  const quote=quotes.length===1?quotes[0]:null;
  const amountsBound=quote?.id===EXPECTED_QUOTE&&
    quote.owner_id===EXPECTED_ACTOR&&
    typeof quote.merchant_id==='string'&&
    /^[A-Za-z0-9]{13}$/.test(quote.merchant_id)&&
    quote.version===1&&quote.currency==='USD'&&
    quote.status==='APPROVED'&&quote.approval_actor===EXPECTED_ACTOR&&
    quote.approval_version===1&&
    quote.approval_amount_minor===EXPECTED_AMOUNT;
  const create=attempts.find(a=>a.operation==='create');
  const capture=attempts.find(a=>a.operation==='capture');
  const attemptIsBound=a=>a&&a.quote_id===quote.id&&
    a.quote_version===quote.version&&a.merchant_id===quote.merchant_id&&
    a.amount_minor===EXPECTED_AMOUNT&&a.currency==='USD'&&
    typeof a.remote_id==='string'&&a.remote_id.length>0&&
    typeof a.observed_at==='string'&&a.observed_at.length>0;
  const match=Boolean(amountsBound)&&attempts.length===2&&
    create?.state==='APPROVED'&&capture?.state==='PAID'&&
    attemptIsBound(create)&&attemptIsBound(capture)&&
    create.remote_id!==capture.remote_id;
  return {
   match,actor:amountsBound?quote.owner_id:null,
   merchant:amountsBound?quote.merchant_id:null,
   // Do not expose PayPal order or capture IDs, quote owner or merchant.
   quoteApproved:quote?.status==='APPROVED',
   createState:create?.state??'ABSENT',
   captureState:capture?.state??'ABSENT',
   auditIntegrity:audit.integrity==='PASS'?'PASS':'NEEDS_REVIEW',
   auditEvents:audit.integrity==='PASS'?audit.verifiedEvents:0,
   auditPass:audit.integrity==='PASS'&&audit.verifiedEvents>=4
  };
 });
}
export function inspectOwnerMvpReceipt({directory}={}){
 if(typeof directory!=='string'||directory.length===0)
  fail('PRIVATE_RECEIPT_DIRECTORY_REQUIRED');
 const local=inspectOwnerMvpLocalState({directory});
 let result={
   schemaVersion:1,
   mode:'READ_ONLY_PRIVATE_SQLITE_EVIDENCE_NO_NETWORK',
   status:'LOCAL_EVIDENCE_REVIEW_REQUIRED',
   ownerReportedLiveRunNotIndependentlyAttested:true,
   providerGetPerformedNow:false,providerPostPerformedNow:false,
   geminiCallPerformedNow:false,sqliteWritesPerformed:false,
   secretsRead:false,privateIdentifiersPrinted:false,
   freshRemotePaymentProof:false,productionOrLivePaymentProof:false,
   safeToRepeatPayment:false,
   localStates:local.states,localFiles:local.files,
   amountMinor:null,currency:null,
   classifiedSkills:[],localAuditIntegrity:'NOT_CHECKED',localAuditEvents:0
 };
 if(local.status==='CLEAN_LOCAL_ONE_SHOT')
  return Object.freeze({...result,status:'NO_LOCAL_ATTEMPT'});
 if(Object.values(local.files).some(v=>v!=='PRESENT'))
  return Object.freeze(result);
 try{
  const checkout=inspectCheckout(directory);
  const ai=checkout.actor&&checkout.merchant?
    inspectAI(directory,checkout.actor,checkout.merchant):null;
  const full=checkout.match&&checkout.auditPass&&ai?.integrity===true&&
    local.states.capture==='PAID'&&local.states.create==='APPROVED'&&
    local.states.quote==='APPROVED'&&local.states.gemini==='COMMITTED';
  result={...result,
    status:full?'LOCAL_PROVIDER_RESULT_RECORDED_NOT_FRESH_GET':
      'LOCAL_EVIDENCE_REVIEW_REQUIRED',
    amountMinor:full?EXPECTED_AMOUNT:null,currency:full?'USD':null,
    classifiedSkills:full?[...ai.skills]:[],
    localAuditIntegrity:checkout.auditIntegrity,
    localAuditEvents:checkout.auditEvents};
 }catch{
   // Unreadable, foreign, tampered or legacy files are not payment evidence.
   result={...result,status:'LOCAL_EVIDENCE_REVIEW_REQUIRED'};
 }
 return Object.freeze(result);
}
