// Optional local-only Cloudflare Quick Tunnel orchestration for owner-approved
// Sandbox pilot. Never starts automatically; NEVER payment authority.
import {spawn} from 'node:child_process';
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
export function parseOwnerQuickTunnelOrigin(text){
  if(typeof text!=='string')return null;
  const candidates=text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/gi)||[];
  for(const value of candidates){
    try{
      const url=new URL(value);
      if(url.protocol==='https:'&&url.origin===value&&
        /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com$/.test(url.hostname))
        return url.origin;
    }catch{}
  }
  return null;
}
export async function startOwnerMvpQuickTunnel({
  port,spawnProcess=spawn,timeoutMs=30000
}={}){
  if(!Number.isSafeInteger(port)||port<1024||port>65535||
     typeof spawnProcess!=='function'||!Number.isSafeInteger(timeoutMs)||
     timeoutMs<100||timeoutMs>120000)fail('QUICK_TUNNEL_INVALID_ARGUMENTS');
  let child;
  try{
    child=spawnProcess('cloudflared',['tunnel','--url',
      'http://127.0.0.1:'+port],{
      shell:false,stdio:['ignore','pipe','pipe'],windowsHide:true
    });
  }catch{fail('QUICK_TUNNEL_START_FAILED');}
  if(!child?.stdout?.on||!child?.stderr?.on||!child?.once||
     typeof child.kill!=='function')fail('QUICK_TUNNEL_PROCESS_INVALID');
  let exited=false;
  const markExit=()=>{exited=true};
  child.once('exit',markExit);
  // Never print raw cloudflared stderr: remote logs are not payment proof.
  let publicOrigin;
  try{
    publicOrigin=await new Promise((resolve,reject)=>{
      let complete=false,buffer='';
      const finish=(error,value)=>{
        if(complete)return;
        complete=true;clearTimeout(timeout);
        child.stdout.off('data',consume);child.stderr.off('data',consume);
        child.off('exit',onExit);child.off('error',onError);
        if(error)reject(error);else resolve(value);
      };
      const onExit=()=>finish(new Error('QUICK_TUNNEL_EXITED_BEFORE_READY'));
      const onError=()=>finish(new Error('QUICK_TUNNEL_START_FAILED'));
      const consume=chunk=>{
        buffer=(buffer+String(chunk)).slice(-8192);
        const found=parseOwnerQuickTunnelOrigin(buffer);
        if(found)finish(null,found);
      };
      child.stdout.on('data',consume);child.stderr.on('data',consume);
      child.once('exit',onExit);child.once('error',onError);
      const timeout=setTimeout(()=>finish(new Error('QUICK_TUNNEL_READY_TIMEOUT')),timeoutMs);
    });
  }catch(e){
    if(!exited)try{child.kill('SIGTERM')}catch{}
    fail(e?.message?.startsWith('QUICK_TUNNEL_')?e.message:'QUICK_TUNNEL_START_FAILED');
  }
  let closed=false;
  async function close(){
    if(closed)return;closed=true;
    if(exited)return;
    await new Promise(resolve=>{
      const timer=setTimeout(()=>{
        if(!exited)try{child.kill('SIGKILL')}catch{}
        resolve();
      },2000);
      child.once('exit',()=>{clearTimeout(timer);resolve()});
      try{child.kill('SIGTERM')}catch{clearTimeout(timer);resolve()}
    });
  }
  return Object.freeze({
    publicOrigin,mode:'OWNER_APPROVED_TEMPORARY_PUBLIC_HTTPS',
    productionDeployment:false,providerCalls:0,paymentPosts:0,
    stopRequired:true,close
  });
}
