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
  paymentPostRequests:0,readOnlyRequests:0,checks:report.checks,
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
    const integration=await (await get('/api/demo/integration')).json();
    if(!integration||typeof integration!=='object'||Array.isArray(integration)||
       integration.mode!=='SYNTHETIC_LOOPBACK_ONLY'||
       integration.status!=='LOCAL_DEMO_INCOMPLETE'||
       integration.quote!=='HUMAN_APPROVAL_REQUIRED'||
       integration.contract!=='NO_CONTRACT'||
       integration.contractPayment!=='NOT_CAPTURED'||
       integration.subscriptionPayment!=='NOT_VERIFIED'||
       integration.realPayPal!=='NOT_TESTED'||
       integration.realAI!=='NOT_TESTED'||
       integration.publicDeployment!=='NOT_TESTED')
      throw new Error('LOCAL_INTEGRATION_INVALID');
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
