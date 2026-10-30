// Browser-visible diagnostic for ONE local synthetic owner session only.
// Explicit click + CSRF; executes existing REAL orchestration with FAKE
// transport implementations, never global fetch, PayPal, Gemini, or payment.
// This is not a payment API, a production auth system, or provider proof.
import {runOfflineOperatorMvpSmoke} from './offline_operator_mvp_smoke.mjs';
import {summarizeSyntheticJudgeTrace} from '../scripts/build_judge_evidence_report.mjs';

const headers={'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store','x-content-type-options':'nosniff'};
const reply=(body,status)=>new Response(JSON.stringify(body),{status,headers});
const fail=code=>reply({error:code,providerCalls:0,paymentPosts:0},403);

export function createSyntheticProtocolDemoApi({resolveSession,
  runProbe=runOfflineOperatorMvpSmoke,maxReplays=5}={}){
 if(typeof resolveSession!=='function'||typeof runProbe!=='function'||
   !Number.isSafeInteger(maxReplays)||maxReplays<1||maxReplays>20)
   throw Error('SYNTHETIC_PROTOCOL_DEPENDENCIES_REQUIRED');
 let inProgress=false,replays=0;
 return async function handle(request){
   if(request.method!=='POST')
     return new Response(JSON.stringify({error:'METHOD_NOT_ALLOWED'}),{
       status:405,headers:{...headers,allow:'POST'}});
   const origin=new URL(request.url).origin;
   if(!/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(origin)||
      request.headers.get('origin')!==origin||
      request.headers.get('content-type')!=='application/json'||
      !request.headers.get('x-csrf-token'))
      return fail('SYNTHETIC_PROTOCOL_OWNER_CSRF_REQUIRED');
   const session=await resolveSession(request);
   // Reviewer, forged persona or untrusted synthetic owner must not gain
   // a diagnostic button that looks like a real provider surface.
   if(!session||session.verified!==true||
      session.actorId!=='synthetic-owner'||
      session.merchantId!=='synthetic-merchant')
      return reply({error:'SYNTHETIC_PROTOCOL_NOT_FOUND'},404);
   if(session.csrfToken!==request.headers.get('x-csrf-token'))
      return fail('SYNTHETIC_PROTOCOL_OWNER_CSRF_REQUIRED');
   let body;
   try{
     body=await request.text();
     if(body!=='{}')return reply({error:'EMPTY_SYNTHETIC_ACTION_ONLY'},400);
   }catch{return reply({error:'INVALID_SYNTHETIC_BODY'},400)}
   if(inProgress)return reply({error:'SYNTHETIC_PROTOCOL_BUSY'},409);
   if(replays>=maxReplays)return reply({error:'SYNTHETIC_PROTOCOL_BUDGET_EXHAUSTED'},429);
   // One human click issues one bounded local probe, no replay on F5.
   inProgress=true;replays++;
   try{
     const trace=summarizeSyntheticJudgeTrace(await runProbe());
     const proof=trace.verifiedFromThisCommand.fakeApiProtocol;
     return reply({
       status:'SYNTHETIC_API_PROTOCOL_REPLAY_ONLY',
       source:'REAL_OWNER_ORCHESTRATOR_WITH_INJECTED_FAKE_GEMINI_PAYPAL',
       syntheticAmount:'USD 1.50 · human approved in fixture',
       stages:[...proof.stageSequence],
       approvals:[...proof.consentStages],
       geminiFixtureCalls:trace.verifiedFromThisCommand.fakeGeminiRequests,
       fakeCreatePosts:trace.verifiedFromThisCommand.fakePayPalOrderCreateRequests,
       fakeCapturePosts:trace.verifiedFromThisCommand.fakePayPalCaptureRequests,
       fakeGetReconciliation:trace.verifiedFromThisCommand.fakeProviderGetReconciliation,
       realProviderCalls:0,realPaymentCaptured:false,
       ownerHistoricalProviderResult:'NOT_CHECKED_BY_THIS_REPLAY',
       publicSubmission:'NOT_SUBMITTED',
       externalRequestsAllowed:false,
       attribution:'A replay of injected fakes, NOT a PayPal Sandbox receipt or live Gemini call.'
     },200);
   }catch{
     return reply({error:'LOCAL_SYNTHETIC_PROTOCOL_REPLAY_FAILED',
       realProviderCalls:'NOT_ATTESTED',realPaymentCaptured:false},503);
   }finally{inProgress=false}
 };
}
