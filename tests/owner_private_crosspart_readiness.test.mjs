import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {prepareFreshOwnerSandbox150Quote} from '../src/owner_sandbox_150_quote_prepare.mjs';
import {inspectOwnerProposedA2AQuote} from '../src/owner_private_a2a_quote_binding.mjs';
import {createOwnerPrivateGeminiInnovationLab} from '../src/owner_private_gemini_innovation_lab.mjs';
import {approveOwnerSandbox150Quote} from '../src/owner_sandbox_150_quote_approval.mjs';
import {inspectOwnerSandbox150CrossPartReadiness}
 from '../src/owner_private_crosspart_readiness.mjs';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';

const actor='operator_owner',merchant='A1B2C3D4E5F6G',quoteId='worknova_a2a_150_once';
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'worknova-150-link-ready-'));
 const privateDirectory=join(root,'pilot');
 const filename=join(privateDirectory,'owner-sandbox150-part1.sqlite');
 const part2Filename=join(privateDirectory,'part2-owner-sandbox150.sqlite');
 const budgetFilename=join(privateDirectory,'part2-owner-sandbox150-quota.sqlite');
 const quoteScope={filename,actorId:actor,merchantId:merchant,quoteId};
 return {root,privateDirectory,filename,part2Filename,budgetFilename,quoteScope,
  options:{privateDirectory,quoteScope,part2Filename,budgetFilename},
  close:()=>rmSync(root,{recursive:true,force:true})};
}
const fake=(action,amountMinor)=>new Response(JSON.stringify({
 candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({action,amountMinor})}]}}],
 usageMetadata:{totalTokenCount:40}
}),{status:200,headers:{'content-type':'application/json'}});
async function seed(f){
 await prepareFreshOwnerSandbox150Quote({
  privateDirectory:f.privateDirectory,actorId:actor,merchantId:merchant,quoteId
 });
 const binding=inspectOwnerProposedA2AQuote(f.quoteScope);
 let lab,calls=0;
 try{
  lab=createOwnerPrivateGeminiInnovationLab({
   filename:f.part2Filename,budgetFilename:f.budgetFilename,
   scope:{actor,merchant,job:'part2_sandbox_150_once'},
   quoteBinding:binding,sandboxPilotSellerFloorMinor:150,
   apiKey:'FAKE_NO_PROVIDER',ownerAuthorized:true,
   freeTierConfirmed:true,operatorConfirmed:true,
   fetchImpl:async()=>{
    calls++;return fake(calls===1?'OFFER':'ACCEPT',150);
   }
  });
  const mandate=lab.delegate({key:'mandate',maxMinor:150,expiresInMinutes:15});
  const result=await lab.negotiate({key:'negotiation',consentId:mandate.consentId});
  assert.equal(result.status,'SYNTHETIC_AGREEMENT');
  assert.equal(calls,2);
 }finally{lab?.close()}
}
test('approved quote and exact bound A2A yield read-only candidate, not payment or link',async()=>{
 const f=fixture();
 try{
  await seed(f);
  assert.throws(()=>inspectOwnerSandbox150CrossPartReadiness(f.options),{
   code:'OWNER_150_CROSSPART_APPROVED_QUOTE_OR_BUYER_INVALID'});
  await approveOwnerSandbox150Quote({...f.options,explicitOwnerConsent:true});
  const before=[f.filename,f.part2Filename,f.budgetFilename].map(p=>readFileSync(p));
  const r=inspectOwnerSandbox150CrossPartReadiness(f.options);
  assert.equal(r.status,'OWNER_PRIVATE_150_LOCAL_CROSSPART_CANDIDATE_NOT_LINKED');
  assert.equal(r.localQuoteApproved,true);
  assert.equal(r.localA2ARecordsMatch,true);
  assert.equal(r.amountMinor,150);
  assert.match(r.consentId,/^[0-9a-f-]{36}$/);
  assert.equal(r.paymentAuthorized,false);
  assert.equal(r.crossPartReviewLinked,false);
  assert.equal(r.trustedBuyerSessionVerified,false);
  assert.equal(r.networkRequests,0);
  assert.equal(r.fileWritesPerformed,false);
  assert.deepEqual([f.filename,f.part2Filename,f.budgetFilename].map(p=>readFileSync(p)),before);
 }finally{f.close()}
});
test('same amount different or changed quote fingerprint is denied',async()=>{
 const f=fixture();
 try{
  await seed(f);
  await approveOwnerSandbox150Quote({...f.options,explicitOwnerConsent:true});
  const ledger=createSqliteLedger({filename:f.filename});
  try{
   await ledger.insertQuote({id:'other_same_price',ownerId:actor,merchantId:merchant});
   await ledger.approve({id:'other_same_price',actorId:actor,
    expectedVersion:1,amountMinor:150});
  }finally{ledger.close()}
  assert.throws(()=>inspectOwnerSandbox150CrossPartReadiness({
   ...f.options,quoteScope:{...f.quoteScope,quoteId:'other_same_price'}
  }),{code:'OWNER_150_CROSSPART_BOUND_A2A_EVIDENCE_REQUIRED'});
  const db=new DatabaseSync(f.filename);
  try{
   const out=db.prepare('UPDATE quotes SET scope_text=? WHERE id=?')
    .run('sha256:'+'f'.repeat(64),quoteId);
   assert.equal(out.changes,1);
  }finally{db.close()}
  assert.throws(()=>inspectOwnerSandbox150CrossPartReadiness(f.options),{
   code:'OWNER_150_CROSSPART_BOUND_A2A_EVIDENCE_REQUIRED'
  });
 }finally{f.close()}
});
test('buyer membership revocation and already-started payment block read-only link candidate',async()=>{
 const f=fixture();
 try{
  await seed(f);
  await approveOwnerSandbox150Quote({...f.options,explicitOwnerConsent:true});
  const ledger=createSqliteLedger({filename:f.filename});
  try{
   await ledger.setLocalMemberActive({actorId:actor,expectedRevision:1,active:false});
  }finally{ledger.close()}
  assert.throws(()=>inspectOwnerSandbox150CrossPartReadiness(f.options),{
   code:'OWNER_150_CROSSPART_APPROVED_QUOTE_OR_BUYER_INVALID'});
 }finally{f.close()}
});
test('expired agent delegation prevents cross-part candidate without re-posting Gemini',async()=>{
 const f=fixture();
 try{
  await seed(f);
  await approveOwnerSandbox150Quote({...f.options,explicitOwnerConsent:true});
  const db=new DatabaseSync(f.part2Filename);
  try{db.prepare('UPDATE innovation_delegations SET expires=?').run(Date.now()-1000)}
  finally{db.close()}
  assert.throws(()=>inspectOwnerSandbox150CrossPartReadiness(f.options),{
   code:'OWNER_150_CROSSPART_BOUND_A2A_EVIDENCE_REQUIRED'
  });
 }finally{f.close()}
});
test('private CLI missing flag, approved quote or TTY never performs network or writes',()=>{
 const f=fixture();
 try{
  const cli=fileURLToPath(new URL('../scripts/check_owner_sandbox_150_crosspart.mjs',import.meta.url));
  const before=readdirSync(f.root).sort();
  for(const args of [[],['--unexpected'],['--review']]){
   const out=spawnSync(process.execPath,['--no-warnings','--experimental-sqlite',cli,...args],{
    encoding:'utf8',timeout:15000,
    env:{...process.env,HOME:f.root,USERPROFILE:f.root,
     WORKNOVA_OWNER_ACTOR_ID:'',WORKNOVA_PILOT_QUOTE_ID:'',
     WORKNOVA_OWNER_LEDGER_PATH:'',WORKNOVA_SANDBOX_MERCHANT_ID:merchant,
     PAYPAL_SANDBOX_MERCHANT_ID:'',
     GEMINI_API_KEY:'FAKE_KEY_NOT_SENT',PAYPAL_SANDBOX_CLIENT_SECRET:'SECRET_NOT_SENT'}
   });
   assert.equal(out.error,undefined);
   const body=JSON.parse(out.stdout);
   assert.equal(body.networkRequests,0);
   assert.equal(body.paymentAuthorized,false);
   assert.doesNotMatch(out.stdout,/FAKE_KEY_NOT_SENT|SECRET_NOT_SENT/);
   assert.equal(body.status,args.length===1&&args[0]==='--review'
    ?'OWNER_PRIVATE_150_CROSSPART_NOT_READY':'DRY_RUN_NO_DISK_NO_NETWORK');
  }
  assert.deepEqual(readdirSync(f.root).sort(),before);
 }finally{f.close()}
});
