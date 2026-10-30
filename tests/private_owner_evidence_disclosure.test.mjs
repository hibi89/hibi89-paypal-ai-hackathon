import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {summarizePrivateOwnerEvidence}
 from '../src/private_owner_evidence_disclosure.mjs';

const good={
 schemaVersion:1,mode:'READ_ONLY_PRIVATE_SQLITE_EVIDENCE_NO_NETWORK',
 status:'LOCAL_PROVIDER_RESULT_RECORDED_NOT_FRESH_GET',
 ownerReportedLiveRunNotIndependentlyAttested:true,
 providerGetPerformedNow:false,providerPostPerformedNow:false,
 geminiCallPerformedNow:false,sqliteWritesPerformed:false,
 secretsRead:false,privateIdentifiersPrinted:false,
 freshRemotePaymentProof:false,productionOrLivePaymentProof:false,
 safeToRepeatPayment:false,
 amountMinor:150,currency:'USD',classifiedSkills:['web','payments','qa'],
 localAuditIntegrity:'PASS',localAuditEvents:7,
 merchantId:'DONT_EXPOSE_MERCHANT',orderId:'DONT_EXPOSE_ORDER',
 access_token:'DONT_EXPOSE_TOKEN',rawBrief:'DONT_EXPOSE_BRIEF'
};
test('redacted successful historical local result keeps proof class C and no private IDs',()=>{
 const report=summarizePrivateOwnerEvidence(good);
 assert.equal(report.status,'LOCAL_RECORD_CONSISTENT_NOT_REMOTE_ATTESTED');
 assert.deepEqual(report.validatedTechnicalSkills,['web','payments','qa']);
 assert.equal(report.approvedSyntheticAmount,'USD 1.50');
 assert.equal(report.localAuditEventCount,7);
 assert.equal(report.actualPayPalOrderGetNow,false);
 assert.equal(report.actualPayPalCaptureNow,false);
 assert.equal(report.independentlyVerifiedByPayPal,false);
 assert.equal(report.authorizedToPublish,false);
 assert.equal(report.devpostSubmitted,false);
 const text=JSON.stringify(report);
 for(const value of ['DONT_EXPOSE','merchantId','orderId','rawBrief',
  'access_token','client_secret','PayerID','checkoutnow'])
  assert.equal(text.includes(value),false,value);
});
test('absent or incomplete evidence remains unconfirmed with no proof payload',()=>{
 for(const status of ['NO_LOCAL_ATTEMPT','LOCAL_EVIDENCE_REVIEW_REQUIRED']){
  const report=summarizePrivateOwnerEvidence({
   ...good,status,amountMinor:null,currency:null,
   classifiedSkills:[],localAuditIntegrity:'NOT_CHECKED',localAuditEvents:0
  });
  assert.equal(report.status,'LOCAL_EVIDENCE_UNCONFIRMED');
  assert.equal(report.localDataConsistencyEstablished,false);
  assert.equal(report.approvedSyntheticAmount,null);
  assert.deepEqual(report.validatedTechnicalSkills,[]);
 }
});
test('inconsistent local receipt, extra claims and forbidden proof flags fail closed',()=>{
 const cases=[
  {...good,status:'REMOTE_PROVIDER_GET_VERIFIED'},
  {...good,providerGetPerformedNow:true},
  {...good,productionOrLivePaymentProof:true},
  {...good,ownerReportedLiveRunNotIndependentlyAttested:false},
  {...good,amountMinor:999},
  {...good,classifiedSkills:['web','UNKNOWN_SKILL']},
  {...good,classifiedSkills:['web','web']},
  {...good,localAuditIntegrity:'NOT_CHECKED'},
  {...good,localAuditEvents:0}
 ];
 for(const caseData of cases)
  assert.throws(()=>summarizePrivateOwnerEvidence(caseData));
});
test('owner evidence disclosure CLI default makes zero private reads or outbound calls',()=>{
 const script=fileURLToPath(new URL('../scripts/export_owner_local_evidence.mjs',import.meta.url));
 const cmd=spawnSync(process.execPath,['--experimental-sqlite',script],{
   encoding:'utf8',timeout:10000,maxBuffer:100000,
   env:{PATH:process.env.PATH||'',HOME:'/untrusted/doesnotexist',
     GEMINI_API_KEY:'CANARY_NEVER_ECHO',PAYPAL_SANDBOX_CLIENT_SECRET:'CANARY_NEVER_ECHO'}
 });
 assert.equal(cmd.status,2,cmd.stderr);
 assert.equal(JSON.parse(cmd.stdout).privateSqliteRead,false);
 assert.equal(JSON.parse(cmd.stdout).artifactWritten,false);
 assert.equal(JSON.parse(cmd.stdout).networkRequests,0);
 assert.doesNotMatch(cmd.stdout+'\\n'+cmd.stderr,/CANARY_NEVER_ECHO/);
});

test('explicit local owner export reads internally consistent historical synthetic fixture, without provider calls',async()=>{
 const {mkdtempSync,mkdirSync,rmSync,readdirSync,readFileSync,unlinkSync,existsSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const {createSqliteLedger}=await import('../src/sqlite_ledger.mjs');
 const {createPilotCheckoutSessionStore}=await import('../src/pilot_checkout_session_store.mjs');
 const {createMarketplaceAiBudgetStore}=await import('../src/marketplace_ai_budget.mjs');
 const root=mkdtempSync(join(tmpdir(),'owner-disclosure-test-'));
 const directory=join(root,'.paypal-ai-mvp-private');
 mkdirSync(directory,{recursive:true});
 const merchant='A1B2C3D4E5F6G',actorId='local_operator',quoteId='operator_mvp_01';
 const ctx={quoteId,actorId,merchantId:merchant};
 // Snapshot the output listing: this regression must never remove an older
 // owner's evidence, even when run concurrently with other Node tests.
 const outputDir=fileURLToPath(new URL('../output/submission/',import.meta.url));
 const existingNames=new Set(existsSync(outputDir)?readdirSync(outputDir):[]);
 let createdPath=null;
 try{
  const ledger=createSqliteLedger({filename:join(directory,'checkout.sqlite')});
  await ledger.insertQuote({id:quoteId,ownerId:actorId,merchantId:merchant});
  await ledger.approve({id:quoteId,actorId,expectedVersion:1,amountMinor:150});
  const quote=await ledger.get(quoteId);
  const session=createPilotCheckoutSessionStore({
   filename:join(directory,'checkout_sessions.sqlite')});
  session.issue({quote,principal:{verified:true,actorId,merchantId:merchant}});
  session.close();
  const order=(status)=>({id:'DUMMY_ORDER_PRIVATE',intent:'CAPTURE',status,
   purchase_units:[{reference_id:quoteId,payee:{merchant_id:merchant},
    amount:{currency_code:'USD',value:'1.50'},
    ...(status==='COMPLETED'?{payments:{captures:[{
      id:'DUMMY_CAPTURE_PRIVATE',status:'COMPLETED',
      amount:{currency_code:'USD',value:'1.50'}}]}}:{})}]});
  await ledger.claimOperation({...ctx,operation:'create'});
  await ledger.recordApprovedOrderFromGet({...ctx,order:order('APPROVED')});
  await ledger.claimOperation({...ctx,operation:'capture'});
  await ledger.recordCaptureFromGet({...ctx,order:order('COMPLETED'),
    capture:{id:'DUMMY_CAPTURE_PRIVATE',orderId:'DUMMY_ORDER_PRIVATE',
      status:'COMPLETED',amount:{currency_code:'USD',value:'1.50'}}});
  ledger.close();
  const ai=createMarketplaceAiBudgetStore({
    filename:join(directory,'gemini_skills.sqlite')});
  const scope={actorId,merchantId:merchant,
    brief:'Build a fictional website with PayPal checkout and QA testing.'};
  ai.claim(scope);
  ai.commit({...scope,skills:['web','payments','qa']});
  ai.close();
  const before=readdirSync(directory).sort();
  const cli=fileURLToPath(new URL('../scripts/export_owner_local_evidence.mjs',import.meta.url));
  const env={...process.env,HOME:root,USERPROFILE:root,
    GEMINI_API_KEY:'DO_NOT_ECHO_GEMINI_SECRET',
    PAYPAL_SANDBOX_CLIENT_SECRET:'DO_NOT_ECHO_PAYPAL_SECRET'};
  const cmd=spawnSync(process.execPath,['--experimental-sqlite',cli,'--review-local-only'],{
   env,encoding:'utf8',timeout:10000,maxBuffer:100000});
  assert.equal(cmd.status,0,cmd.stdout+' '+cmd.stderr);
  const report=JSON.parse(cmd.stdout);
  assert.match(report.privateArtifactFilename,
   /^owner_local_provider_disclosure_PRIVATE_REVIEW_[0-9a-f]{32}\.json$/);
  assert.equal(existingNames.has(report.privateArtifactFilename),false,
   'new export must not collide with an existing owner artifact');
  createdPath=join(outputDir,report.privateArtifactFilename);
  const saved=JSON.parse(readFileSync(createdPath,'utf8'));
  assert.deepEqual(saved,report);
  assert.equal(report.status,'LOCAL_RECORD_CONSISTENT_NOT_REMOTE_ATTESTED');
  assert.equal(report.independentlyVerifiedByPayPal,false);
  assert.equal(report.actualPayPalOrderGetNow,false);
  assert.equal(report.actualGeminiCallNow,false);
  assert.equal(report.authorizedToPublish,false);
  assert.deepEqual(readdirSync(directory).sort(),before);
  for(const field of [merchant,'DUMMY_ORDER_PRIVATE','DUMMY_CAPTURE_PRIVATE',
    'DO_NOT_ECHO_GEMINI_SECRET','DO_NOT_ECHO_PAYPAL_SECRET','client_secret',
    'PayerID','checkoutnow'])
    assert.equal((cmd.stdout+cmd.stderr+JSON.stringify(saved)).includes(field),false,field);
 }finally{
  // Only unlink a newly generated path after confirming it did not preexist.
  if(createdPath)try{unlinkSync(createdPath)}catch{}
  rmSync(root,{recursive:true,force:true});
 }
});
