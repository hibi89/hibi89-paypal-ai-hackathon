import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync,writeFileSync,readFileSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createPilotCheckoutSessionStore} from '../src/pilot_checkout_session_store.mjs';
import {createMarketplaceAiBudgetStore} from '../src/marketplace_ai_budget.mjs';
import {createOwnerPrivateGeminiInnovationLab} from '../src/owner_private_gemini_innovation_lab.mjs';
import {inspectOwnerProposedA2AQuote} from '../src/owner_private_a2a_quote_binding.mjs';
import {createA2ABudgetStore,hashEvidence} from '../src/gemini_a2a_budget_store.mjs';
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

test('owner read-only CLI refuses missing private evidence without network or secret echoes',async()=>{
 const dir=path();
 try{
  const {spawnSync}=await import('node:child_process');
  const {fileURLToPath}=await import('node:url');
  const entry=fileURLToPath(new URL('../scripts/check_owner_two_part_evidence.mjs',import.meta.url));
  const old=readdirSync(dir).sort();
  const run=spawnSync(process.execPath,['--experimental-sqlite',entry],{
   encoding:'utf8',timeout:10000,
   env:{...process.env,HOME:dir,USERPROFILE:dir,
    GEMINI_API_KEY:'SENTINEL_TEST_API_SECRET',
    PAYPAL_SANDBOX_CLIENT_SECRET:'FAKE_TEST_SECRET_1'}
  });
  assert.equal(run.status,2,run.stderr);
  const response=JSON.parse(run.stdout);
  assert.equal(response.status,'BOTH_PARTS_NEED_REVIEW');
  assert.equal(response.networkRequests,0);
  assert.equal(response.fileWritesPerformed,false);
  assert.equal(response.paymentAuthorized,false);
  assert.equal(run.stdout.includes('SENTINEL_TEST_API_SECRET'),false);
  assert.equal(run.stdout.includes('FAKE_TEST_SECRET_1'),false);
  assert.deepEqual(readdirSync(dir).sort(),old);
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test('crash between durable Gemini quota claim and Part2 event refuses clean retry',()=>{
 const directory=path();
 try{
  const quota=createA2ABudgetStore({filename:join(directory,'quota.sqlite')});
  const claim=quota.claim({...scope,turn:1,role:'seller',
   promptHash:hashEvidence('fake bounded prompt')});
  quota.uncertain(claim);quota.close();
  const out=inspectPrivatePart2A2A({
   filename:join(directory,'missing-part2.sqlite'),
   budgetFilename:join(directory,'quota.sqlite'),scope
  });
  assert.equal(out.status,'PART2_ATTEMPT_WITHOUT_RESULT_NO_RETRY');
  assert.equal(out.quotaClaims,1);
  assert.equal(out.amountMinor,null);
 }finally{rmSync(directory,{recursive:true,force:true})}
});


async function seedQuoteBoundSandboxPart2(directory){
 const quoteId='one_sandbox_quote';
 const pilotScope={actor:'private_buyer',merchant,job:'part2_sandbox_150_once'};
 const part1Filename=join(directory,'sandbox-quote.sqlite');
 const ledger=createSqliteLedger({filename:part1Filename});
 let app,calls=0;
 const filename=join(directory,'part2-sandbox.sqlite');
 const budgetFilename=join(directory,'sandbox-quota.sqlite');
 try{
  await ledger.insertQuote({id:quoteId,ownerId:pilotScope.actor,
   merchantId:pilotScope.merchant});
  const binding=inspectOwnerProposedA2AQuote({
   filename:part1Filename,actorId:pilotScope.actor,
   merchantId:pilotScope.merchant,quoteId
  });
  app=createOwnerPrivateGeminiInnovationLab({
   filename,budgetFilename,scope:pilotScope,quoteBinding:binding,
   sandboxPilotSellerFloorMinor:150,
   apiKey:'FICTIONAL_SANDBOX_MODEL_KEY',ownerAuthorized:true,
   freeTierConfirmed:true,operatorConfirmed:true,
   fetchImpl:async()=>{
    calls++;
    return reply(calls===1?'OFFER':'ACCEPT',150);
   }
  });
  const consent=app.delegate({key:'pilot_once',maxMinor:150,
   expiresInMinutes:15});
  const result=await app.negotiate({key:'pilot_agreement_once',
   consentId:consent.consentId});
  assert.equal(result.status,'SYNTHETIC_AGREEMENT');
  assert.equal(result.agreedMinor,150);
  assert.equal(calls,2);
  return {filename,budgetFilename,scope:pilotScope,quoteId,binding};
 }finally{app?.close();ledger.close()}
}
test('explicit $1.50 quote-bound private A2A receipt is readable but never provider attested',async()=>{
 const dir=path();
 try{
  const pilot=await seedQuoteBoundSandboxPart2(dir);
  const old=inspectPrivatePart2A2A({
   filename:pilot.filename,budgetFilename:pilot.budgetFilename,
   scope:pilot.scope
  });
  // The existing $270-only reader must not silently change its policy.
  assert.equal(old.status,'PART2_EVIDENCE_REVIEW_REQUIRED');
  const before=readFileSync(pilot.filename);
  const proof=inspectPrivatePart2A2A({
   filename:pilot.filename,budgetFilename:pilot.budgetFilename,
   scope:pilot.scope,sandboxPilotQuoteId:pilot.quoteId
  });
  assert.equal(proof.status,'PRIVATE_A2A_SQLITE_RESULT_NOT_GEMINI_ATTESTED');
  assert.equal(proof.amountMinor,150);
  assert.equal(proof.quotaClaims,2);
  assert.equal(proof.boundQuoteId,pilot.quoteId);
  assert.equal(proof.boundQuoteVersion,pilot.binding.quoteVersion);
  assert.equal(proof.boundQuoteFingerprint,pilot.binding.quoteFingerprint);
  assert.equal(proof.quoteHumanApprovedByThisReadOnlyCheck,false);
  assert.equal(proof.source,'PRIVATE_SQLITE_UNATTESTED');
  assert.deepEqual(readFileSync(pilot.filename),before);
  const two=inspectOwnerTwoPartEvidence({
   ownerDirectory:dir,part2Filename:pilot.filename,
   budgetFilename:pilot.budgetFilename,scope:pilot.scope,
   sandboxPilotQuoteId:pilot.quoteId
  });
  assert.equal(two.status,'PART1_NOT_VERIFIED');
  assert.equal(two.part2.amountMinor,150);
  assert.equal(two.sameTransactionProven,false);
  assert.equal(two.paymentAuthorized,false);
  assert.equal(two.networkRequests,0);
  assert.equal(two.liveGeminiVerifiedNow,false);
  assert.equal(two.livePayPalVerifiedNow,false);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('wrong pre-model quote ID denies private $1.50 evidence without mutation',async()=>{
 const dir=path();
 try{
  const pilot=await seedQuoteBoundSandboxPart2(dir);
  const source=readFileSync(pilot.filename);
  const invalid=inspectPrivatePart2A2A({
   filename:pilot.filename,budgetFilename:pilot.budgetFilename,
   scope:pilot.scope,sandboxPilotQuoteId:'other_same_price'
  });
  assert.equal(invalid.status,'PART2_EVIDENCE_REVIEW_REQUIRED');
  assert.equal(invalid.amountMinor,null);
  assert.deepEqual(readFileSync(pilot.filename),source);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('read-only $1.50 CLI requires exact quote scope without touching disk or keys',async()=>{
 const dir=path();
 try{
  const {spawnSync}=await import('node:child_process');
  const {fileURLToPath}=await import('node:url');
  const entry=fileURLToPath(new URL('../scripts/check_owner_two_part_evidence.mjs',import.meta.url));
  const before=readdirSync(dir).sort();
  for(const flags of [['--sandbox-pilot-150'],
   ['--sandbox-pilot-150','--extra']]){
   const r=spawnSync(process.execPath,['--no-warnings',
    '--experimental-sqlite',entry,...flags],{
    encoding:'utf8',timeout:10000,
    env:{...process.env,HOME:dir,USERPROFILE:dir,
     WORKNOVA_OWNER_ACTOR_ID:'',
     WORKNOVA_SANDBOX_MERCHANT_ID:'',
     WORKNOVA_PILOT_QUOTE_ID:'',
     GEMINI_API_KEY:'PRIVATE_TEST_SENTINEL'}
   });
   assert.equal(r.status,2,r.stderr);
   const result=JSON.parse(r.stdout);
   assert.equal(result.networkRequests,0);
   assert.equal(result.fileWritesPerformed,false);
   assert.equal(result.paymentAuthorized,false);
   assert.doesNotMatch(r.stdout,/PRIVATE_TEST_SENTINEL/);
   assert.equal(result.status,flags.length===1
    ?'PRIVATE_SANDBOX_QUOTE_SCOPE_REQUIRED'
    :'READ_ONLY_UNSUPPORTED_ARGUMENTS');
  }
  assert.deepEqual(readdirSync(dir).sort(),before);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
