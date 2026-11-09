// All fixtures use temporary private SQLite and injected fake Gemini roles.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {prepareFreshOwnerSandbox150Quote} from '../src/owner_sandbox_150_quote_prepare.mjs';
import {inspectOwnerProposedA2AQuote}
 from '../src/owner_private_a2a_quote_binding.mjs';
import {createOwnerPrivateGeminiInnovationLab}
 from '../src/owner_private_gemini_innovation_lab.mjs';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {inspectPrivatePart2A2A} from '../src/owner_private_two_part_evidence.mjs';
import {inspectOwnerSandbox150ApprovalReadiness,approveOwnerSandbox150Quote}
 from '../src/owner_sandbox_150_quote_approval.mjs';

const actorId='operator_owner',merchantId='A1B2C3D4E5F6G';
const quoteId='worknova_a2a_150_once';
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'worknova-150-approval-'));
 const privateDirectory=join(dir,'owner-private');
 const filename=join(privateDirectory,'owner-sandbox150-part1.sqlite');
 const part2Filename=join(privateDirectory,'part2-owner-sandbox150.sqlite');
 const budgetFilename=join(privateDirectory,'part2-owner-sandbox150-quota.sqlite');
 const quoteScope={filename,actorId,merchantId,quoteId};
 return {dir,privateDirectory,filename,part2Filename,budgetFilename,quoteScope,
  args:{privateDirectory,part2Filename,budgetFilename,quoteScope},
  close:()=>rmSync(dir,{recursive:true,force:true})};
}
const fake=(action,amountMinor)=>new Response(JSON.stringify({
 candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({
  action,amountMinor
 })}]}}],usageMetadata:{totalTokenCount:40}
}),{status:200,headers:{'content-type':'application/json'}});
async function seed(f,{negotiate=true}={}){
 await prepareFreshOwnerSandbox150Quote({
  privateDirectory:f.privateDirectory,actorId,merchantId,quoteId
 });
 if(!negotiate)return;
 const binding=inspectOwnerProposedA2AQuote(f.quoteScope);
 let lab,calls=0;
 try{
  lab=createOwnerPrivateGeminiInnovationLab({
   filename:f.part2Filename,budgetFilename:f.budgetFilename,
   scope:{actor:actorId,merchant:merchantId,job:'part2_sandbox_150_once'},
   apiKey:'FAKE_INJECTED_NOT_PROVIDER',fetchImpl:async()=>{
    calls++;return fake(calls===1?'OFFER':'ACCEPT',150);
   },ownerAuthorized:true,freeTierConfirmed:true,operatorConfirmed:true,
   sandboxPilotSellerFloorMinor:150,quoteBinding:binding
  });
  const consent=lab.delegate({key:'once',maxMinor:150,expiresInMinutes:15});
  const result=await lab.negotiate({key:'once',consentId:consent.consentId});
  assert.equal(result.status,'SYNTHETIC_AGREEMENT');
  assert.equal(calls,2);
 }finally{lab?.close()}
}
test('owner exact $1.50 private quote approval requires persisted bound A2A and separate consent',async()=>{
 const f=fixture();
 try{
  await seed(f);
  const review=inspectOwnerSandbox150ApprovalReadiness(f.args);
  assert.equal(review.status,'OWNER_SANDBOX150_EXACT_AGREEMENT_READY_FOR_LOCAL_APPROVAL');
  assert.equal(review.amountMinor,150);
  assert.equal(review.localOwnerApprovalRequired,true);
  assert.equal(review.independentGeminiAttestation,false);
  const prior=readFileSync(f.filename);
  await assert.rejects(approveOwnerSandbox150Quote(f.args),{
   code:'OWNER_SANDBOX150_EXPLICIT_APPROVAL_REQUIRED'
  });
  assert.deepEqual(readFileSync(f.filename),prior);
  const approved=await approveOwnerSandbox150Quote({
   ...f.args,explicitOwnerConsent:true
  });
  assert.equal(approved.status,'OWNER_LOCAL_EXACT_150_QUOTE_APPROVED_NOT_PAYMENT');
  assert.equal(approved.localOwnerApprovalRecorded,true);
  assert.equal(approved.paymentAuthorized,false);
  const ledger=createSqliteLedger({filename:f.filename});
  try{
   const q=await ledger.get(quoteId);
   assert.equal(q.status,'APPROVED');
   assert.equal(q.approval.amountMinor,150);
   assert.equal(q.approval.actorId,actorId);
   assert.deepEqual(await ledger.listAttempts(quoteId),[]);
  }finally{ledger.close()}
  await assert.rejects(approveOwnerSandbox150Quote({
   ...f.args,explicitOwnerConsent:true
  }),{code:'OWNER_A2A_UNAPPROVED_UNPAID_QUOTE_REQUIRED'});
 }finally{f.close()}
});
test('missing Part2 agreement rejects approval; original proposal remains unchanged',async()=>{
 const f=fixture();
 try{
  await seed(f,{negotiate:false});
  const before=readFileSync(f.filename);
  assert.throws(()=>inspectOwnerSandbox150ApprovalReadiness(f.args),{
   code:'OWNER_SANDBOX150_BOUND_AGREEMENT_NOT_READY'
  });
  await assert.rejects(approveOwnerSandbox150Quote({
   ...f.args,explicitOwnerConsent:true
  }),{code:'OWNER_SANDBOX150_BOUND_AGREEMENT_NOT_READY'});
  assert.deepEqual(readFileSync(f.filename),before);
 }finally{f.close()}
});
test('changed or different $1.50 quote cannot borrow previous A2A evidence',async()=>{
 const f=fixture();
 try{
  await seed(f);
  const ledger=createSqliteLedger({filename:f.filename});
  try{
   await ledger.revise({id:quoteId,actorId,expectedVersion:1,
    scope:'Changed contract after model',suggestedMinor:150,
    suggestionSource:'OFFLINE_MOCK'});
  }finally{ledger.close()}
  assert.throws(()=>inspectOwnerSandbox150ApprovalReadiness(f.args),{
   code:'OWNER_SANDBOX150_BOUND_AGREEMENT_NOT_READY'
  });
  await assert.rejects(approveOwnerSandbox150Quote({
   ...f.args,explicitOwnerConsent:true
  }),{code:'OWNER_SANDBOX150_BOUND_AGREEMENT_NOT_READY'});
 }finally{f.close()}
});
test('revoked trusted buyer member prevents approval even with valid persisted A2A',async()=>{
 const f=fixture();
 try{
  await seed(f);
  const ledger=createSqliteLedger({filename:f.filename});
  try{
   await ledger.setLocalMemberActive({
    actorId,expectedRevision:1,active:false
   });
  }finally{ledger.close()}
  await assert.rejects(approveOwnerSandbox150Quote({
   ...f.args,explicitOwnerConsent:true
  }),{code:'OWNER_SANDBOX150_BUYER_MEMBERSHIP_REQUIRED'});
  const second=createSqliteLedger({filename:f.filename});
  try{assert.equal((await second.get(quoteId)).status,'PROPOSED')}
  finally{second.close()}
 }finally{f.close()}
});
test('private approval route refuses arbitrary legacy files and extra paths',async()=>{
 const f=fixture();
 try{
  await seed(f);
  assert.throws(()=>inspectOwnerSandbox150ApprovalReadiness({
   ...f.args,quoteScope:{...f.quoteScope,
    filename:join(f.dir,'historical-paid.sqlite')}
  }),{code:'OWNER_SANDBOX150_DEDICATED_PRIVATE_PATH_REQUIRED'});
  assert.throws(()=>inspectOwnerSandbox150ApprovalReadiness({
   ...f.args,part2Filename:join(f.dir,'external-agent.sqlite')
  }),{code:'OWNER_SANDBOX150_DEDICATED_PRIVATE_PATH_REQUIRED'});
 }finally{f.close()}
});
test('sandbox evidence denies locally rehashed transcript missing final ACCEPT',async()=>{
 const f=fixture();
 try{
  await seed(f);
  const db=new DatabaseSync(f.part2Filename);
  try{
   const row=db.prepare("SELECT result FROM innovation_events WHERE actor=? AND merchant=? AND kind='a2a'")
    .get(actorId,merchantId);
   const body=JSON.parse(row.result);
   body.messages.at(-1).action='COUNTER';
   body.transcriptSha256=createHash('sha256').update(JSON.stringify(body.messages))
    .digest('hex');
   const updated=db.prepare(
    "UPDATE innovation_events SET result=? WHERE actor=? AND merchant=? AND kind='a2a'"
   ).run(JSON.stringify(body),actorId,merchantId);
   assert.equal(updated.changes,1);
  }finally{db.close()}
  assert.equal(inspectPrivatePart2A2A({
   filename:f.part2Filename,budgetFilename:f.budgetFilename,
   scope:{actor:actorId,merchant:merchantId,job:'part2_sandbox_150_once'},
   sandboxPilotQuoteId:quoteId
  }).status,'PART2_EVIDENCE_REVIEW_REQUIRED');
  assert.throws(()=>inspectOwnerSandbox150ApprovalReadiness(f.args),{
   code:'OWNER_SANDBOX150_BOUND_AGREEMENT_NOT_READY'
  });
 }finally{f.close()}
});
test('operator CLI default, wrong flags and no TTY do not read keys or touch private files',()=>{
 const f=fixture();
 try{
  const cli=fileURLToPath(new URL('../scripts/approve_owner_sandbox_150_quote.mjs',import.meta.url));
  const before=readdirSync(f.dir);
  for(const args of [[],['--approve-exact-150'],['--approve-exact-150','--review']]){
   const run=spawnSync(process.execPath,['--experimental-sqlite',cli,...args],{
    encoding:'utf8',timeout:15000,env:{...process.env,
     HOME:f.dir,USERPROFILE:f.dir,NODE_NO_WARNINGS:'1',
     GEMINI_API_KEY:'PRIVATE_SENTINEL_NEVER_ECHO',
     PAYPAL_SANDBOX_CLIENT_SECRET:'PRIVATE_PAYPAL_SENTINEL'}
   });
   assert.equal(run.error,undefined);
   assert.equal(run.stderr,'');
   const body=JSON.parse(run.stdout);
   assert.equal(body.status,args.length===1?'PRIVATE_TTY_REQUIRED':
    'DRY_RUN_NO_DISK_NO_NETWORK');
   assert.equal(body.networkRequests,0);
   assert.equal(body.paymentAuthorized,false);
   assert.doesNotMatch(run.stdout,/PRIVATE_SENTINEL|PRIVATE_PAYPAL/);
  }
  assert.deepEqual(readdirSync(f.dir),before);
 }finally{f.close()}
});
