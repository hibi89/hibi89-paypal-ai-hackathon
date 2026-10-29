// Evidence-first judge packet. Runs existing REAL orchestrator against FAKE injected
// Gemini/PayPal transports, never the real services. No credentials or network.
// Does NOT attempt to read the owner's private SQLite or publish any artifact.
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runOfflineOperatorMvpSmoke} from '../src/offline_operator_mvp_smoke.mjs';

const REPORT_DIR=new URL('../output/submission/',import.meta.url);

const requireTrue=(v,code)=>{if(!v)throw Error(code)};
export function summarizeSyntheticJudgeTrace(result){
 requireTrue(result && typeof result==='object' && !Array.isArray(result),'INVALID_MOCK_RESULT');
 requireTrue(result.status==='MOCK_MVP_E2E_PASS' &&
   result.scope==='SYNTHETIC_PROVIDER_FIXTURE_ONLY','SYNTHETIC_TRACE_NOT_VERIFIED');
 requireTrue(result.realGeminiCalls===0 && result.realPayPalCalls===0 &&
   result.realPaymentCaptured===false && result.implicitNetworkAccess===false,
   'REAL_PROVIDER_ACTIVITY_CLAIM_FORBIDDEN');
 requireTrue(result.syntheticQuoteCurrency==='USD' &&
   result.syntheticQuoteAmount==='1.50' &&
   result.syntheticSkillSource==='INJECTED_FAKE_GEMINI' &&
   result.simulatedBuyerApproved===true &&
   result.mockCaptureState==='PAID_VERIFIED_BY_INJECTED_PROVIDER_GET' &&
   result.privateSqliteLedgerVerified===true &&
   result.syntheticOperationClaims===2 &&
   result.createPostsToFakeTransport===1 &&
   result.capturePostsToFakeTransport===1 &&
   result.automaticRetry===false,'MOCK_PAYMENT_OR_CONSENT_INVARIANT_FAILED');
 requireTrue(typeof result.selectedProfile==='string' &&
   /^[a-zA-Z0-9_-]{1,64}$/.test(result.selectedProfile) &&
   Array.isArray(result.missingSkills) &&
   result.missingSkills.length>0 &&
   result.missingSkills.every(x=>typeof x==='string' && /^[a-z]+$/.test(x)),
   'SYNTHETIC_MATCH_PROOF_INVALID');
 const safeSkills=Object.freeze([...result.missingSkills]);
 return Object.freeze({
   status:'JUDGE_SAFE_OFFLINE_EVIDENCE_READY_NOT_SUBMITTED',
   checkedAtRuntime:'LOCAL_EXECUTION_ONLY_NO_REMOTE_ATTESTATION',
   project:'Proofline — AI Work + Global Services',
   evidence:[
     Object.freeze({id:'A',type:'REPRODUCIBLE_LOCAL_BROWSER',status:'REQUIRES_SEPARATE_CHROMIUM_TEST',
       source:'tests/browser_offline_e2e.py and tests/browser_general_services_e2e.py',
       claim:'Both fictional marketplace categories use one local quote, approval and unpaid contract workflow; this report does not execute a browser.'}),
     Object.freeze({id:'B',type:'EXECUTED_SYNTHETIC_ORCHESTRATOR',status:'VERIFIED_WITH_FAKE_INJECTED_TRANSPORT',
       source:'src/offline_operator_mvp_smoke.mjs; src/owner_mvp_flow.mjs',
       quote:'USD 1.50 human-approved synthetic amount',
       selectedSyntheticProfile:result.selectedProfile,
       missingSkills:safeSkills,
       checkout:'Fake PayPal Sandbox order and approved simulated buyer, one fake create and one fake capture, subsequent injected GET checked',
       outcome:'PAID status exists ONLY in local injected fake provider, not PayPal'}),
     Object.freeze({id:'C',type:'OWNER_HISTORICAL_PROVIDER_ACTIVITY',status:'OWNER_REPORTED_NOT_INDEPENDENTLY_ATTESTED',
       source:'docs/technical/PPL_OWNER_REAL_SANDBOX_LOCAL_RECEIPT_20261028.md',
       claim:'Owner reported historical Gemini skill classification and PayPal Sandbox buyer approval, capture and provider GET on 2026-10-28; not recontacted in this report.'}),
     Object.freeze({id:'D',type:'PUBLIC_HACKATHON_SUBMISSION',status:'NOT_SUBMITTED',
       source:'docs/OWNER_FINAL_SUBMISSION_HANDOFF_20261029.md',
       claim:'Owner-approved public YouTube video and final Devpost confirmation not established by this command.'})
   ],
   verifiedFromThisCommand:Object.freeze({
     syntheticOrchestratorExecuted:true,
     fakeGeminiRequests:1,
     fakePayPalOrderCreateRequests:1,
     fakePayPalCaptureRequests:1,
     fakeProviderGetReconciliation:true,
     persistedSyntheticSqliteClaims:2,
     actualProviderCalls:0,
     actualPaymentCaptured:false,
     publicSubmissionPerformed:false
   }),
   releases:Object.freeze({
     publicVideoUrl:null,
     devpostSubmissionReceipt:null,
     publicationAuthorized:false
   })
 });
}
export function renderJudgeEvidenceMarkdown(report){
 const cells=x=>String(x).replace(/\|/g,'/').replace(/[\r\n]+/g,' ');
 const rows=report.evidence.map(x=>
   '| '+cells(x.id)+' | '+cells(x.type)+' | '+cells(x.status)+' | '+cells(x.source)+' |').join('\n');
 return `# Proofline — judge evidence classes (LOCAL DRAFT ONLY)

**Do not mistake simulated tests for live provider transactions.** This artifact is locally generated, not uploaded or submitted.

| ID | Evidence class | Current status | Source |
| --- | --- | --- | --- |
${rows}

## One local reproducible technical path

- Use \`npm run judge:evidence\` to rerun the owner MVP orchestration **with explicitly injected FAKE Gemini and PayPal Sandbox transports**. No real PayPal/Gemini API, token, capture or billing is involved.
- The real orchestrator exercises one mock AI skill classification, deliberate human-approved USD 1.50 quote, fake buyer approval, one fake order create, one fake capture, GET-based fake reconciliation and local SQLite claims. It does **not** provide an authentic Sandbox receipt.
- The tested UI has two visibly distinct categories, AI Work and Global Services. To independently check browser behavior use \`tests/browser_offline_e2e.py\` and \`tests/browser_general_services_e2e.py\` with Python Playwright/Chromium, or inspect the GitHub Actions browser logs.
- The 2026-10-28 real Gemini and PayPal Sandbox run is **owner-reported historical activity**. Only the owner’s separate read-only receipt workflow may check locally stored records. No fresh provider GET is made here, and this command is not proof of a currently functional remote checkout.

## Never claim

Real enrolled sellers; current connected AI in the browser; live PayPal order/capture; real money, commissions, escrow, fee discounts or sponsor partnership; an independently authenticated owner receipt; a public YouTube link; or a completed Devpost entry.

**Goal:** AI should widen access to independent work. The marketplace is the product thesis, and engineering evidence must be labeled with its actual source.
`;
}
export async function buildJudgeEvidenceReport({write=true}={}){
 const raw=await runOfflineOperatorMvpSmoke();
 const report=summarizeSyntheticJudgeTrace(raw);
 if(write){
   mkdirSync(REPORT_DIR,{recursive:true});
   writeFileSync(new URL('judge_evidence_report.json',REPORT_DIR),
      JSON.stringify(report,null,2)+'\n',{encoding:'utf8',flag:'w'});
   writeFileSync(new URL('judge_evidence_report.md',REPORT_DIR),
      renderJudgeEvidenceMarkdown(report),{encoding:'utf8',flag:'w'});
 }
 return report;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
   const report=await buildJudgeEvidenceReport();
   process.stdout.write(JSON.stringify({
      status:report.status,
      evidenceClasses:report.evidence.map(x=>({type:x.type,status:x.status})),
      providerCalls:report.verifiedFromThisCommand.actualProviderCalls,
      paymentCaptured:report.verifiedFromThisCommand.actualPaymentCaptured,
      privateOutput:'output/submission/judge_evidence_report.json and .md (gitignored)',
      submitted:false
   })+'\n');
 }catch{
   process.stdout.write(JSON.stringify({status:'JUDGE_EVIDENCE_BLOCKED',
      providerCalls:'NOT_ATTESTED',submitted:false})+'\n');
   process.exitCode=1;
 }
}
