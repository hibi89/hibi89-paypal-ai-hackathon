// Recover ONLY already-generated private narration WAV + synthetic footage.
// No provider calls, no speech generation, no recording, no upload, no overwrite.
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const python=join(root,'.video-venv',process.platform==='win32'?
  'Scripts/python.exe':'bin/python');
if(process.argv.length!==2){
  console.error('NO_ARGUMENTS_ALLOWED_FOR_PRIVATE_VOICE_RECOVERY');
  process.exitCode=2;
}else if(!existsSync(python)){
  console.error('EXISTING_LOCAL_VIDEO_PYTHON_REQUIRED__NO_DOWNLOAD_OR_RE_RECORD');
  process.exitCode=2;
}else{
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>
    !/(SECRET|TOKEN|PASSWORD|CREDENTIAL|API_KEY|CLIENT_ID|MERCHANT_ID|GEMINI|PAYPAL|OPENAI|AUTHORIZATION|PRIVATE_KEY|NODE_OPTIONS)/i.test(name)));
  const result=spawnSync(python,['scripts/recover_owner_voice_mux.py'],{
    cwd:root,env,shell:false,stdio:'inherit',windowsHide:true,timeout:120000});
  if(result.error){
    console.error(result.error.code==='ETIMEDOUT'?'RECOVERY_PROCESS_TIMEOUT':'VOICE_RECOVERY_LAUNCH_FAILED');
    process.exitCode=2;
  }else process.exitCode=result.status===0?0:2;
}
