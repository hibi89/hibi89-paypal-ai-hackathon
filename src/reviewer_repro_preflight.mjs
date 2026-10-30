// Offline reviewer preflight: local files and runtime, never external APIs.
// Static existence check alone is NOT proof the app or PayPal/AI works.
// Every browser script is a same-origin, static JS asset. Verify all ten
// exact source bodies before telling a judge the offline app is reproducible.
export const REVIEW_SCRIPT_ROUTES=Object.freeze([
  ['/demo/marketplace.js','web/marketplace_client.js'],
  ['/demo/agent-budget.js','web/agent_budget_client.js'],
  ['/demo/github-delivery.js','web/github_delivery_client.js'],
  ['/demo/client.js','web/demo_client.js'],
  ['/demo/contract.js','web/contract_client.js'],
  ['/demo/subscription.js','web/subscription_client.js'],
  ['/demo/integration.js','web/integration_client.js'],
  ['/demo/evidence.js','web/evidence_client.js'],
  ['/demo/provider-protocol.js','web/provider_protocol_client.js'],
  ['/demo/quote-checkout-preview.js','web/quote_checkout_preview_client.js'],
].map(([url,file])=>Object.freeze({url,file})));
export const REVIEW_FILES=Object.freeze([
  'LICENSE','docs/JUDGE_REPRODUCTION_EN.md','web/offline_demo.html',
  ...REVIEW_SCRIPT_ROUTES.map(route=>route.file)
]);
export function inspectReviewerPrereqs({nodeVersion,manifest,files}={}){
  const parts=typeof nodeVersion==='string'?nodeVersion.replace(/^v/,'').split('.').map(Number):[];
  const runtime=parts.length===3 && parts.every(Number.isInteger) &&
    (parts[0]>22||(parts[0]===22&&parts[1]>=5));
  const scripts=manifest?.scripts;
  const declaredRuntime=manifest?.engines?.node==='>=22.5.0';
  const runnable=declaredRuntime && manifest?.type==='module' &&
    typeof scripts?.demo==='string' &&
    scripts.demo==='node --experimental-sqlite scripts/run_demo.mjs' &&
    typeof scripts?.['preflight:reviewer']==='string' &&
    scripts['preflight:reviewer'].includes('--experimental-sqlite') &&
    typeof scripts?.test==='string' && scripts.test.includes('--test');
  const found=REVIEW_FILES.filter(k=>typeof files?.[k]==='string'&&files[k].length>0);
  const license=typeof files?.LICENSE==='string'&&files.LICENSE.startsWith('MIT License\n');
  const html=typeof files?.['web/offline_demo.html']==='string'?
    files['web/offline_demo.html']:'';
  const linkedScripts=[...html.matchAll(/<script\\s+[^>]*src=["']([^"']+)["'][^>]*>/g)]
    .map(match=>match[1]);
  const exactScripts=linkedScripts.length===REVIEW_SCRIPT_ROUTES.length&&
    linkedScripts.every((url,index)=>url===REVIEW_SCRIPT_ROUTES[index].url);
  const checks=Object.freeze({
    runtime:runtime?'READY':'UNSUPPORTED_NODE_RUNTIME',
    scripts:runnable?'READY':'MISSING_OR_UNEXPECTED_NPM_SCRIPTS',
    assets:found.length===REVIEW_FILES.length?'READY':'REQUIRED_ASSET_MISSING',
    license:license?'READY':'LOCAL_LICENSE_MISSING',
    browserScripts:exactScripts?'READY':'BROWSER_SCRIPT_LINKS_MISSING_OR_CHANGED',
  });
  const ready=Object.values(checks).every(x=>x==='READY');
  return Object.freeze({status:ready?'PREREQUISITES_READY':'PREREQUISITES_BLOCKED',
    mode:'OFFLINE_LOCAL_ONLY',ready,checks,
    missingAssets:Object.freeze(REVIEW_FILES.filter(k=>!found.includes(k))),
    submissionEligible:false,externalProviderEvidence:false,providerNetworkCalls:0});
}
