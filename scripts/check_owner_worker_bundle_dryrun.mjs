// Compile the REAL owner Worker candidate with Wrangler, without uploading.
// Explicitly local bundling: no credentials, account actions, deployment,
// migrations, PayPal, IdP or Gemini. Never accept a caller-provided target.
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('..',import.meta.url));
const VERSION='4.156.0';
const TEST_UUID='00000000-0000-4000-8000-000000000001';
const fail=code=>{throw new Error(code)};
export function makePrivateWorkerDryRunConfig(){
 // Invalid for an actual owner deployment: deliberately no owner credentials
 // or host opt-in vars, no real database UUID, route or workers.dev.
 return {
  name:'proofline-owner-bundle-offline-only',
  main:'src/worker_private_identity_host.mjs',
  compatibility_date:'2026-10-01',
  workers_dev:false,
  upload_source_maps:false,
  d1_databases:[{
   binding:'DB',database_name:'offline-test-no-remote-d1',
   database_id:TEST_UUID,migrations_dir:'migrations/d1'
  }],
  ratelimits:[{
   name:'PRIVATE_IDENTITY_RATE_LIMITER',
   namespace_id:'950513',
   simple:{limit:20,period:60}
  }]
 };
}
function assertSafe(config){
 if(config.main!=='src/worker_private_identity_host.mjs'||
    config.workers_dev!==false||config.routes||config.route||config.vars||
    config.env||config.triggers||config.durable_objects||
    config.d1_databases?.length!==1||
    config.d1_databases[0]?.database_id!==TEST_UUID||
    config.ratelimits?.length!==1||
    config.ratelimits[0]?.name!=='PRIVATE_IDENTITY_RATE_LIMITER')
  fail('UNSAFE_DRYRUN_CONFIG');
}
function main(argv){
 if(argv.length>0&&!(argv.length===1&&argv[0]==='--check'))
  fail('DRYRUN_ONLY_NO_REMOTE_MODE');
 const config=makePrivateWorkerDryRunConfig();
 assertSafe(config);
 const name='.owner-worker-bundle-'+randomBytes(8).toString('hex');
 const root=resolve(ROOT,name+'.json'),outdir=resolve(ROOT,name+'-output');
 try{
  writeFileSync(root,JSON.stringify(config,null,2),{mode:0o600,flag:'wx'});
  mkdirSync(outdir,{mode:0o700});
  const proc=spawnSync('npx',['--yes','wrangler@'+VERSION,'deploy',
   '--dry-run','--config',root,'--outdir',outdir],{
   cwd:ROOT,encoding:'utf8',timeout:90_000,maxBuffer:3_000_000,
   env:{...process.env,CLOUDFLARE_API_TOKEN:'',CLOUDFLARE_ACCOUNT_ID:'',
    WRANGLER_SEND_METRICS:'false',CI:'true'}
  });
  if(proc.error||proc.status!==0)fail('WRANGLER_OFFLINE_BUNDLE_FAILED');
  const files=readdirSync(outdir).filter(name=>name.endsWith('.js')||name.endsWith('.mjs'));
  if(files.length!==1)fail('BUNDLE_OUTPUT_NOT_SINGLE_SCRIPT');
  const bundled=readFileSync(join(outdir,files[0]),'utf8');
  if(bundled.length<1000||
     !bundled.includes('OWNER_IDENTITY_RUNTIME_NOT_AUTHORIZED')||
     !bundled.includes('PRIVATE_IDENTITY_RATE_LIMITER')||
     !bundled.includes('Continue with verified identity')||
     bundled.includes('CI_ONE_TIME_SIGNED_CODE')||
     bundled.includes('LOCAL_SYNTHETIC_NO_DEPLOY'))
    fail('BUNDLED_ENTRYPOINT_UNEXPECTED');
  console.log(JSON.stringify({
   status:'OWNER_WORKER_WRANGLER_DRYRUN_BUNDLE_PASS',
   wrangler:VERSION,sourceEntry:config.main,
   d1Binding:'DB',rateLimiter:'PRIVATE_IDENTITY_RATE_LIMITER',
   bytes:Buffer.byteLength(bundled),remoteRequests:0,
   accountCredentialsUsed:false,productionDeployed:false
  }));
 }finally{
  rmSync(root,{force:true});
  rmSync(outdir,{recursive:true,force:true});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main(process.argv.slice(2))}catch(error){
  // Errors are reason codes only; never dump subprocess logs with identities.
  console.error('OWNER_WORKER_DRYRUN_FAIL '+String(error?.message||'UNKNOWN'));
  process.exitCode=2;
 }
}
