import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync,writeFileSync,readFileSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createPilotCheckoutSessionStore} from '../src/pilot_checkout_session_store.mjs';
import {createMarketplaceAiBudgetStore} from '../src/marketplace_ai_budget.mjs';
import {createOwnerPrivateGeminiInnovationLab} from '../src/owner_private_gemini_innovation_lab.mjs';
import {inspectPrivatePart2A2A,inspectOwnerTwoPartEvidence}
 from '../src/owner_private_two_part_evidence.mjs';

const merchant='A1B2C3D4E5F6G',quoteId='operator_mvp_01',actor='local_operator';
const scope={actor:'operator_owner',merchant:'fictional_merchant',job:'part2_demo_once'};
const path=()=>mkdtempSync(join(tmpdir(),'ppl-two-part-evidence-'));
const reply=(action,amountMinor)=>new Response(JSON.stringify({
 candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({action,amountMinor})}]}}],
 usageMetadata:{totalTokenCount:40}
}),{status:200,headers:{'content-type':'application/json'}});
async function seedPart1(directory){
 const ledger=createSqliteLedger({filename:join(directory,'checkout.sqlite')});
 const input={quoteId,actorId:actor,merchantId:merchant};
 try{
  await ledger.insertQuote({id:quoteId,ownerId:actor,merchantId:merchant});
  await ledger.approve({id:quoteId,actorId:actor,expectedVersion:1,amountMinor:150});
  const q=await ledger.get(quoteId);
  const session=createPilotCheckoutSessionStore({
   filename:join(directory,'checkout_sessions.sqlite')});
  session.issue({quote:q,principal:{verified:true,actorId:actor,merchantId:merchant}});
  session.close();
  await ledger.claimOperation({...input,operation:'create'});
  const order=status=>({
   id:'SYNTHETIC_PRIVATE_ORDER',intent:'CAPTURE',status,
   purchase_units:[{reference_id:quoteId,payee:{merchant_id:merchant},
    amount:{currency_code:'USD',value:'1.50'},
    ...(status==='COMPLETED'?{payments:{captures:[{
     id:'SYNTHETIC_PRIVATE_CAPTURE',status:'COMPLETED',
     amount:{currency_code:'USD',value:'1.50'}
    }]}}:{})}]
  });
  await ledger.recordApprovedOrderFromGet({...input,order:order('APPROVED')});
  await ledger.claimOperation({...input,operation:'capture'});
  await ledger.recordCaptureFromGet({...input,order:order('COMPLETED'),
   capture:{id:'SYNTHETIC_PRIVATE_CAPTURE',orderId:'SYNTHETIC_PRIVATE_ORDER',
    status:'COMPLETED',amount:{currency_code:'USD',value:'1.50'}}});
 }finally{ledger.close()}
 const ai=createMarketplaceAiBudgetStore({
  filename:join(directory,'gemini_skills.sqlite')});
 try{
  const brief='Build a fictional website with PayPal checkout and QA testing.';
  const input={actorId:actor,merchantId:merchant,brief};
  ai.claim(input);ai.commit({...input,skills:['web','payments','qa']});
 }finally{ai.close()}
}
async function seedPart2(directory,{quotaFailure=false}={}){
 const filename=join(directory,'part2.sqlite'),
  budgetFilename=join(directory,'quota.sqlite');
 let calls=0,app;
 try{
  app=createOwnerPrivateGeminiInnovationLab({filename,budgetFilename,scope,
   apiKey:'TEST_FAKE_GEMINI_KEY_NOT_REAL',ownerAuthorized:true,
   freeTierConfirmed:true,operatorConfirmed:true,
   fetchImpl:async()=>{
    calls++;
    return quotaFailure?new Response('fake 429',{status:429}):
     reply(calls===1?'OFFER':'ACCEPT',29000);
   }
  });
  const mandate=app.delegate({key:'mandate',maxMinor:30000,expiresInMinutes:30});
  const out=await app.negotiate({key:'deal',consentId:mandate.consentId});
  assert.equal(out.status,quotaFailure?'BLOCKED':'SYNTHETIC_AGREEMENT');
 }finally{app?.close()}
 return {filename,budgetFilename,calls};
}
test('real SQLite Part1 historical receipt + private Part2 negotiation stay separate when amounts differ',async()=>{
 const directory=path();
 try{
  await seedPart1(directory);const a=await seedPart2(directory);
  assert.equal(a.calls,2);
  const before=readdirSync(directory).sort();
  const output=inspectOwnerTwoPartEvidence({
   ownerDirectory:directory,part2Filename:a.filename,
   budgetFilename:a.budgetFilename,scope
  });
  assert.equal(output.status,'SEPARATE_DEMOS_AMOUNT_MISMATCH');
  assert.equal(output.part1.status,'LOCAL_PROVIDER_RESULT_RECORDED_NOT_FRESH_GET');
  assert.equal(output.part1.amountMinor,150);
  assert.equal(output.part2.amountMinor,29000);
  assert.equal(output.part2.quotaClaims,2);
  assert.equal(output.part2.status,'PRIVATE_A2A_SQLITE_RESULT_NOT_GEMINI_ATTESTED');
  assert.match(output.part2.transcriptSha256,/^[a-f0-9]{64}$/);
  assert.equal(output.amountsMatch,false);
  for(const k of ['sameTransactionProven','sharedMerchantAuthorityProven',
   'livePayPalVerifiedNow','liveGeminiVerifiedNow','paymentAuthorized',
   'paypalCreatePerformed','paypalCapturePerformed','geminiPostPerformed',
   'fileWritesPerformed'])assert.equal(output[k],false,k);
  assert.equal(output.networkRequests,0);
  assert.deepEqual(readdirSync(directory).sort(),before);
  const safe=JSON.stringify(output);
  for(const value of [merchant,actor,'SYNTHETIC_PRIVATE_ORDER',
   'SYNTHETIC_PRIVATE_CAPTURE','TEST_FAKE_GEMINI_KEY_NOT_REAL'])
   assert.equal(safe.includes(value),false,value);
 }finally{rmSync(directory,{recursive:true,force:true})}
});
test('missing owner receipt cannot become shared financial proof',async()=>{
 const directory=path();
 try{
  const p=await seedPart2(directory);
  const output=inspectOwnerTwoPartEvidence({
   ownerDirectory:directory,part2Filename:p.filename,
   budgetFilename:p.budgetFilename,scope
  });
  assert.equal(output.status,'PART1_NOT_VERIFIED');
  assert.equal(output.sameTransactionProven,false);
  assert.equal(output.part2.amountMinor,29000);
 }finally{rmSync(directory,{recursive:true,force:true})}
});
test('provider 429 UNKNOWN and corrupt/linked private files never become successful proof',async t=>{
 const directory=path();
 try{
  const p=await seedPart2(directory,{quotaFailure:true});
  assert.equal(p.calls,1);
  const uncertain=inspectPrivatePart2A2A({...p,scope});
  assert.notEqual(uncertain.status,'PRIVATE_A2A_SQLITE_RESULT_NOT_GEMINI_ATTESTED');
  const other=join(directory,'forged.sqlite');
  writeFileSync(other,'INVALID');
  assert.equal(inspectPrivatePart2A2A({
   filename:other,budgetFilename:p.budgetFilename,scope
  }).status,'PART2_EVIDENCE_REVIEW_REQUIRED');
  const link=join(directory,'symlink.sqlite');
  try{symlinkSync(p.filename,link)}
  catch(e){if(process.platform==='win32'&&['EPERM','EACCES'].includes(e.code)){
   t.diagnostic('symlink requires Windows developer privilege');return;
  }throw e}
  assert.equal(inspectPrivatePart2A2A({
   filename:link,budgetFilename:p.budgetFilename,scope
  }).status,'PART2_EVIDENCE_REVIEW_REQUIRED');
 }finally{rmSync(directory,{recursive:true,force:true})}
});
test('read-only part2 inspection does not mutate original SQLite bytes',async()=>{
 const directory=path();
 try{
  const p=await seedPart2(directory);
  const left=readFileSync(p.filename),right=readFileSync(p.budgetFilename);
  assert.equal(inspectPrivatePart2A2A({...p,scope}).amountMinor,29000);
  assert.deepEqual(readFileSync(p.filename),left);
  assert.deepEqual(readFileSync(p.budgetFilename),right);
 }finally{rmSync(directory,{recursive:true,force:true})}
});
