// Evidence-first judge packet. Runs existing REAL orchestrator against FAKE injected
// Gemini/PayPal transports, never the real services. No credentials or network.
// Does NOT attempt to read the owner's private SQLite or publish any artifact.
import {mkdirSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createInnovationLab} from '../src/innovation_lab.mjs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runOfflineOperatorMvpSmoke} from '../src/offline_operator_mvp_smoke.mjs';

const REPORT_DIR=new URL('../output/submission/',import.meta.url);

const requireTrue=(v,code)=>{if(!v)throw Error(code)};
// Execute the real offline Part 2 SQLite-backed lab, not a fake report.
// All actions are deterministic and written only to a disposable temporary DB.
export async function runSyntheticPart2JudgeTrace(){
 const dir=mkdtempSync(join(tmpdir(),'proofline-judge-part2-'));
 let lab;
 try{
  lab=createInnovationLab({filename:join(dir,'innovation.sqlite')});
  const principal={actor:'synthetic-owner',merchant:'synthetic-merchant'};
  const service=lab.delegate({...principal,key:'judge-services',
   category:'services',maxMinor:30000,expiresInMinutes:30});
  const input={...principal,key:'judge-a2a',consentId:service.consentId};
  const deal=await lab.a2a(input);
  const replay=await lab.a2a(input);
  const gifts=lab.delegate({...principal,key:'judge-gifts',
   category:'gifts',maxMinor:3900,expiresInMinutes:30});
  const gift=lab.trade({...principal,key:'judge-gift-choice',
   kind:'gift',consentId:gifts.consentId});
  const churn=lab.skill({...principal,key:'judge-churn',kind:'churn'});
  const invoice=lab.skill({...principal,key:'judge-invoice',kind:'invoice'});
  const state=lab.state(principal);
  const skills=['a2a','delegation','gift','churn','invoice_dispute'];
  requireTrue(service.status==='SYNTHETIC_CONSENT_CREATED'&&
   gifts.status==='SYNTHETIC_CONSENT_CREATED'&&
   service.consentId!==gifts.consentId&&
   deal.status==='SYNTHETIC_AGREEMENT'&&
   deal.protocolStatus==='AGREED_OFFLINE_CONTRACT'&&
   deal.agreedMinor===29900&&deal.reservedMinor===29900&&
   deal.accepted===true&&Array.isArray(deal.messages)&&
   deal.messages.length===4&&deal.messages[0].role==='seller'&&
   deal.messages[1].role==='buyer'&&replay.replayed===true&&
   replay.transcriptSha256===deal.transcriptSha256&&
   gift.status==='SYNTHETIC_ITEM_SELECTED'&&
   gift.selected?.id==='desk-light-b'&&gift.reservedMinor===3800&&
   churn.paypalPlanChanged===false&&invoice.paypalInvoiceCreated===false&&
   state.part==='PART_2'&&JSON.stringify(state.skills)===JSON.stringify(skills)&&
   state.events.length===6&&state.consents.length===2&&
   state.pendingAttempts.length===0&&
   state.paymentState==='NOT_PAID'&&state.realGemini===false&&
   state.realPayPal===false&&state.providerCalls===0&&
   [service,deal,gift,churn,invoice].every(x=>
    x.paymentAuthorized===false&&x.providerCalls===0),
   'PART2_SYNTHETIC_EXECUTION_INVALID');
  return Object.freeze({
   status:'SYNTHETIC_PART2_FIVE_SKILLS_VERIFIED_NO_PROVIDER',
   skills:Object.freeze(skills),eventCount:state.events.length,
   delegatedScopes:2,a2aProtocol:'AGREED_OFFLINE_CONTRACT',
   replayWithoutNewAgentRun:true,giftSource:'FICTIONAL_CATALOG',
   churnPaypalPlanChanged:false,invoiceCreatedAtPaypal:false,
   actualProviderCalls:0,paymentAuthorized:false,paymentState:'NOT_PAID',
   persistedToTemporarySqlite:true
  });
 }finally{
  try{lab?.close()}finally{rmSync(dir,{recursive:true,force:true})}
 }
}
export function summarizeSyntheticJudgeTrace(result,part2){
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
 requireTrue(part2?.status==='SYNTHETIC_PART2_FIVE_SKILLS_VERIFIED_NO_PROVIDER'&&
   JSON.stringify(part2.skills)===JSON.stringify([
    'a2a','delegation','gift','churn','invoice_dispute'
   ])&&part2.eventCount===6&&part2.delegatedScopes===2&&
   part2.a2aProtocol==='AGREED_OFFLINE_CONTRACT'&&
   part2.replayWithoutNewAgentRun===true&&part2.giftSource==='FICTIONAL_CATALOG'&&
   part2.churnPaypalPlanChanged===false&&part2.invoiceCreatedAtPaypal===false&&
   part2.actualProviderCalls===0&&part2.paymentAuthorized===false&&
   part2.paymentState==='NOT_PAID'&&part2.persistedToTemporarySqlite===true,
   'PART2_SYNTHETIC_TRACE_NOT_VERIFIED');
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
     Object.freeze({id:'C',type:'EXECUTED_PART2_FIVE_SKILL_SQLITE_LAB',
       status:'VERIFIED_DETERMINISTIC_OFFLINE_NO_PROVIDER',
       source:'src/innovation_lab.mjs; src/agentic_a2a_protocol.mjs',
       claim:'Two scoped mandates, deterministic buyer/seller A2A, idempotent replay, fictional gift, churn and invoice/dispute drafts in disposable SQLite; no Gemini, PayPal or payment authority.',
       count:part2.eventCount,skills:Object.freeze([...part2.skills])}),
     Object.freeze({id:'D',type:'OWNER_HISTORICAL_PROVIDER_ACTIVITY',status:'OWNER_REPORTED_NOT_INDEPENDENTLY_ATTESTED',
       source:'docs/technical/PPL_OWNER_REAL_SANDBOX_LOCAL_RECEIPT_20261028.md',
       claim:'Owner reported historical Gemini skill classification and PayPal Sandbox buyer approval, capture and provider GET on 2026-10-28; not recontacted in this report.'}),
     Object.freeze({id:'E',type:'PUBLIC_HACKATHON_SUBMISSION',status:'NOT_SUBMITTED',
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
     part2FiveSkillsExecuted:5,
     part2PersistedTemporarySqliteEvents:part2.eventCount,
     part2RealProviderCalls:0,
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
- **Part 2 is also executed by this command** through the existing SQLite innovation lab: scoped mandates, separate offline buyer/seller agent negotiation, harmless replay, fictional gift selection, churn saver and invoice/dispute proposals. No model or payment provider is contacted.
- The tested UI has two visibly distinct categories, AI Work and Global Services. To independently check browser behavior use \`tests/browser_offline_e2e.py\` and \`tests/browser_general_services_e2e.py\` with Python Playwright/Chromium, or inspect the GitHub Actions browser logs.
- The 2026-10-28 real Gemini and PayPal Sandbox run is **owner-reported historical activity**. Only the owner’s separate read-only receipt workflow may check locally stored records. No fresh provider GET is made here, and this command is not proof of a currently functional remote checkout.

## Never claim

Real enrolled sellers; current connected AI in the browser; live PayPal order/capture; real money, commissions, escrow, fee discounts or sponsor partnership; an independently authenticated owner receipt; a public YouTube link; or a completed Devpost entry.

**Goal:** AI should widen access to independent work. The marketplace is the product thesis, and engineering evidence must be labeled with its actual source.
`;
}
export async function buildJudgeEvidenceReport({write=true}={}){
 const raw=await runOfflineOperatorMvpSmoke();
 const part2=await runSyntheticPart2JudgeTrace();
 const report=summarizeSyntheticJudgeTrace(raw,part2);
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
      part2Skills:report.verifiedFromThisCommand.part2FiveSkillsExecuted,
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
