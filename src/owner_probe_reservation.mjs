// Durable per-provider owner one-shot marker. No provider network or credentials.
import {constants,closeSync,fsyncSync,lstatSync,mkdirSync,openSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';

export const OWNER_PROBE_STATE_DIR=join(homedir(),'.paypal-hackathon-owner-probe');
const NAMES=Object.freeze({paypal:'sandbox-oauth.claim',gemini:'free-ai-text.claim'});
export function claimOwnerProbeOnce({provider,stateDir=OWNER_PROBE_STATE_DIR}={}){
 if(!Object.hasOwn(NAMES,provider)||typeof stateDir!=='string'||!stateDir.trim())
  return 'RESERVATION_UNAVAILABLE';
 let fd;
 try{
  mkdirSync(stateDir,{recursive:true,mode:0o700});
  const directory=lstatSync(stateDir);
  if(!directory.isDirectory()||directory.isSymbolicLink())
   return 'RESERVATION_UNAVAILABLE';
  const filepath=join(stateDir,NAMES[provider]);
  const flags=constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0);
  try{fd=openSync(filepath,flags,0o600);}
  catch(error){
   if(error?.code==='EEXIST')return 'ALREADY_CLAIMED';
   return 'RESERVATION_UNAVAILABLE';
  }
  writeFileSync(fd,JSON.stringify({provider,kind:'ONE_ATTEMPT_CONSUMED_OR_UNKNOWN',
   createdAt:new Date().toISOString()})+'\n','utf8');
  fsyncSync(fd);
  return 'CLAIMED';
 }catch{return 'RESERVATION_UNAVAILABLE';}
 finally{if(fd!==undefined){try{closeSync(fd);}catch{}}}
}
