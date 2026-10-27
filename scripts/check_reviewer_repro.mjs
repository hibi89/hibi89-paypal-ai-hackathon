// Local-only smoke test of the real loopback demo; no browser, secrets or providers.
import {readFileSync} from 'node:fs';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';
import {inspectReviewerPrereqs,REVIEW_FILES} from '../src/reviewer_repro_preflight.mjs';

const root=new URL('../',import.meta.url);
const read=p=>{try{return readFileSync(new URL(p,root),'utf8');}catch{return '';}};
const assets=Object.fromEntries(REVIEW_FILES.map(p=>[p,read(p)]));
let manifest=null;
try{manifest=JSON.parse(read('package.json'));}catch{}
const report=inspectReviewerPrereqs({nodeVersion:process.versions.node,manifest,files:assets});
let outcome={
  mode:'OFFLINE_LOCAL_ONLY',status:report.status,ready:false,
  submissionEligible:false,externalProviderEvidence:false,providerNetworkCalls:0,
  paymentPostRequests:0,readOnlyRequests:0,blockedMutationRequests:0,checks:report.checks,
  missingAssets:report.missingAssets,
};
if(!report.ready){
  process.stdout.write(JSON.stringify(outcome,null,2)+'\n');
  process.exitCode=1;
}else{
  let server;
  try{
    server=await startOfflineDemo();
    // Fixed loopback URL supplied by the app, NOT user/CLI/env-controlled.
    if(!/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(server.url))
      throw new Error('LOOPBACK_URL_REQUIRED');
    const get=async path=>{
      const response=await fetch(server.url+path,{
        method:'GET',redirect:'error',signal:AbortSignal.timeout(5000)
      });
      outcome.readOnlyRequests++;
      if(response.status!==200)throw new Error('LOCAL_HTTP_FAILED');
      return response;
    };
    const html=await (await get('/')).text();
    if(!/offline/i.test(html)||!html.includes('draft-form'))
      throw new Error('DEMO_HTML_INVALID');
    const session=await (await get('/demo/session')).json();
    if(session.mode!=='OFFLINE_MOCK'||session.role!=='owner'||
       session.quoteId!=='sample-project')throw new Error('LOCAL_SESSION_INVALID');
    const value=await (await get('/api/quotes/sample-project')).json();
    if(value.quote?.id!=='sample-project'||value.quote?.version!==1||
       value.quote?.status!=='PROPOSED')
      throw new Error('LOCAL_QUOTE_INVALID');
    const integrationResponse=await get('/api/demo/integration');
    if(integrationResponse.headers.get('cache-control')!=='no-store'||
       integrationResponse.headers.get('x-content-type-options')!=='nosniff')
      throw new Error('LOCAL_READ_MODEL_CACHE_OR_MIME_UNSAFE');
    const integration=await integrationResponse.json();
    if(!integration||typeof integration!=='object'||Array.isArray(integration)||
       integration.mode!=='SYNTHETIC_LOOPBACK_ONLY'||
       integration.status!=='LOCAL_DEMO_INCOMPLETE'||
       integration.quote!=='HUMAN_APPROVAL_REQUIRED'||
       integration.contract!=='NO_CONTRACT'||
       integration.contractPayment!=='NOT_CAPTURED'||
       integration.subscriptionPayment!=='NOT_VERIFIED'||
       integration.realPayPal!=='NOT_TESTED'||
       integration.realAI!=='NOT_TESTED'||
       integration.realWebhook!=='NOT_TESTED'||
       integration.productionAuth!=='NOT_CONFIGURED'||
       integration.dataContract!=='NOT_CREATED'||
       integration.publicDeployment!=='NOT_TESTED')
      throw new Error('LOCAL_INTEGRATION_INVALID');
    const evidenceResponse=await get('/api/demo/evidence');
    if(evidenceResponse.headers.get('cache-control')!=='no-store'||
       evidenceResponse.headers.get('x-content-type-options')!=='nosniff')
      throw new Error('LOCAL_EVIDENCE_HEADERS_UNSAFE');
    const evidence=await evidenceResponse.json();
    if(evidence.mode!=='OFFLINE_SYNTHETIC'||
       evidence.source!=='READONLY_LOCAL_SQLITE'||
       evidence.dbvoraInspired?.readOnly!==true||
       evidence.dbvoraInspired?.integrity!=='PASS'||
       evidence.soviaStyle?.audit?.integrity!=='PASS'||
       evidence.soviaStyle?.audit?.kind!=='LOCAL_HASH_CHAIN_NOT_SIGNED'||
       evidence.businessIntelligence?.quotes?.total!==1||
       evidence.businessIntelligence?.quotes?.approved!==0||
       evidence.businessIntelligence?.providerTransactionsMeasured!==false||
       evidence.businessIntelligence?.paymentAttempts?.total!==0||
       evidence.businessIntelligence?.paymentAttempts?.localPaidRecords!==0||
       evidence.businessIntelligence?.aiDraftAttempts?.total!==0||
       evidence.businessIntelligence?.aiDraftAttempts?.unresolved!==0||
       evidence.businessIntelligence?.marketDemandMeasured!==false||
       evidence.dbvoraInspired?.backupsVerified!==false||
       evidence.soviaStyle?.checks?.find(x=>x.rule==='PAYPAL_PROVIDER_NOT_CONNECTED')?.status!=='NOT_TESTED')
      throw new Error('LOCAL_EVIDENCE_CLAIMS_INVALID');
    // The evidence inspector must remain read-only even when sent a mutation.
    const deniedEvidence=await fetch(server.url+'/api/demo/evidence',{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),
      headers:{'content-type':'application/json'},body:'{}'
    });
    outcome.blockedMutationRequests++;
    if(deniedEvidence.status!==405||deniedEvidence.headers.get('allow')!=='GET')
      throw new Error('LOCAL_EVIDENCE_ACCEPTED_MUTATION');
    const evidenceAfter=await (await get('/api/demo/evidence')).json();
    // Snapshot time is observational, not ledger mutation evidence.
    delete evidence.observedAt;
    delete evidenceAfter.observedAt;
    if(JSON.stringify(evidenceAfter)!==JSON.stringify(evidence))
      throw new Error('LOCAL_EVIDENCE_CHANGED_AFTER_REJECTED_POST');
    // Negative probe only against synthetic local read-model; never a payment endpoint.
    const forbidden=await fetch(server.url+'/api/demo/integration',{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),
      headers:{'content-type':'application/json'},body:'{}'
    });
    outcome.blockedMutationRequests++;
    if(forbidden.status!==405||forbidden.headers.get('allow')!=='GET')
      throw new Error('LOCAL_READ_MODEL_ACCEPTED_MUTATION');
    // Confirm the rejected POST did not alter the same synthetic read model.
    const afterForbidden=await (await get('/api/demo/integration')).json();
    if(JSON.stringify(afterForbidden)!==JSON.stringify(integration))
      throw new Error('LOCAL_READ_MODEL_CHANGED_AFTER_REJECTED_POST');
    outcome={...outcome,status:'REVIEWER_LOCAL_READY',ready:true,
      loopbackHttpVerified:true,checks:{...outcome.checks,loopback:'READY'}};
  }catch{
    outcome={...outcome,status:'REVIEWER_LOCAL_BLOCKED',
      checks:{...outcome.checks,loopback:'FAILED'},reason:'LOCAL_SMOKE_TEST_FAILED'};
    process.exitCode=1;
  }finally{
    if(server){
      try{await server.close();}
      catch{outcome={...outcome,status:'REVIEWER_LOCAL_BLOCKED',ready:false,
        reason:'LOCAL_SERVER_CLEANUP_FAILED'};process.exitCode=1;}
    }
  }
  process.stdout.write(JSON.stringify(outcome,null,2)+'\n');
}
