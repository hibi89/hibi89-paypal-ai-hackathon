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
 assert.doesNotMatch(cmd.stdout+/\n/+cmd.stderr,/CANARY_NEVER_ECHO/);
});
