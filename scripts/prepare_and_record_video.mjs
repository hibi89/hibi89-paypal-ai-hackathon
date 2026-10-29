// Owner-initiated, one-command offline video preparation and recording.
// Only installs pinned local Python Playwright + its ffmpeg helper when needed.
// Never accesses user PayPal/Gemini secrets, never calls providers, never publishes.
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const args=process.argv.slice(2);
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>
  !/(SECRET|TOKEN|PASSWORD|CREDENTIAL|API_KEY|CLIENT_ID|MERCHANT_ID|GEMINI|PAYPAL|OPENAI|AUTHORIZATION|PRIVATE_KEY|NODE_OPTIONS)/i.test(k)));
const executable=process.platform==='win32'?'Scripts/python.exe':'bin/python';
const venv=join(root,'.video-venv');
const python=join(venv,executable);
const run=(bin,argv,{quiet=false}={})=>{
  const r=spawnSync(bin,argv,{cwd:root,env,windowsHide:true,encoding:'utf8',
    stdio:quiet?'pipe':'inherit',shell:false,timeout:180000,maxBuffer:2*1024*1024});
  return !r.error&&r.status===0;
};
if(args.includes('--help')||args.includes('-h')){
  console.log('Usage: npm run video:record:owner -- [--pace-ms 200..18000]');
  console.log('Installs only pinned free Playwright Python + ffmpeg in ignored .video-venv/.');
  console.log('Requires Python 3 and installed Chrome/Chromium. Local synthetic video ONLY; no upload.');
}else if(args.length!==0&&(args.length!==2||args[0]!=='--pace-ms'||
  !/^\d{3,5}$/.test(args[1])||Number(args[1])<200||Number(args[1])>18000)){
  console.error('INVALID_VIDEO_FLAGS');
  process.exitCode=2;
}else {
  try{
    if(!existsSync(python)){
      const candidates=process.platform==='win32'
        ?[['py',['-3','-m','venv',venv]],['python',['-m','venv',venv]]]
        :[['python3',['-m','venv',venv]],['python',['-m','venv',venv]]];
      console.log('Preparing isolated Python video environment (no provider access)…');
      const made=candidates.some(([bin,argv])=>run(bin,argv,{quiet:true}));
      if(!made||!existsSync(python))throw Error('PYTHON3_VENV_REQUIRED');
    }
    const pinned=run(python,['-c',"import importlib.metadata; assert importlib.metadata.version('playwright') == '1.56.0'"],{quiet:true});
    if(!pinned){
      console.log('Installing pinned local Playwright (free tooling only)…');
      if(!run(python,['-m','pip','install','--disable-pip-version-check','playwright==1.56.0']))
        throw Error('PLAYWRIGHT_INSTALL_FAILED');
    }
    // The OS Chrome/Chromium binary is used, only Playwright ffmpeg is installed.
    // Running the install twice is safe and avoids the CI missing-ffmpeg failure.
    console.log('Checking Playwright ffmpeg helper…');
    if(!run(python,['-m','playwright','install','ffmpeg']))
      throw Error('PLAYWRIGHT_FFMPEG_UNAVAILABLE');
    const wrapper=join(root,'scripts','run_record_demo.mjs');
    const recorded=spawnSync(process.execPath,[wrapper,...args],{
      cwd:root,env:{...env,VIDEO_PYTHON_BIN:python},windowsHide:true,
      stdio:'inherit',shell:false,timeout:240000});
    if(recorded.error||recorded.status!==0)
      throw Error('LOCAL_VIDEO_RECORDING_FAILED');
    if(!run(python,['scripts/check_recorded_video.py']))
      throw Error('LOCAL_VIDEO_INTEGRITY_VERIFICATION_FAILED');
    console.log('OWNER_VIDEO_LOCAL_ONLY: Review output/videos before any publication.');
  }catch(e){
    console.error(e.message||'OWNER_VIDEO_SETUP_FAILED');
    process.exitCode=1;
  }
}
