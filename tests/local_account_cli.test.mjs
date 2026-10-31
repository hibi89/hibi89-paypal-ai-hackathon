import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('CLI opt-in account server actually serves authenticated roles without secrets in stdout',async()=>{
 const cwd=fileURLToPath(new URL('../',import.meta.url));
 const args=['--experimental-sqlite','scripts/run_demo.mjs','--local-accounts','--synthetic-seller'];
 const child=spawn(process.execPath,args,{cwd,env:{...process.env,
   PAYPAL_BROWSER_TEST_TOKEN_FILE:'',
   PAYPAL_LOCAL_BUYER_PASSWORD:'CLI-Buyer-Password_2026',
   PAYPAL_LOCAL_REVIEWER_PASSWORD:'CLI-Reviewer-Password_2026',
   PAYPAL_LOCAL_SELLER_PASSWORD:'CLI-Seller-Password_2026'},
   stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
 child.stdout.on('data',chunk=>{stdout+=chunk;});
 child.stderr.on('data',chunk=>{stderr+=chunk;});
 let finished=false;
 try{
  const origin=await new Promise((resolve,reject)=>{
   const deadline=setTimeout(()=>reject(new Error('CLI_START_TIMEOUT '+stderr)),15000);
   const interval=setInterval(()=>{
    const match=/OFFLINE DEMO ONLY .* (http:\/\/127\.0\.0\.1:\d+)/.exec(stdout);
    if(match){clearInterval(interval);clearTimeout(deadline);resolve(match[1]);}
    if(child.exitCode!==null){clearInterval(interval);clearTimeout(deadline);
      reject(new Error('CLI_EXITED '+stderr));}
   },50);
   child.once('error',e=>{clearInterval(interval);clearTimeout(deadline);reject(e);});
  });
  assert.equal((await fetch(origin+'/api/demo/identity')).status,401);
  const login=await fetch(origin+'/api/demo/auth/login',{method:'POST',
    headers:{origin,'content-type':'application/json'},
    body:JSON.stringify({actorId:'synthetic-seller',password:'CLI-Seller-Password_2026'})});
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const identity=await(await fetch(origin+'/api/demo/identity',{headers:{cookie}})).json();
  assert.equal(identity.identity.role,'seller');
  assert.equal(identity.identity.paymentAuthorized,false);
  assert.doesNotMatch(stdout,/CLI-Buyer-Password|CLI-Seller-Password|CLI-Reviewer-Password/);
  assert.match(stdout,/Local credential login enabled/);
 }finally{
  if(child.exitCode===null)child.kill('SIGINT');
  await Promise.race([new Promise(resolve=>child.once('exit',resolve)),
    new Promise(resolve=>setTimeout(resolve,3000))]);
  if(child.exitCode===null)child.kill('SIGKILL');
 }
});
