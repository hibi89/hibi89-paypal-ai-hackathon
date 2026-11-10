// Zero-network local progression audit for the new $1.50 same-quote pilot.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareFreshOwnerSandbox150Quote}
 from '../src/owner_sandbox_150_quote_prepare.mjs';
import {inspectOwnerProposedA2AQuote}
 from '../src/owner_private_a2a_quote_binding.mjs';
import {createOwnerPrivateGeminiInnovationLab}
 from '../src/owner_private_gemini_innovation_lab.mjs';
import {approveOwnerSandbox150Quote}
 from '../src/owner_sandbox_150_quote_approval.mjs';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {inspectOwnerSandbox150BackendGate}
 from '../src/owner_sandbox150_backend_gate.mjs';

const script=fileURLToPath(new URL('../scripts/check_owner_sandbox150_backend_gate.mjs',import.meta.url));
const merchant='A1B2C3D4E5F6G',actor='owner',quoteId='same_quote_once';
const result=(status,amountMinor)=>new Response(JSON.stringify({
 candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({
  action:status,amountMinor
 })}]}}],usageMetadata:{totalTokenCount:40}
}),{status:200,headers:{'content-type':'application/json'}});
const withDir=fn=>async()=>{
 const root=mkdtempSync(join(tmpdir(),'worknova-150-backend-gate-'));
 const privateDirectory=join(root,'private');
 const quoteScope={
  filename:join(privateDirectory,'owner-sandbox150-part1.sqlite'),
  actorId:actor,merchantId:merchant,quoteId
 };
 const part2Filename=join(privateDirectory,'part2-owner-sandbox150.sqlite');
 const budgetFilename=join(privateDirectory,'part2-owner-sandbox150-quota.sqlite');
 const gate=()=>inspectOwnerSandbox150BackendGate({
  privateDirectory,quoteScope,part2Filename,budgetFilename
 });
 try{await fn({root,privateDirectory,quoteScope,part2Filename,
  budgetFilename,gate})}
 finally{rmSync(root,{recursive:true,force:true})}
};

test('operator gate default and invalid flags never inspect, write or send network',()=>{
 for(const args of [[],['--execute'],['--inspect','--execute']]){
  const out=spawnSync(process.execPath,['--experimental-sqlite',script,...args],{
   encoding:'utf8',timeout:10000,
   env:{...process.env,WORKNOVA_SANDBOX_MERCHANT_ID:undefined,
    PAYPAL_SANDBOX_MERCHANT_ID:undefined}
  });
  assert.equal(out.status,0);
  const data=JSON.parse(out.stdout.trim());
  assert.equal(data.status,'DRY_RUN_NO_FILE_NO_NETWORK');
  assert.equal(data.networkRequests,0);
  assert.equal(data.fileWritesPerformed,false);
  assert.equal(data.providerPostsPerformed,false);
  assert.equal(data.paymentAuthorized,false);
 }
});

test('proposed quote is accurately classified read-only without provider activation',withDir(async f=>{
 await prepareFreshOwnerSandbox150Quote({privateDirectory:f.privateDirectory,
  actorId:actor,merchantId:merchant,quoteId});
 const before=readFileSync(f.quoteScope.filename);
 const files=readdirSync(f.privateDirectory).sort();
 const report=f.gate();
 assert.equal(report.status,'QUOTE_PROPOSED_NOT_HUMAN_APPROVED');
 assert.equal(report.nextAction,'REVIEW_EXISTING_PART2_EVIDENCE_THEN_SEPARATELY_APPROVE_EXACT_QUOTE');
 assert.equal(report.productionReady,false);
 assert.equal(report.paypalProviderAttested,false);
 assert.equal(report.providerPostsPerformed,false);
 assert.deepEqual(readFileSync(f.quoteScope.filename),before);
 assert.deepEqual(readdirSync(f.privateDirectory).sort(),files);
 assert.equal(JSON.stringify(report).includes(f.privateDirectory),false);
}));

test('approved same-quote synthetic A2A is only a candidate; claimed PayPal POST requires GET-only review',withDir(async f=>{
 await prepareFreshOwnerSandbox150Quote({privateDirectory:f.privateDirectory,
  actorId:actor,merchantId:merchant,quoteId});
 const binding=inspectOwnerProposedA2AQuote(f.quoteScope);
 let attempts=0;
 const lab=createOwnerPrivateGeminiInnovationLab({
  filename:f.part2Filename,budgetFilename:f.budgetFilename,
  scope:{actor,merchant,job:'part2_sandbox_150_once'},
  apiKey:'FAKE_ONLY_NOT_REAL',
  fetchImpl:async()=>result(++attempts===1?'OFFER':'ACCEPT',150),
  ownerAuthorized:true,freeTierConfirmed:true,operatorConfirmed:true,
  sandboxPilotSellerFloorMinor:150,quoteBinding:binding
 });
 try{
  const consent=lab.delegate({key:'once',maxMinor:150,expiresInMinutes:15});
  assert.equal((await lab.negotiate({key:'once',consentId:consent.consentId})).accepted,true);
 }finally{lab.close()}
 const awaitingHuman=f.gate();
 assert.equal(awaitingHuman.status,'A2A_AGREEMENT_READY_FOR_HUMAN_APPROVAL_ONLY');
 assert.equal(awaitingHuman.paymentAuthorized,false);
 await approveOwnerSandbox150Quote({
  privateDirectory:f.privateDirectory,quoteScope:f.quoteScope,
  part2Filename:f.part2Filename,budgetFilename:f.budgetFilename,
  explicitOwnerConsent:true
 });
 const files=readdirSync(f.privateDirectory).sort();
 const before=Object.fromEntries(files.map(x=>[x,readFileSync(join(f.privateDirectory,x))]));
 const report=f.gate();
 assert.equal(report.status,'LOCAL_SAME_QUOTE_CANDIDATE_READY_NOT_PAYMENT');
 assert.equal(report.sameQuoteLocalEvidence,true);
 assert.equal(report.merchantOwnershipVerified,false);
 assert.equal(report.independentBuyerIdentityVerified,false);
 assert.equal(report.paymentAuthorized,false);
 assert.equal(report.providerPostsPerformed,false);
 assert.deepEqual(readdirSync(f.privateDirectory).sort(),files);
 for(const filename of files)
  assert.deepEqual(readFileSync(join(f.privateDirectory,filename)),before[filename]);
 const ledger=createSqliteLedger({filename:f.quoteScope.filename});
 try{
  const claim=await ledger.claimOperation({
   quoteId,actorId:actor,merchantId:merchant,operation:'create'
  });
  assert.equal(claim.action,'FIRST_CLAIM_ONLY_NO_PROVIDER_CALL');
 }finally{ledger.close()}
 const afterClaim=f.gate();
 assert.equal(afterClaim.status,'PAYPAL_CLAIM_UNKNOWN_MANUAL_REVIEW_NO_RETRY');
 assert.equal(afterClaim.autoRetry,false);
 assert.equal(afterClaim.providerPostsPerformed,false);
 assert.equal(afterClaim.paymentAuthorized,false);
}));

test('unverified owner environment cannot turn inspect flag into an external call',()=>{
 const out=spawnSync(process.execPath,
  ['--experimental-sqlite',script,'--inspect'],{
   encoding:'utf8',timeout:10000,env:{...process.env,
    WORKNOVA_SANDBOX_MERCHANT_ID:'',PAYPAL_SANDBOX_MERCHANT_ID:'',
    WORKNOVA_OWNER_LEDGER_PATH:''}
  });
 assert.equal(out.status,2);
 const data=JSON.parse(out.stdout.trim());
 assert.equal(data.status,'PRIVATE_OWNER_BACKEND_GATE_BLOCKED');
 assert.equal(data.networkRequests,0);
 assert.equal(data.fileWritesPerformed,false);
 assert.equal(data.providerPostsPerformed,false);
 assert.equal(data.paymentAuthorized,false);
});
