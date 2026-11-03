// CI-only: real local Wrangler workerd HTTPS -> D1. No --remote or deployment.
import {spawn,spawnSync} from 'node:child_process';
import {createHmac,generateKeyPairSync,randomBytes} from 'node:crypto';
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
const config=resolve(root,'.wrangler-private-identity-ci-'+suffix+'.json');
const sqlfile=join(temp,'workerd-identity-seed-'+suffix+'.sql');
const issuer='https://idp.workerd-fixture.invalid',subject='fixture-verified-owner';
const pepper=randomBytes(32);
const bindingHash=createHmac('sha256',pepper)
 .update('proofline:worker-oidc:v1\0'+issuer+'\0'+subject).digest('hex');
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const publicJwk={...publicKey.export({format:'jwk'}),
 kid:'ci-ephemeral-key',alg:'RS256',use:'sig'};
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
const path='/__private/attempt/status?quoteId=ciIdentityQuote&quoteVersion=1&operation=create&requestId=ciIdentityRequest';
async function main(){
 port=await unusedPort();
 const origin='https://127.0.0.1:'+port;
 const vars={
  CI_PRIVATE_IDENTITY_OPT_IN:'LOCAL_SYNTHETIC_NO_DEPLOY',
  CI_PRIVATE_ORIGIN:origin,
  CI_PRIVATE_JWKS:JSON.stringify({keys:[publicJwk]}),
  CI_PRIVATE_SIGNING_JWK:JSON.stringify(privateKey.export({format:'jwk'})),
  CI_PRIVATE_PEPPER:pepper.toString('base64'),
  CI_PRIVATE_OIDC_SECRET:randomBytes(32).toString('base64url')
 };
 writeFileSync(config,JSON.stringify({
  name:'proofline-internal-identity-workerd-ci',
  main:'scripts/worker_private_identity_workerd_ci.mjs',
  compatibility_date:'2026-10-01',
  d1_databases:[{binding:'DB',database_name:'paypal-d1-local-only',
   database_id:uuid,migrations_dir:'migrations/d1'}],
  vars
 }),{mode:0o600,flag:'wx'});
 const statements=[
  "INSERT INTO quotes(id,owner_id,merchant_id,version,currency,status,approval_actor,approval_version,approval_amount_minor) VALUES('ciIdentityQuote','ciOwner','ciMerchant',1,'USD','APPROVED','ciOwner',1,250)",
  "INSERT INTO payment_attempts(request_id,quote_id,quote_version,merchant_id,operation,state,amount_minor,currency) VALUES('ciIdentityRequest','ciIdentityQuote',1,'ciMerchant','create','IN_FLIGHT',250,'USD')",
  "INSERT INTO worker_private_oidc_bindings(issuer,subject_hmac,actor_id,merchant_id,role,active) VALUES('"+issuer+"','"+bindingHash+"','ciOwner','ciMerchant','OWNER',1)"
 ];
 writeFileSync(sqlfile,statements.join(';\n')+';\n',{mode:0o600,flag:'wx'});
 seed();
 child=spawn('npx',['--yes','wrangler@4.156.0','dev','--config',config,
  '--ip','127.0.0.1','--port',String(port),'--local-protocol','https',
  '--infer-origin-from-routes=false','--persist-to',persist],{
  cwd:root,env:{...process.env,CLOUDFLARE_API_TOKEN:'',WRANGLER_SEND_METRICS:'false'},
  stdio:['ignore','pipe','pipe'],detached:true
 });
 // Never echo the ephemeral test private JWK, config or Worker logs.
 for(const stream of [child.stdout,child.stderr])stream.on('data',()=>{});
 let ready=false;
 for(let i=0;i<80;i++){
  if(child.exitCode!==null)fail('LOCAL_IDENTITY_WORKER_EXITED_BEFORE_READY');
  try{const r=await request('/unknown');
   if(r.encrypted&&r.status===404){ready=true;break;}
  }catch{/* loopback readiness only, no third-party provider */}
  await wait(350);
 }
 if(!ready)fail('LOCAL_IDENTITY_WORKER_STARTUP_FAILED');
 if((await request(path,{'sec-fetch-site':'same-origin'})).status!==401)
  fail('ANONYMOUS_D1_READ_ALLOWED');
 if((await request('/api/auth/oidc/start')).status!==405)
  fail('LOGIN_UNSAFE_GET_ALLOWED');
 const began=await request('/api/auth/oidc/start',{
  origin,'sec-fetch-site':'same-origin'
 },'POST');
 if(began.status!==303||!began.encrypted)fail('WORKER_PKCE_START_FAILED');
 const redirect=new URL(began.headers.location);
 const state=redirect.searchParams.get('state');
 if(redirect.origin!==issuer||redirect.pathname!=='/authorize'||
    redirect.searchParams.get('code_challenge_method')!=='S256'||
    !/^[A-Za-z0-9_-]{43}$/.test(state??''))
  fail('PKCE_REDIRECT_OR_STATE_INVALID');
 const temporary=began.headers['set-cookie']??[];
 if(!Array.isArray(temporary)||temporary.length!==2)
  fail('PKCE_COOKIES_MISSING');
 const loginCookie=temporary.map(x=>x.split(';')[0]).join('; ');
 if(!loginCookie.includes('__Host-proofline_oidc_pkce=')||
    !loginCookie.includes('__Host-proofline_oidc_state='))
  fail('PKCE_VERIFIER_NOT_BROWSER_BOUND');
 const callback='/api/auth/oidc/callback?code=CI_ONE_TIME_SIGNED_CODE&state='+state;
 const logged=await request(callback,{cookie:loginCookie,'sec-fetch-site':'cross-site'});
 if(logged.status!==200||!logged.encrypted)fail('WORKER_RSA_PKCE_CALLBACK_FAILED');
 const issued=logged.headers['set-cookie']??[];
 if(!Array.isArray(issued)||issued.length!==3)
  fail('WORKER_SESSION_COOKIE_MISSING');
 const rawSession=issued.find(x=>x.startsWith('__Host-proofline_session='));
 if(!/^__Host-proofline_session=[A-Za-z0-9_-]{43}; Secure; HttpOnly; Path=\/; SameSite=Strict; Max-Age=\d+$/.test(rawSession??''))
  fail('WORKER_ISSUED_SESSION_NOT_STRICT');
 const sessionCookie=rawSession.split(';')[0];
 const auth=await request(path,{cookie:sessionCookie,'sec-fetch-site':'same-origin'});
 let data;try{data=JSON.parse(auth.body)}catch{fail('WORKER_D1_INVALID_JSON')}
 if(auth.status!==200||!auth.encrypted||data.state!=='IN_FLIGHT'||
    data.paymentAuthorized!==false||data.providerCalls!==0)
  fail('SIGNED_WORKER_SESSION_D1_READ_FAILED');
 if(auth.headers['cache-control']!=='no-store, max-age=0'||
    auth.headers['access-control-allow-origin']!==undefined)
  fail('CORS_OR_CACHE_UNSAFE');
 if((await request(path,{cookie:sessionCookie,'sec-fetch-site':'cross-site'})).status!==403)
  fail('CROSS_SITE_WORKER_READ_ALLOWED');
 if((await request(path,{cookie:sessionCookie},'POST')).status!==405)
  fail('WORKER_PAYMENT_METADATA_POST_ALLOWED');
 if((await request('/api/paypal/capture',{cookie:sessionCookie,origin},'POST')).status!==404)
  fail('WORKER_PAYMENT_MUTATION_ROUTE_EXPOSED');
 if((await request('/api/auth/oidc/logout',{
  cookie:sessionCookie,origin:'https://evil.invalid','sec-fetch-site':'cross-site'
 },'POST')).status!==403)fail('CROSS_SITE_LOGOUT_ALLOWED');
 const revoked=await request('/api/auth/oidc/logout',{
  cookie:sessionCookie,origin,'sec-fetch-site':'same-origin'
 },'POST');
 if(revoked.status!==200||
    !(revoked.headers['set-cookie']??[]).some(x=>x.includes('Max-Age=0')))
  fail('WORKER_D1_REVOKE_FAILED');
 if((await request(path,{cookie:sessionCookie,'sec-fetch-site':'same-origin'})).status!==401)
  fail('REVOKED_COOKIE_REUSED');
 if((await request(callback,{cookie:loginCookie})).status!==401)
  fail('PKCE_CALLBACK_REPLAY_ACCEPTED');
 console.log(JSON.stringify({
  status:'ACTUAL_LOCAL_WORKERD_PKCE_RSA_D1_LOGIN_READ_REVOKE_PASS',
  realWorkerdHttps:true,localTls:true,realLocalD1:true,pinnedRS256:true,
  s256Pkce:true,duplicateCallbackBlocked:true,sessionRevoked:true,
  unauthorizedPaymentRoutesBlocked:true,syntheticIdpOnly:true,
  actualProviderCalls:0,publicDeployment:false,remoteD1Verified:false,
  paymentAuthorized:false
 }));
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
