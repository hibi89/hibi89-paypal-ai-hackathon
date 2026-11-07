// Private owner-local WORKNOVA recording/approved Kokoro voice only.
// No downloads, no provider API, no transaction, no upload.
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const python=join(root,'.video-venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const [mode,...flags]=process.argv.slice(2);
const modes=Object.freeze({
  capture:'scripts/worknova_owner_capture.py',
  voice:'scripts/worknova_part2_neural.py',
  mix:'scripts/worknova_private_voice_mux.py'
});
if(!Object.hasOwn(modes,mode)||!flags.length||flags.some(f=>/^(--publish|--upload|--devpost|--pay|--live)$/i.test(f))){
  console.error('WORKNOVA_LOCAL_TOOL_MODE_REQUIRED capture|voice and explicit options. No publication allowed.');
  process.exitCode=2;
}else if(!existsSync(python)){
  console.error('WORKNOVA_LOCAL_VIDEO_VENV_MISSING: use the existing .video-venv; no auto-install.');
  process.exitCode=2;
}else{
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>
    !/(SECRET|TOKEN|PASSWORD|CREDENTIAL|API_KEY|CLIENT_ID|MERCHANT_ID|GEMINI|PAYPAL|OPENAI|AUTHORIZATION|PRIVATE_KEY|NODE_OPTIONS)/i.test(name)));
  const result=spawnSync(python,[modes[mode],...flags],{
    cwd:root,env,stdio:'inherit',shell:false,windowsHide:false,timeout:15*60*1000
  });
  if(result.error)console.error(result.error.code==='ETIMEDOUT'?'WORKNOVA_LOCAL_TOOL_TIMEOUT':'WORKNOVA_LOCAL_TOOL_START_FAILED');
  process.exitCode=result.status===0?0:2;
}
