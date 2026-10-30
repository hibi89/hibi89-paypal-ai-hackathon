// Optional owner-only offline neural narration, after owner separately
// supplies free open-weight Kokoro model assets. No downloads, TTS API calls,
// cloud uploads, playback publication, or original media overwrite.
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const python=join(root,'.video-venv',
  process.platform==='win32'?'Scripts/python.exe':'bin/python');
const args=process.argv.slice(2);
const sampleOnly=args.includes('--sample-only');
const voiceArgs=args.filter(a=>a!=='--sample-only');
const voice=voiceArgs.length===0?'af_heart':voiceArgs.length===2&&voiceArgs[0]==='--voice'?voiceArgs[1]:null;
const voices=new Set(['af_heart','af_bella','af_sarah','af_nicole','am_michael',
 'am_adam','bf_emma','bf_isabella','bm_george','bm_lewis']);
if(!voices.has(voice)){
 console.error('USAGE: npm run video:voice:neural:owner -- [--sample-only] [--voice af_heart]');
 process.exitCode=2;
}else if(!existsSync(python)){
 console.error('LOCAL_VIDEO_PYTHON_REQUIRED__NO_AUTOINSTALL');
 process.exitCode=2;
}else{
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>
  !/(SECRET|TOKEN|PASSWORD|CREDENTIAL|API_KEY|CLIENT_ID|MERCHANT_ID|GEMINI|PAYPAL|OPENAI|AUTHORIZATION|PRIVATE_KEY|NODE_OPTIONS)/i.test(key)));
 const result=spawnSync(python,['scripts/render_owner_neural_voice.py','--voice',voice,...(sampleOnly?['--sample-only']:[])],{
  cwd:root,env,stdio:'inherit',shell:false,windowsHide:true,timeout:600000});
 if(result.error){
  console.error(result.error.code==='ETIMEDOUT'?'OFFLINE_NEURAL_TTS_TIMEOUT':'OFFLINE_NEURAL_TTS_START_FAILED');
  process.exitCode=2;
 }else process.exitCode=result.status===0?0:2;
}
