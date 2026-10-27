// Offline reviewer preflight: local files and runtime, never external APIs.
// Static existence check alone is NOT proof the app or PayPal/AI works.
export const REVIEW_FILES=Object.freeze([
  'LICENSE',
  'docs/JUDGE_REPRODUCTION_EN.md',
  'web/offline_demo.html',
  'web/demo_client.js',
  'web/contract_client.js',
  'web/subscription_client.js',
  'web/integration_client.js',
]);
export function inspectReviewerPrereqs({nodeVersion,manifest,files}={}){
  const parts=typeof nodeVersion==='string'?nodeVersion.replace(/^v/,'').split('.').map(Number):[];
  const runtime=parts.length===3 && parts.every(Number.isInteger) &&
    (parts[0]>22||(parts[0]===22&&parts[1]>=5));
  const scripts=manifest?.scripts;
  const runnable=manifest?.type==='module' &&
    typeof scripts?.demo==='string' &&
    scripts.demo==='node --experimental-sqlite scripts/run_demo.mjs' &&
    typeof scripts?.['preflight:reviewer']==='string' &&
    scripts['preflight:reviewer'].includes('--experimental-sqlite') &&
    typeof scripts?.test==='string' && scripts.test.includes('--test');
  const found=REVIEW_FILES.filter(k=>typeof files?.[k]==='string'&&files[k].length>0);
  const license=typeof files?.LICENSE==='string'&&files.LICENSE.startsWith('MIT License\n');
  const checks=Object.freeze({
    runtime:runtime?'READY':'UNSUPPORTED_NODE_RUNTIME',
    scripts:runnable?'READY':'MISSING_OR_UNEXPECTED_NPM_SCRIPTS',
    assets:found.length===REVIEW_FILES.length?'READY':'REQUIRED_ASSET_MISSING',
    license:license?'READY':'LOCAL_LICENSE_MISSING',
  });
  const ready=Object.values(checks).every(x=>x==='READY');
  return Object.freeze({status:ready?'PREREQUISITES_READY':'PREREQUISITES_BLOCKED',
    mode:'OFFLINE_LOCAL_ONLY',ready,checks,
    missingAssets:Object.freeze(REVIEW_FILES.filter(k=>!found.includes(k))),
    submissionEligible:false,externalProviderEvidence:false,providerNetworkCalls:0});
}
