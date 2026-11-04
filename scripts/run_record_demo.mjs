// One-command cross-platform wrapper for the LOCAL OFFLINE Chromium recorder.
// No credentials, public network, payments, uploads or Devpost side effects.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const args=process.argv.slice(2);
if(args.includes('--help')||args.includes('-h')){
  console.log('Usage: npm run video:record:offline -- [--pace-ms 200..18000] [--output-dir DIRECTORY]');
  console.log('Requires Python 3, Playwright and Chrome/Chromium. Local synthetic silent WebM only; never uploads.');
}else{
  const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
  // CI installs Playwright inside an isolated venv; the end-user command uses
  // the normal local Python interpreter unless an explicit binary is provided.
  const python=process.env.VIDEO_PYTHON_BIN
    ? resolve(root,process.env.VIDEO_PYTHON_BIN)
    : process.platform==='win32'?'python':'python3';
  const env={};
  for(const [key,value] of Object.entries(process.env))
    if(!/(SECRET|TOKEN|PASSWORD|CREDENTIAL|API_KEY|CLIENT_ID|MERCHANT_ID|GEMINI|PAYPAL|OPENAI|AUTHORIZATION|PRIVATE_KEY|NODE_OPTIONS)/i.test(key))
      env[key]=value;
  const result=spawnSync(python,['scripts/record_judge_demo.py',...args],{
    cwd:root,env,windowsHide:true,stdio:'inherit',shell:false,timeout:240000
  });
  if(result.error){
    console.error('OFFLINE_RECORDING_TOOL_UNAVAILABLE: install Python 3, Playwright and Chrome/Chromium locally.');
    process.exitCode=1;
  }else process.exitCode=result.status===0?0:1;
}
