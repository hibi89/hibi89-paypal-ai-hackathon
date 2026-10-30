// Offline, temporary-fixture verification for Windows and CI.
// No npm install, public tunnel, billing, payment POST, DB reset or deployment.
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const args=process.argv.slice(2);
if(args.some(x=>!['--plan','--core'].includes(x))){
  process.stdout.write(JSON.stringify({status:'INVALID_VERIFY_ARGUMENTS',allowed:['--plan','--core']})+'\n');
  process.exitCode=2;
}else{
 const core=args.includes('--core');
 const python=process.platform==='win32'?'python':'python3';
 const npm=process.platform==='win32'?'npm.cmd':'npm';
 const checks=[
  {name:'GIT_HEAD',command:'git',argv:['rev-parse','HEAD']},
  {name:'NODE_VERSION',command:process.execPath,argv:['--version']},
  {name:'MASTER_PROGRESS',command:python,argv:['render_master_progress.py','--check']},
  {name:'NODE_REGRESSION',command:npm,argv:['test']},
  {name:'SYNTHETIC_MVP_E2E',command:npm,argv:['run','mvp:simulate']},
  {name:'REVIEWER_LOOPBACK',command:npm,argv:['run','preflight:reviewer'],skip:core?'CORE_MODE':null},
  {name:'CHROMIUM_LOOPBACK',command:python,argv:['tests/browser_offline_e2e.py'],browser:true,skip:core?'CORE_MODE':null}
 ];
 const plan=checks.map(({name,skip,browser})=>({name,run:!skip,optionalBrowser:Boolean(browser),reason:skip||null}));
 if(args.includes('--plan')){
  process.stdout.write(JSON.stringify({status:'VERIFY_LOCAL_PLAN_ONLY',networkProviderCalls:0,
   paymentPosts:0,privateDbWrites:0,steps:plan})+'\n');
 }else{
  const start=Date.now();
  const outdir=mkdtempSync(join(tmpdir(),'paypal-verify-'));
  // Never pass the user's API keys or payment credentials into test processes.
  const childEnv={};
  for(const [key,value] of Object.entries(process.env)){
    if(/(SECRET|TOKEN|PASSWORD|CREDENTIAL|API_KEY|CLIENT_ID|MERCHANT_ID|GEMINI|PAYPAL|OPENAI|AUTHORIZATION|PRIVATE_KEY)/i.test(key))continue;
    if(key==='NODE_OPTIONS'||key==='NODE_EXTRA_CA_CERTS')continue;
    childEnv[key]=value;
  }
  const results=[];
  const execute=step=>{
    const begin=Date.now();
    let p;
    try{
      p=spawnSync(step.command,step.argv,{cwd:root,env:childEnv,
        windowsHide:true,encoding:'utf8',timeout:240000,maxBuffer:8*1024*1024,
        shell:process.platform==='win32'&&step.command===npm});
    }catch(e){p={error:e,status:null,stdout:'',stderr:''}}
    const ok=p.status===0&&!p.error;
    const label=ok?'PASS':'FAIL';
    writeFileSync(join(outdir,step.name+'.log'),
      (p.stdout||'')+'\n--- STDERR ---\n'+(p.stderr||'')+
      (p.error?'\nERROR_CODE='+(p.error.code||'UNKNOWN'):'')+'\n',
      {encoding:'utf8',mode:0o600});
    const result={name:step.name,status:label,exitCode:p.status,
      errorCode:p.error?.code||null,elapsedMs:Date.now()-begin};
    results.push(result);
    process.stdout.write(step.name+': '+label+'\n');
    return ok;
  };
  for(const step of checks){
    if(step.skip){results.push({name:step.name,status:'SKIP',reason:step.skip});continue;}
    if(step.browser){
      const probe=spawnSync(python,['-c','import playwright'],{cwd:root,
        env:childEnv,windowsHide:true,encoding:'utf8',timeout:5000});
      if(probe.status!==0||probe.error){
        results.push({name:step.name,status:'SKIP',reason:'PLAYWRIGHT_NOT_INSTALLED'});
        continue;
      }
    }
    execute(step);
  }
  const failed=results.some(r=>r.status==='FAIL');
  const report={status:failed?'VERIFY_LOCAL_FAIL':'VERIFY_LOCAL_PASS',
    source:'OWNER_LOCAL_OR_CI_ONLY',providerCalls:0,paymentPosts:0,
    privateDbWrites:0,githubPushes:0,elapsedMs:Date.now()-start,
    logDirectory:outdir,results};
  writeFileSync(join(outdir,'summary.json'),JSON.stringify(report,null,2)+'\n',
    {encoding:'utf8',mode:0o600});
  process.stdout.write(JSON.stringify(report)+'\n');
  if(failed)process.exitCode=1;
 }
}
