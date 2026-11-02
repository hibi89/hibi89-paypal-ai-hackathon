// CI-only: real local Wrangler workerd HTTPS -> D1. No --remote or deployment.
import {spawn,spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {request as httpsRequest} from 'node:https';
import {createServer} from 'node:net';
import {resolve,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url)),temp=process.env.RUNNER_TEMP;
const fail=x=>{throw Error(x)};
if(process.env.GITHUB_ACTIONS!=='true'||!temp||process.env.CLOUDFLARE_API_TOKEN!==''||
 process.env.WRANGLER_SEND_METRICS!=='false')fail('LOCAL_CI_ONLY');
const persist=resolve(temp,'paypal-d1-local-only');
if(!existsSync(persist)||!persist.startsWith(resolve(temp)+sep))fail('D1_LOCAL_STATE_REQUIRED');
const uuid='00000000-0000-4000-8000-000000000001',suffix=randomBytes(8).toString('hex');
const config=resolve(root,'.wrangler-private-read-ci-'+suffix+'.json');
const sqlfile=join(temp,'workerd-seed-'+suffix+'.sql');
const token=randomBytes(32).toString('base64url');
const digest=createHash('sha256').update(token).digest('hex');
const hash='a'.repeat(64),now=Date.now();
let child=null,port;
const wait=ms=>new Promise(ok=>setTimeout(ok,ms));
async function unusedPort(){
 return new Promise((ok,bad)=>{
  const s=createServer();s.once('error',bad);
  s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?bad(e):ok(p))});
 });
}
function seed(){
 const p=spawnSync('npx',['--yes','wrangler@4.156.0','d1','execute','DB',
  '--local','--config',config,'--persist-to',persist,'--file',sqlfile],{
  cwd:root,encoding:'utf8',timeout:45000,maxBuffer:2000000,
  env:{...process.env,CLOUDFLARE_API_TOKEN:'',WRANGLER_SEND_METRICS:'false'}
 });
 if(p.error||p.status!==0)fail('LOCAL_WORKER_D1_SEED_FAILED');
}
async function request(path,headers={},method='GET'){
 return new Promise((ok,bad)=>{
  const req=httpsRequest({hostname:'127.0.0.1',port,path,method,headers,
   rejectUnauthorized:false,timeout:2500},res=>{
   // Self-signed TLS exception applies ONLY to this ephemeral local workerd.
   const encrypted=res.socket?.encrypted===true;
   let body='';res.on('data',chunk=>{body+=chunk;if(body.length>8000)req.destroy()});
   res.on('end',()=>ok({status:res.statusCode,body,headers:res.headers,encrypted}));
  });
  req.on('timeout',()=>req.destroy(Error('LOOPBACK_TIMEOUT')));
  req.on('error',bad);req.end();
 });
}
const path='/__private/attempt/status?quoteId=ciQuote&quoteVersion=1&operation=create&requestId=ciRequest';
async function main(){
 port=await unusedPort();
 const origin='https://127.0.0.1:'+port;
 writeFileSync(config,JSON.stringify({
  name:'proofline-read-workerd-ci',main:'src/worker_private_read_runtime.mjs',
  compatibility_date:'2026-10-01',
  d1_databases:[{binding:'DB',database_name:'paypal-d1-local-only',
   database_id:uuid,migrations_dir:'migrations/d1'}],
  vars:{PRIVATE_READ_ONLY_OPT_IN:'OWNER_READ_ONLY_D1_VERIFIED',
   PRIVATE_READ_ORIGIN:origin}
 }),{mode:0o600,flag:'wx'});
 const statements=[
  "INSERT INTO quotes(id,owner_id,merchant_id,version,currency,status,approval_actor,approval_version,approval_amount_minor) VALUES('ciQuote','ciOwner','ciMerchant',1,'USD','APPROVED','ciOwner',1,250)",
  "INSERT INTO payment_attempts(request_id,quote_id,quote_version,merchant_id,operation,state,amount_minor,currency) VALUES('ciRequest','ciQuote',1,'ciMerchant','create','IN_FLIGHT',250,'USD')",
  "INSERT INTO worker_private_oidc_bindings(issuer,subject_hmac,actor_id,merchant_id,role,active) VALUES('https://idp.example.invalid','"+hash+"','ciOwner','ciMerchant','OWNER',1)",
  "INSERT INTO worker_private_sessions(token_sha256,actor_id,merchant_id,role,issuer,issuer_verified_at_ms,expires_at_ms,binding_subject_hmac,binding_revision) VALUES('"+digest+"','ciOwner','ciMerchant','OWNER','https://idp.example.invalid',"+(now-1000)+","+(now+120000)+",'"+hash+"',1)"
 ];
 writeFileSync(sqlfile,statements.join(';\n')+';\n',{mode:0o600,flag:'wx'});
 seed();
 child=spawn('npx',['--yes','wrangler@4.156.0','dev','--config',config,
  '--ip','127.0.0.1','--port',String(port),'--local-protocol','https',
  '--infer-origin-from-routes=false','--persist-to',persist],{
  cwd:root,env:{...process.env,CLOUDFLARE_API_TOKEN:'',WRANGLER_SEND_METRICS:'false'},
  stdio:['ignore','pipe','pipe'],detached:true // Linux-only isolated process group
 });
 // Drain output to prevent pipe blockage. Never echo credentials or stack traces.
 for(const stream of [child.stdout,child.stderr])stream.on('data',()=>{});
 let ready=false;
 for(let i=0;i<80;i++){
  if(child.exitCode!==null)fail('LOCAL_WORKER_EXITED_BEFORE_READY');
  try{const r=await request('/unknown');
   if(r.encrypted&&r.status===404){ready=true;break;}
  }catch{/* local startup only, no provider or mutation */}
  await wait(350);
 }
 if(!ready)fail('LOCAL_WORKER_HTTPS_STARTUP_FAILED');
 if((await request(path,{'sec-fetch-site':'same-origin'})).status!==401)
  fail('ANONYMOUS_ALLOWED');
 const valid=await request(path,{cookie:'__Host-proofline_session='+token,
  'sec-fetch-site':'same-origin'});
 let data;try{data=JSON.parse(valid.body)}catch{fail('INVALID_WORKER_JSON')}
 if(valid.status!==200||!valid.encrypted||data.state!=='IN_FLIGHT'||
  data.paymentAuthorized!==false||data.providerCalls!==0||
  data.allowProviderPost!==false||data.verifiedPayPalGet!==false)
  fail('AUTHENTICATED_LOCAL_D1_READ_NOT_PROVEN');
 if(valid.headers['cache-control']!=='no-store, max-age=0'||
  valid.headers['access-control-allow-origin']!==undefined)
  fail('WORKER_CACHE_CORS_UNSAFE');
 if((await request(path,{cookie:'__Host-proofline_session='+token,
  'sec-fetch-site':'cross-site'})).status!==403)fail('CROSS_SITE_ALLOWED');
 if((await request(path,{cookie:'__Host-proofline_session='+token},'POST')).status!==405)
  fail('POST_ALLOWED');
 if((await request(path,{cookie:'__Host-proofline_session='+token,
  origin:'https://evil.example.invalid'})).status!==403)fail('CROSS_ORIGIN_ALLOWED');
 console.log(JSON.stringify({status:'ACTUAL_LOCAL_WORKER_HTTPS_D1_READ_PASS',
  workerdRuntime:true,localhostTls:true,d1AuthenticatedRead:true,
  anonymousBlocked:true,postBlocked:true,crossSiteBlocked:true,
  providerCalls:0,paymentAuthorized:false,remoteCloudflareVerified:false,
  productionDeploymentVerified:false}));
}
try{await main();}
catch(e){console.error('PRIVATE_WORKER_LOCAL_PROBE_BLOCKED:'+e.message);process.exitCode=2;}
finally{
 if(child?.pid){
  // npx launches a Wrangler grandchild; killing only npx may leave workerd
  // holding stderr/stdout open, indefinitely hanging the GitHub CI step.
  // This probe is Linux-GHA-only, so terminate the entire detached group.
  try{process.kill(-child.pid,'SIGTERM')}catch{try{child.kill('SIGTERM')}catch{}}
  await wait(500);
  try{process.kill(-child.pid,'SIGKILL')}catch{try{child.kill('SIGKILL')}catch{}}
  child.stdout?.destroy();child.stderr?.destroy();child.unref();
 }
 for(const file of [sqlfile,config])try{unlinkSync(file)}catch{}
}
