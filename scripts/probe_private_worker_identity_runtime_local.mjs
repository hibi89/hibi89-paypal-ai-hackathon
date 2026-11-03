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
async function request(path,headers={},method='GET',body=null){
 return new Promise((ok,bad)=>{
  const req=httpsRequest({hostname:'127.0.0.1',port,path,method,headers,
   rejectUnauthorized:false,timeout:2500},res=>{
   // Self-signed TLS exception applies ONLY to this ephemeral local workerd.
   const encrypted=res.socket?.encrypted===true;
   let body='';res.on('data',chunk=>{body+=chunk;if(body.length>8000)req.destroy()});
   res.on('end',()=>ok({status:res.statusCode,body,headers:res.headers,encrypted}));
  });
  req.on('timeout',()=>req.destroy(Error('LOOPBACK_TIMEOUT')));
  req.on('error',bad);req.end(body);
 });
}
// Run real Chromium against this same ephemeral HTTPS workerd. The one-use
// synthetic session cookie is sent through process stdin, never argv/logs.
async function browserVerify(mode,origin,sessionCookie){
 const binary=resolve(root,'.browser-venv/bin/python');
 if(!existsSync(binary)||!['active','revoked'].includes(mode))
  fail('LOCAL_WORKERD_CHROMIUM_TOOLING_REQUIRED');
 const report=await new Promise((ok,bad)=>{
  const proc=spawn(binary,['tests/browser_private_d1_workerd_e2e.py',origin,mode],{
   cwd:root,env:{...process.env,CLOUDFLARE_API_TOKEN:'',
    WRANGLER_SEND_METRICS:'false'},stdio:['pipe','pipe','pipe']
  });
  let output='',overflow=false;
  const timeout=setTimeout(()=>{overflow=true;proc.kill('SIGKILL')},30000);
  proc.stdout.on('data',chunk=>{
   output+=chunk.toString('utf8');
   if(output.length>4096){overflow=true;proc.kill('SIGKILL')}
  });
  // Never copy raw browser stderr to CI logs; no synthetic cookie leakage.
  proc.stderr.on('data',()=>{});
  proc.once('error',()=>{clearTimeout(timeout);bad(Error('CHROMIUM_START_FAILED'))});
  proc.once('close',code=>{
   clearTimeout(timeout);
   let result;
   try{result=JSON.parse(output.trim())}catch{/* no raw log output */}
   if(overflow||code!==0){
    // Fixed, finite classifications only. Browser stderr, URLs and cookies
    // are never echoed into logs or artifacts.
    const phases=['START','CHROMIUM_LAUNCH','ANONYMOUS_NAVIGATION',
     'SYNTHETIC_COOKIE_SET','AUTHENTICATED_NAVIGATION','D1_ROWS_RENDER',
     'BROWSER_REFRESH_AND_RELOAD','CONSOLE_NETWORK_VERIFY'];
    const reason=typeof result?.reason==='string'&&
     /^[A-Z_]{4,80}$/.test(result.reason)?result.reason:'UNCLASSIFIED';
    console.error(JSON.stringify({status:'LOCAL_CHROMIUM_DIAGNOSTIC',
     phase:phases.includes(result?.phase)?result.phase:'UNKNOWN',
     reason,exitCode:code}));
    return bad(Error('CHROMIUM_'+mode.toUpperCase()+'_FAILED'));
   }
   if(!result)return bad(Error('CHROMIUM_PROOF_INVALID'));
   ok(result);
  });
  proc.stdin.end(JSON.stringify({sessionCookie}));
 });
 const expected=mode==='active'?'REAL_LOCAL_WORKERD_CHROMIUM_OWNER_D1_VIEW_PASS':
  'LOCAL_WORKERD_CHROMIUM_REVOKED_SESSION_BLOCKED';
 if(report?.status!==expected||report.realChromium!==true||
    report.localHttps!==true||report.externalRequests!==0||
    report.paymentPosts!==0||
    (mode==='active'&&(report.renderedRows!==2||
      report.browserRefreshReadOnly!==true||report.pageErrors!==0))||
    (mode==='revoked'&&report.revokedCookieBlocked!==true))
  fail('CHROMIUM_PROOF_REJECTED');
 console.log(JSON.stringify(report));
}
async function browserRoleVerify(origin,ownerCookie,sellerCookie,reviewerCookie){
 const python=resolve(root,'.browser-venv/bin/python');
 if(!existsSync(python))fail('LOCAL_CHROMIUM_ROLE_TOOLING_REQUIRED');
 const report=await new Promise((ok,bad)=>{
  const child=spawn(python,['tests/browser_contract_roles_workerd_e2e.py',origin],{
   cwd:root,env:{...process.env,CLOUDFLARE_API_TOKEN:'',
    WRANGLER_SEND_METRICS:'false'},stdio:['pipe','pipe','pipe']
  });
  let output='',overflow=false,timedOut=false;
  // Three independent HTTPS browser contexts, five D1 POSTs and repeated
  // authenticated reloads can exceed the former 40s aggregate deadline on
  // shared CI. Each Playwright assertion still has its own strict bound.
  // Keep an explicit 120s total cap; this is not a bypass of any assertion.
  const timeout=setTimeout(()=>{timedOut=true;child.kill('SIGKILL')},120000);
  child.stdout.on('data',chunk=>{
   output+=chunk.toString('utf8');
   if(output.length>4096){overflow=true;child.kill('SIGKILL')}
  });
  child.stderr.on('data',()=>{});
  child.once('error',()=>{clearTimeout(timeout);bad(Error('CHROMIUM_ROLE_LAUNCH_FAILED'))});
  child.once('close',code=>{
   clearTimeout(timeout);
   let result;try{result=JSON.parse(output.trim())}catch{}
   if(code!==0||overflow||timedOut||
      result?.status!=='LOCAL_WORKERD_CHROMIUM_3ROLE_D1_CONTRACT_PASS'){
    const reasons=['BROWSER_POST_COUNT_UNEXPECTED','BROWSER_SCRIPT_OR_CONSOLE_ERROR',
     'EXTERNAL_REQUEST_ATTEMPTED','BROWSER_ASSERTION_FAILED'];
    console.error(JSON.stringify({status:'CHROMIUM_ROLE_DIAGNOSTIC',
     reason:timedOut?'ROLE_BROWSER_AGGREGATE_TIMEOUT':
      reasons.includes(result?.reason)?result.reason:'ROLE_BROWSER_FAILED',
     exitCode:code}));
    return bad(Error('REAL_LOCAL_CHROMIUM_ROLE_WORKFLOW_FAILED'));
   }
   ok(result);
  });
  child.stdin.end(JSON.stringify({ownerCookie,sellerCookie,reviewerCookie}));
 });
 if(report.browserPosts!==5||report.externalRequests!==0||
   report.browserErrors!==0||report.paymentAuthorized!==false)
  fail('ROLE_BROWSER_PROOF_REJECTED');
 console.log(JSON.stringify(report));
}
const path='/__private/attempt/status?quoteId=ciIdentityQuote&quoteVersion=1&operation=create&requestId=ciIdentityRequest';
async function main(){
 port=await unusedPort();
 const origin='https://127.0.0.1:'+port;
 const vars={
  CI_PRIVATE_IDENTITY_OPT_IN:'LOCAL_SYNTHETIC_NO_DEPLOY',
  CI_CONTRACTS_OPT_IN:'LOCAL_CONTRACT_CANDIDATE_ONLY',
  CI_CONTRACT_ROLE_SESSIONS_OPT_IN:'LOCAL_VERIFIED_ROLE_FIXTURE_ONLY',
  CI_PRIVATE_CLAIM_OPT_IN:'LOCAL_CLAIM_NO_PROVIDER_ONLY',
  CI_RECONCILE_OPT_IN:'LOCAL_SANDBOX_GET_FIXTURE_NO_EGRESS',
  CI_PRIVATE_ORIGIN:origin,
  CI_PRIVATE_JWKS:JSON.stringify({keys:[publicJwk]}),
  CI_PRIVATE_SIGNING_JWK:JSON.stringify(privateKey.export({format:'jwk'})),
  CI_PRIVATE_PEPPER:pepper.toString('base64'),
  // Synthetic per-run credential deliberately exercises RFC6749 form
  // encoding in actual workerd; never printed or checked into git.
  CI_PRIVATE_OIDC_SECRET:randomBytes(32).toString('base64url')+" !'()é"
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
  "INSERT INTO quotes(id,owner_id,merchant_id,version,currency,status,approval_actor,approval_version,approval_amount_minor) VALUES('ciIdentityQuote','ciOwner','PAYPALMERCH13',1,'USD','APPROVED','ciOwner',1,250)",
  "INSERT INTO payment_attempts(request_id,quote_id,quote_version,merchant_id,operation,state,amount_minor,currency) VALUES('ciIdentityRequest','ciIdentityQuote',1,'PAYPALMERCH13','create','IN_FLIGHT',250,'USD')",
  // Disposable setup fixture for provider GET proof; not a CREATE or payment.
  "UPDATE payment_attempts SET remote_id='ORDER_FIXTURE_001' WHERE request_id='ciIdentityRequest' AND state='IN_FLIGHT'",
  "INSERT INTO worker_private_oidc_bindings(issuer,subject_hmac,actor_id,merchant_id,role,active) VALUES('"+issuer+"','"+bindingHash+"','ciOwner','PAYPALMERCH13','OWNER',1)"
 ];
 // Only CI has this candidate schema and the three preprovisioned role rows.
 // No public endpoint may register these actors or grant roles.
 statements.push(
  "INSERT INTO worker_contract_memberships(actor_id,merchant_id,role) VALUES('ciOwner','PAYPALMERCH13','BUYER')",
  "INSERT INTO worker_contract_memberships(actor_id,merchant_id,role) VALUES('ciSeller','PAYPALMERCH13','SELLER')",
  "INSERT INTO worker_contract_memberships(actor_id,merchant_id,role) VALUES('ciReviewer','PAYPALMERCH13','REVIEWER')"
 );
 // Test-only operator-provisioned role sessions. No real IdP exchange,
 // external login, public enrollment or role cookie logging.
 const roleSessions=[['SELLER','ciSeller','ci-seller-subject'],
  ['REVIEWER','ciReviewer','ci-reviewer-subject']].map(([role,actor,sub])=>{
  const sep=String.fromCharCode(0);
  const subjectHash=createHmac('sha256',pepper)
   .update('proofline:worker-oidc:v1'+sep+issuer+sep+sub).digest('hex');
  statements.push(
   "INSERT INTO worker_contract_role_bindings(issuer,subject_hmac,actor_id,merchant_id,role) VALUES('"+
    issuer+"','"+subjectHash+"','"+actor+"','PAYPALMERCH13','"+role+"')"
  );
  return {role};
 });
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
 const recent=await request('/__private/attempts?limit=5',{
  cookie:sessionCookie,'sec-fetch-site':'same-origin'
 });
 let listed;try{listed=JSON.parse(recent.body)}catch{fail('D1_RECENT_LIST_JSON_INVALID')}
 // The preceding read-only Worker probe seeds one owner-bound attempt,
 // and this identity probe adds a second one in the SAME disposable local D1.
 // Both must remain visible; never delete the earlier fixture to fake success.
 if(recent.status!==200||!recent.encrypted||listed.count!==2||
    !Array.isArray(listed.attempts)||
    !['ciRequest','ciIdentityRequest'].every(id=>
      listed.attempts.some(item=>item.requestId===id))||
    listed.source!=='D1_LOCAL_METADATA_ONLY'||
    listed.verifiedPayPalGet!==false||listed.paymentAuthorized!==false||
    listed.providerCalls!==0||recent.headers['access-control-allow-origin']!==undefined||
    recent.headers['cache-control']!=='no-store, max-age=0'){
  // Synthetic CI diagnostic only: never echo row content or session material.
  console.error(JSON.stringify({
   status:'LOCAL_RECENT_D1_DIAGNOSTIC',
   httpStatus:recent.status,
   errorCode:['UNAUTHENTICATED','DEPENDENCY_UNAVAILABLE','INVALID_QUERY',
    'NOT_FOUND','ORIGIN_NOT_ALLOWED','CROSS_SITE_BLOCKED'].includes(listed.error)
     ?listed.error:'NONE_OR_UNRECOGNIZED',
   count:Number.isSafeInteger(listed.count)?listed.count:null,
   hasArray:Array.isArray(listed.attempts),
   sourceOK:listed.source==='D1_LOCAL_METADATA_ONLY',
   cacheOK:recent.headers['cache-control']==='no-store, max-age=0',
   paymentProofFalse:listed.paymentAuthorized===false
  }));
  fail('OWNER_SCOPED_WORKER_D1_RECENT_LIST_FAILED');
 }
 // Serve a real same-origin private browser page and its static assets
 // from the same Worker session, without any public route or external calls.
 for(const [asset,type,marker] of [
  ['/__private/attempts/view','text/html','id="rows"'],
  ['/__private/attempts/view.js','text/javascript','void load();'],
  ['/__private/attempts/view.css','text/css','.table-scroll']
 ]){
  const reply=await request(asset,{cookie:sessionCookie,'sec-fetch-site':'same-origin'});
  if(reply.status!==200||!reply.encrypted||
     !reply.headers['content-type']?.startsWith(type)||
     reply.headers['cache-control']!=='no-store, max-age=0'||
     !reply.headers['content-security-policy']?.includes("connect-src 'self'")||
     reply.headers['access-control-allow-origin']!==undefined||
     !reply.body.includes(marker))
   fail('WORKER_PRIVATE_D1_DASHBOARD_ASSET_FAILED');
  if((await request(asset)).status!==401)
   fail('ANONYMOUS_PRIVATE_D1_DASHBOARD_ASSET_ALLOWED');
  if((await request(asset,{cookie:sessionCookie,
    'sec-fetch-site':'cross-site'})).status!==403)
   fail('CROSS_SITE_PRIVATE_D1_DASHBOARD_ASSET_ALLOWED');
 }
 if((await request('/__private/attempts/view',{cookie:sessionCookie},'POST')).status!==405)
  fail('PRIVATE_D1_DASHBOARD_MUTATION_ROUTE_ALLOWED');

 // First genuinely persisted Part1 business mutation in actual local Workerd:
 // authorized owner draft -> unique D1 idempotency -> explicit human USD
 // approval. No synthetic PayPal capture or AI model, no public deployment.
 const draftPath='/__private/quotes',approvalDraft={
  clientRequestId:'0047f90c-96d4-4fca-a28c-f6e9a78fd193',
  scopeText:'Deliver an authenticated freelance client dashboard and provide source code'
 };
 const writeHeaders={cookie:sessionCookie,origin,'sec-fetch-site':'same-origin',
  'content-type':'application/json','x-proofline-intent':'quote-draft'};
 const postDraft=()=>request(draftPath,writeHeaders,'POST',JSON.stringify(approvalDraft));
 if((await request(draftPath)).status!==401)fail('ANONYMOUS_OWNER_D1_QUOTE_ROUTE_ALLOWED');
 const draftCreated=await postDraft();
 let quoteCreated;try{quoteCreated=JSON.parse(draftCreated.body)}catch{fail('OWNER_D1_DRAFT_INVALID_JSON')}
 if(draftCreated.status!==201||!draftCreated.encrypted||
   quoteCreated.quote?.status!=='PROPOSED'||quoteCreated.created!==true||
   quoteCreated.paymentAuthorized!==false||quoteCreated.providerCalls!==0||
   !/^q_[a-f0-9]{32}$/.test(quoteCreated.quote.quoteId??''))
  fail('REAL_WORKERD_D1_DRAFT_CREATE_FAILED');
 const repeat=await postDraft();let replay;
 try{replay=JSON.parse(repeat.body)}catch{fail('OWNER_D1_DRAFT_REPLAY_JSON_INVALID')}
 if(repeat.status!==200||replay.idempotentReplay!==true||
   replay.quote?.quoteId!==quoteCreated.quote.quoteId)
  fail('REAL_WORKERD_D1_DRAFT_IDEMPOTENCY_FAILED');
 const approvalPath=draftPath+'/'+quoteCreated.quote.quoteId+'/approve';
 const approveHeaders={...writeHeaders,'x-proofline-intent':'quote-approve'};
 const approveBody=JSON.stringify({expectedVersion:1,amountMinor:12750});
 if((await request(approvalPath,{...approveHeaders,origin:'https://evil.invalid'},
  'POST',approveBody)).status!==403)fail('CROSS_SITE_D1_QUOTE_APPROVAL_ALLOWED');
 const approved=await request(approvalPath,approveHeaders,'POST',approveBody);
 let confirmed;try{confirmed=JSON.parse(approved.body)}catch{fail('OWNER_D1_APPROVAL_JSON_INVALID')}
 if(approved.status!==200||confirmed.quote?.status!=='APPROVED'||
   confirmed.quote.approvedAmountMinor!==12750||confirmed.humanApproval!==true||
   confirmed.paymentAuthorized!==false||confirmed.providerCalls!==0)
  fail('REAL_WORKERD_D1_HUMAN_APPROVAL_FAILED');
 const listing=await request(draftPath+'?limit=20',{
  cookie:sessionCookie,'sec-fetch-site':'same-origin'
 });
 let saved;try{saved=JSON.parse(listing.body)}catch{fail('OWNER_D1_QUOTES_JSON_INVALID')}
 if(listing.status!==200||saved.source!=='D1_OWNER_QUOTES'||
   !Array.isArray(saved.quotes)||saved.quotes.length!==3||
   !['ciQuote','ciIdentityQuote'].every(id=>saved.quotes.some(q=>q.quoteId===id))||
   !saved.quotes.some(q=>q.quoteId===quoteCreated.quote.quoteId&&q.approvedAmountMinor===12750)||
   saved.paymentAuthorized!==false||saved.providerCalls!==0)
  fail('REAL_WORKERD_D1_QUOTES_LIST_FAILED');
 for(const [asset,type,marker] of [
  ['/__private/quotes/view','text/html','id="draft"'],
  ['/__private/quotes/view.js','text/javascript','crypto.randomUUID()'],
  ['/__private/quotes/view.css','text/css','.quote']
 ]){
  const a=await request(asset,{cookie:sessionCookie,'sec-fetch-site':'same-origin'});
  if(a.status!==200||!a.encrypted||
    !a.headers['content-type']?.startsWith(type)||!a.body.includes(marker))
   fail('REAL_WORKERD_OWNER_QUOTES_UI_ASSET_FAILED');
  if((await request(asset)).status!==401)
   fail('ANONYMOUS_OWNER_QUOTES_UI_ALLOWED');
 }
 console.log(JSON.stringify({status:'LOCAL_WORKERD_REAL_D1_OWNER_QUOTE_HUMAN_APPROVAL_PASS',
  actualLocalWorkerd:true,ownerD1DraftCreated:true,uniqueClientRequestReplaySafe:true,
  approvedExactMinor:12750,ownerBoundQuoteCount:3,sessionAuthenticated:true,
  crossSiteDenied:true,UIAssetsRealHTTPS:true,externalRequests:0,
  actualProviderCalls:0,paymentAuthorized:false,publicDeployment:false}));


 // Owner OIDC session -> server-side BUYER grant -> committed contract+audit.
 // Seller/reviewer have no real role-aware OIDC sessions in this runtime:
 // role transitions MUST remain denied even if owner guesses their IDs.
 const contractsPath='/__private/contracts';
 const contractData={
  quoteId:'ciIdentityQuote',quoteVersion:1,
  sellerId:'ciSeller',reviewerId:'ciReviewer',
  milestoneId:'delivery1',
  milestoneTitle:'Deliver verified technical report and source archive',
  clientRequestId:'ea850c4b-f130-4e5f-a445-5b1d8e0e69b0'
 };
 if((await request(contractsPath)).status!==401)
  fail('ANONYMOUS_D1_CONTRACTS_ALLOWED');
 const contractHeaders={cookie:sessionCookie,origin,'sec-fetch-site':'same-origin',
  'content-type':'application/json','x-proofline-intent':'contract-create'};
 const contractPost=()=>request(contractsPath,contractHeaders,'POST',JSON.stringify(contractData));
 const createdContract=await contractPost();
 let contract;try{contract=JSON.parse(createdContract.body)}catch{fail('D1_CONTRACT_INVALID_JSON')}
 if(createdContract.status!==201||contract.contract?.state!=='PENDING'||
    contract.contract?.amountMinor!==250||contract.created!==true||
    contract.paymentAuthorized!==false||contract.providerCalls!==0){
  // Bounded CI-only diagnostic. No raw response, cookie, actor or D1 rows.
  const codes=['INVALID_CONTRACT','QUOTE_OR_ROLES_NOT_AVAILABLE',
   'D1_CONTRACT_DEPENDENCY_UNAVAILABLE','TRUST_CHANGED',
   'UNAUTHENTICATED_OR_ROLE_UNAVAILABLE','EXPLICIT_WRITE_INTENT_REQUIRED',
   'CONTRACT_IDEMPOTENCY_CONFLICT','DEPENDENCY_UNAVAILABLE'];
  // Check whether D1 persisted the contract despite the failed create reply.
  // Only bounded count and status are emitted; never echo IDs or row content.
  const peek=await request(contractsPath+'?limit=2',{
   cookie:sessionCookie,'sec-fetch-site':'same-origin'
  });
  let peekResult;try{peekResult=JSON.parse(peek.body)}catch{/* bounded status only */}
  console.error(JSON.stringify({status:'LOCAL_CONTRACT_POST_FAILURE_READ',
   httpStatus:peek.status,
   recordCount:Number.isSafeInteger(peekResult?.count)?peekResult.count:null,
   errorClass:['UNAUTHENTICATED_OR_ROLE_UNAVAILABLE',
    'D1_CONTRACT_DEPENDENCY_UNAVAILABLE','TRUST_CHANGED'].includes(peekResult?.error)?
    peekResult.error:'NONE_OR_UNKNOWN'}));
  console.error(JSON.stringify({status:'LOCAL_CONTRACT_CREATE_DIAGNOSTIC',
   httpStatus:createdContract.status,errorCode:codes.includes(contract.error)?
    contract.error:'UNRECOGNIZED',
   stateExpected:contract.contract?.state==='PENDING',
   contractAmountExpected:contract.contract?.amountMinor===250,
   paymentSafety:contract.paymentAuthorized===false}));
  fail('REAL_WORKERD_OWNER_D1_CONTRACT_CREATION_FAILED');
 }
 const replayContract=await contractPost();
 let repeated;try{repeated=JSON.parse(replayContract.body)}catch{fail('CONTRACT_REPLAY_JSON_INVALID')}
 if(replayContract.status!==200||repeated.idempotentReplay!==true||
    repeated.contract?.contractId!==contract.contract.contractId)
  fail('REAL_WORKERD_D1_CONTRACT_REPLAY_FAILED');
 const contractList=await request(contractsPath+'?limit=20',{
  cookie:sessionCookie,'sec-fetch-site':'same-origin'
 });
 let savedContracts;try{savedContracts=JSON.parse(contractList.body)}catch{fail('CONTRACT_LIST_JSON_INVALID')}
 if(contractList.status!==200||savedContracts.count!==1||
    savedContracts.contracts?.[0]?.contractId!==contract.contract.contractId||
    savedContracts.source!=='D1_CONTRACT_CANDIDATE')
  fail('REAL_WORKERD_D1_CONTRACT_LIST_FAILED');
 const sellerPath=contractsPath+'/'+contract.contract.contractId+'/milestones/delivery1/submit';
 if((await request(sellerPath,{cookie:sessionCookie,origin,'sec-fetch-site':'same-origin',
  'content-type':'application/json','x-proofline-intent':'contract-submit'},
  'POST',JSON.stringify({expectedVersion:1,
   eventId:'38f96011-8010-4fe3-9e14-d7452ae724aa',detail:'Cannot impersonate seller'}))).status!==403)
  fail('OWNER_IMPERSONATED_SELLER_D1');
 if((await request(contractsPath,{...contractHeaders,origin:'https://attacker.invalid'},
  'POST',JSON.stringify(contractData))).status!==403)
  fail('CROSS_SITE_CONTRACT_CREATE_ALLOWED');
 console.log(JSON.stringify({status:'LOCAL_WORKERD_D1_OWNER_BUYER_CONTRACT_CREATE_PASS',
  realLocalWorkerd:true,realLocalD1:true,ownerOidcSessionVerified:true,
  buyerMembershipPreprovisioned:true,contractCreated:true,
  idempotentReplayVerified:true,sellerImpersonationDenied:true,
  sellerReviewerRealLoginVerified:false,paymentAuthorized:false,
  actualProviderCalls:0,remoteCloudflareVerified:false}));

 // Each synthetic role must complete a NEW pinned RS256/PKCE callback through
 // actual local Workerd. Do not preinsert bearer sessions in SQL.
 async function syntheticRoleLogin(code){
  const began=await request('/api/auth/oidc/start',{
   origin,'sec-fetch-site':'same-origin'
  },'POST');
  if(began.status!==303)fail('ROLE_PKCE_CHALLENGE_UNAVAILABLE');
  const uri=new URL(began.headers.location);
  const state=uri.searchParams.get('state');
  const temporary=began.headers['set-cookie']??[];
  if(uri.origin!==issuer||uri.pathname!=='/authorize'||
     !/^[A-Za-z0-9_-]{43}$/.test(state??'')||
     !Array.isArray(temporary)||temporary.length!==2)
   fail('ROLE_PKCE_STATE_INVALID');
  const cookie=temporary.map(x=>x.split(';')[0]).join('; ');
  const completed=await request('/api/auth/oidc/callback?code='+code+
   '&state='+state,{cookie,'sec-fetch-site':'cross-site'});
  const setCookies=completed.headers['set-cookie']??[];
  const issued=Array.isArray(setCookies)?
   setCookies.find(x=>/^__Host-proofline_contract_role=[A-Za-z0-9_-]{43}; Secure; HttpOnly/.test(x)):null;
  if(completed.status!==200||!issued)
   fail('ROLE_SIGNED_PKCE_CALLBACK_FAILED');
  return issued.split(';')[0].split('=')[1];
 }
 const roleCookies={
  SELLER:await syntheticRoleLogin('CI_ONE_TIME_SIGNED_SELLER_CODE'),
  REVIEWER:await syntheticRoleLogin('CI_ONE_TIME_SIGNED_REVIEWER_CODE')
 };
 const roleCookie=role=>roleCookies[role];
 async function transition(role,action,version,eventId,detail,expectedState){
  const path=contractsPath+'/'+contract.contract.contractId+'/milestones/delivery1/'+action;
  const res=await request(path,{
   cookie:'__Host-proofline_contract_role='+roleCookie(role),
   origin,'sec-fetch-site':'same-origin','content-type':'application/json',
   'x-proofline-intent':'contract-'+action
  },'POST',JSON.stringify({expectedVersion:version,eventId,detail}));
  let payload;try{payload=JSON.parse(res.body)}catch{fail('CONTRACT_ROLE_BAD_JSON')}
  if(res.status!==200||payload.contract?.state!==expectedState||
     payload.contract.version!==version+1||payload.paymentAuthorized!==false||
     payload.providerCalls!==0)fail('REAL_WORKERD_D1_ROLE_TRANSITION_'+action.toUpperCase()+'_FAILED');
 }
 await transition('SELLER','submit',1,
  '38f96011-8010-4fe3-9e14-d7452ae724aa','Submitted signed local evidence','SUBMITTED');
 await transition('REVIEWER','reject',2,
  '38f96011-8010-4fe3-9e14-d7452ae724ab','Checklist requires correction','REJECTED');
 await transition('SELLER','submit',3,
  '38f96011-8010-4fe3-9e14-d7452ae724ac','Updated checklist and archive','SUBMITTED');
 await transition('REVIEWER','accept',4,
  '38f96011-8010-4fe3-9e14-d7452ae724ad','Verified final evidence','ACCEPTED');
 const roleOnly=await request('/__private/quotes?limit=5',{
  cookie:'__Host-proofline_contract_role='+roleCookie('SELLER'),
  'sec-fetch-site':'same-origin'});
 if(roleOnly.status!==401)fail('SELLER_ROLE_ENTERED_OWNER_QUOTES');
 const ownerAndRole=await request('/__private/contracts',{
  cookie:sessionCookie+'; __Host-proofline_contract_role='+roleCookie('SELLER'),
  'sec-fetch-site':'same-origin'});
 if(ownerAndRole.status!==401)fail('AMBIGUOUS_ROLE_COOKIES_ACCEPTED');
 // Real Chromium exercises buyer contract CREATE and all four
 // seller/reviewer state transitions with a second approved synthetic quote.
 await browserRoleVerify(origin,sessionCookie.split('=')[1],
  roleCookie('SELLER'),roleCookie('REVIEWER'));
 const roleLogout=await request('/api/auth/oidc/logout',{
  cookie:'__Host-proofline_contract_role='+roleCookie('SELLER'),
  origin,'sec-fetch-site':'same-origin'
 },'POST');
 if(roleLogout.status!==200||(roleLogout.headers['set-cookie']??[])
   .every(x=>!x.includes('__Host-proofline_contract_role=;')))
  fail('SIGNED_ROLE_LOGOUT_FAILED');
 if((await request('/__private/contracts',{
  cookie:'__Host-proofline_contract_role='+roleCookie('SELLER')
 })).status!==401)fail('SIGNED_ROLE_COOKIE_REUSED');
 console.log(JSON.stringify({
  status:'LOCAL_WORKERD_D1_SYNTHETIC_ROLE_MILESTONES_PASS',
  localWorkerd:true,localD1:true,contractFinalState:'ACCEPTED',
  verifiedTransitions:4,d1PersistedEvents:5,
  localSignedRS256PkceRoleLogins:2,
  ownerAndRoleCookieMixDenied:true,ownerQuotesDeniedToSeller:true,
  realSellerReviewerOidcVerified:false,paymentAuthorized:false,providerCalls:0
 }));
 await browserVerify('active',origin,sessionCookie);
 if((await request('/__private/attempts?limit=5')).status!==401)
  fail('ANONYMOUS_RECENT_LIST_ALLOWED');
 if((await request('/__private/attempts?limit=0',{cookie:sessionCookie})).status!==400)
  fail('UNBOUNDED_RECENT_LIST_ALLOWED');
 if((await request('/__private/attempts',{cookie:sessionCookie,
  'sec-fetch-site':'cross-site'})).status!==403)
  fail('CROSS_SITE_RECENT_LIST_ALLOWED');
 if((await request(path,{cookie:sessionCookie,'sec-fetch-site':'cross-site'})).status!==403)
  fail('CROSS_SITE_WORKER_READ_ALLOWED');
 if((await request(path,{cookie:sessionCookie},'POST')).status!==405)
  fail('WORKER_PAYMENT_METADATA_POST_ALLOWED');
 // Even a signed OWNER session cannot trigger PayPal OAuth or Orders GET
 // until a separate operator opts in BOTH host flags and pins merchant identity.
 // This local CI Worker deliberately has neither permission nor credentials.
 const darkProof=await request('/__private/paypal/order-proof',{
  cookie:sessionCookie,origin,'sec-fetch-site':'same-origin',
  'content-type':'application/json',
  'x-proofline-intent':'sandbox-order-get-only'
 },'POST',JSON.stringify({quoteId:'ciIdentityQuote',quoteVersion:1}));
 if(darkProof.status!==404)fail('UNAPPROVED_SANDBOX_GET_ROUTE_ACTIVATED');
 if((await request('/api/paypal/capture',{cookie:sessionCookie,origin},'POST')).status!==404)
  fail('WORKER_PAYMENT_MUTATION_ROUTE_EXPOSED');

 // CI-only real Workerd/SQLite: OIDC OWNER -> human-approved D1 quote ->
 // authenticated first claim -> duplicate denial -> recovery/audit timeline.
 // This proves no provider creates, captures or real PayPal authorization.
 const claimPath='/__private/paypal/create-claim';
 const claimBody=JSON.stringify({
  requestId:'ciClaimFirst',quoteId:quoteCreated.quote.quoteId,quoteVersion:1
 });
 const claimHeaders={cookie:sessionCookie,origin,'sec-fetch-site':'same-origin',
  'content-type':'application/json','x-proofline-intent':'first-claim-no-provider'};
 if((await request(claimPath)).status!==405||
    (await request(claimPath,claimHeaders,'GET')).status!==405||
    (await request(claimPath,{...claimHeaders,origin:'https://evil.invalid'},
     'POST',claimBody)).status!==403||
    (await request(claimPath,{...claimHeaders,'sec-fetch-site':'cross-site'},
     'POST',claimBody)).status!==403||
    (await request(claimPath,{...claimHeaders,'x-proofline-intent':'capture'},
     'POST',claimBody)).status!==403||
    (await request(claimPath,{...claimHeaders,
      cookie:sessionCookie+'; __Host-proofline_contract_role='+roleCookie('REVIEWER')},
     'POST',claimBody)).status!==401)
  fail('LOCAL_WORKERD_PAYMENT_CLAIM_BYPASS_ALLOWED');
 const firstClaim=await request(claimPath,claimHeaders,'POST',claimBody);
 let claim;try{claim=JSON.parse(firstClaim.body)}catch{fail('LOCAL_CLAIM_JSON_INVALID')}
 if(firstClaim.status!==201||!firstClaim.encrypted||
    claim.status!=='IN_FLIGHT'||claim.claimed!==true||
    claim.remoteOrderCreated!==false||claim.paymentAuthorized!==false||
    claim.providerCalls!==0||claim.captureAuthorized!==false){
  // Bound diagnostic: never echo cookies, SQL, quote or provider data.
  const allowed=['OWNER_SESSION_REQUIRED','CLAIM_NOT_AVAILABLE',
   'D1_UNAVAILABLE_NO_RETRY','INVALID_BODY','OWNER_SESSION_CHANGED_NO_RETRY'];
  console.error(JSON.stringify({status:'LOCAL_CLAIM_DIAGNOSTIC',
   httpStatus:firstClaim.status,
   reason:allowed.includes(claim.error)?claim.error:'UNKNOWN',
   claimed:claim.claimed===true,reportedState:claim.status==='IN_FLIGHT'?'IN_FLIGHT':'OTHER'}));
  fail('LOCAL_OWNER_WORKER_D1_FIRST_CLAIM_FAILED');
 }
 const repeatClaim=await request(claimPath,claimHeaders,'POST',claimBody);
 let repeatClaimJson;try{repeatClaimJson=JSON.parse(repeatClaim.body)}
 catch{fail('LOCAL_CLAIM_REPLAY_JSON_INVALID')}
 if(repeatClaim.status!==409||repeatClaimJson.claimed!==false||
    repeatClaimJson.providerCalls!==0)
  fail('LOCAL_D1_DUPLICATE_CLAIM_NOT_BLOCKED');
 const recoveryPath='/__private/paypal/claim-recovery';
 const recovery=await request(recoveryPath,{
  ...claimHeaders,'x-proofline-intent':'inspect-recovery-only'},'POST',claimBody);
 let recoveryJson;try{recoveryJson=JSON.parse(recovery.body)}
 catch{fail('LOCAL_CLAIM_RECOVERY_JSON_INVALID')}
 if(recovery.status!==200||recoveryJson.status!=='IN_FLIGHT'||
    recoveryJson.next!=='IN_FLIGHT_DO_NOT_RETRY'||
    recoveryJson.remoteIdKnown!==false||
    recoveryJson.providerCalls!==0)
  fail('LOCAL_D1_RECOVERY_NOT_READ_ONLY');
 const auditPath='/__private/paypal/claim-audit';
 const audit=await request(auditPath,{
  ...claimHeaders,'x-proofline-intent':'read-audit-only'},'POST',claimBody);
 let auditJson;try{auditJson=JSON.parse(audit.body)}
 catch{fail('LOCAL_CLAIM_AUDIT_JSON_INVALID')}
 if(audit.status!==200||auditJson.status!=='AUDIT_READ_ONLY'||
    auditJson.events?.length!==1||auditJson.events[0].eventType!=='CLAIM_CREATED'||
    auditJson.events[0].toState!=='IN_FLIGHT'||
    auditJson.events[0].remoteOrderKnown!==false||auditJson.hasMore!==false||
    auditJson.providerCalls!==0||auditJson.paymentAuthorized!==false||
    audit.body.includes('remote_id')||audit.body.includes('access_token'))
  fail('LOCAL_D1_AUDIT_NOT_OWNER_SAFE');
 console.log(JSON.stringify({status:'LOCAL_WORKERD_D1_OWNER_CLAIM_RECOVERY_AUDIT_PASS',
  workerd:true,realLocalD1:true,ownerSession:true,firstClaim:true,
  duplicateBlocked:true,recoveryReadOnly:true,auditRows:1,
  crossOriginDenied:true,crossSiteDenied:true,roleMixDenied:true,
  paymentPosts:0,providerCalls:0,realPaymentAuthorized:false,
  remoteCloudflareVerified:false,productionDeployed:false}));

 // Test the existing disabled-by-default reconciliation through REAL local
 // Workerd HTTPS and D1, but with an in-process pinned GET fixture: no egress.
 const reconcilePath='/__private/paypal/reconcile-approved';
 const reconcileBody=JSON.stringify({
  requestId:'ciIdentityRequest',quoteId:'ciIdentityQuote',quoteVersion:1
 });
 const reconcileHeaders={cookie:sessionCookie,origin,'sec-fetch-site':'same-origin',
  'content-type':'application/json',
  'x-proofline-intent':'sandbox-get-approved-reconcile-only'};
 if((await request(reconcilePath)).status!==405||
    (await request(reconcilePath,reconcileHeaders,'GET')).status!==405||
    (await request(reconcilePath,{...reconcileHeaders,origin:'https://evil.invalid'},
     'POST',reconcileBody)).status!==403||
    (await request(reconcilePath,{...reconcileHeaders,'sec-fetch-site':'cross-site'},
     'POST',reconcileBody)).status!==403||
    (await request(reconcilePath,{...reconcileHeaders,
      cookie:sessionCookie+'; __Host-proofline_contract_role='+roleCookie('REVIEWER')},
     'POST',reconcileBody)).status!==401)
  fail('LOCAL_RECONCILE_UNAUTHORIZED_HTTP_ALLOWED');
 const mismatched=await request(reconcilePath,reconcileHeaders,'POST',
  JSON.stringify({requestId:'ciIdentityRequest',quoteId:'ciIdentityQuote',quoteVersion:2}));
 if(mismatched.status!==409)
  fail('LOCAL_RECONCILE_WRONG_VERSION_ALLOWED');
 const reconcileApproved=await request(reconcilePath,reconcileHeaders,'POST',reconcileBody);
 let confirmedOrder;try{confirmedOrder=JSON.parse(reconcileApproved.body)}
 catch{fail('LOCAL_RECONCILE_JSON_INVALID')}
 if(reconcileApproved.status!==200||!reconcileApproved.encrypted||
    confirmedOrder.status!=='APPROVED_GET_RECONCILED_NO_CAPTURE'||
    confirmedOrder.ledgerState!=='APPROVED'||
    confirmedOrder.providerGetInvoked!==true||confirmedOrder.ledgerWrites!==1||
    confirmedOrder.paymentAuthorized!==false||
    confirmedOrder.captureAuthorized!==false||
    confirmedOrder.paymentPosts!==0||
    confirmedOrder.providerReceiptIsPaymentAuthorization!==false)
  fail('LOCAL_WORKERD_D1_RECONCILE_APPROVED_FAILED');
 const replayApproval=await request(reconcilePath,reconcileHeaders,'POST',reconcileBody);
 if(replayApproval.status!==409)fail('LOCAL_RECONCILE_REPLAY_ALLOWED');
 const afterApproved=await request(path,{cookie:sessionCookie,'sec-fetch-site':'same-origin'});
 let approvedRow;try{approvedRow=JSON.parse(afterApproved.body)}
 catch{fail('LOCAL_RECONCILE_ROW_INVALID')}
 if(afterApproved.status!==200||approvedRow.state!=='APPROVED'||
    approvedRow.paymentAuthorized!==false||approvedRow.providerCalls!==0)
  fail('LOCAL_D1_RECONCILE_STATE_NOT_PERSISTED');
 console.log(JSON.stringify({status:'LOCAL_WORKERD_D1_SYNTHETIC_PINNED_GET_APPROVAL_PASS',
  realLocalWorkerd:true,realLocalD1:true,syntheticGetOnly:true,
  verifiedMerchantAmountQuoteAndOrder:true,approvedRecorded:true,
  conflictingVersionDenied:true,duplicateDenied:true,
  externalProviderNetworkCalls:0,postCaptureCount:0,
  paymentAuthorized:false,productionDeployed:false}));
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
 if((await request(claimPath,claimHeaders,'POST',claimBody)).status!==401)
  fail('REVOKED_OWNER_CLAIM_ALLOWED');
 if((await request(reconcilePath,reconcileHeaders,'POST',reconcileBody)).status!==401)
  fail('REVOKED_OWNER_RECONCILE_ALLOWED');
 if((await request('/__private/attempts/view',{cookie:sessionCookie})).status!==401)
  fail('REVOKED_PRIVATE_D1_DASHBOARD_COOKIE_REUSED');
 if((await request('/__private/quotes/view',{cookie:sessionCookie})).status!==401)
  fail('REVOKED_PRIVATE_OWNER_QUOTES_COOKIE_REUSED');
 await browserVerify('revoked',origin,sessionCookie);
 if((await request(callback,{cookie:loginCookie})).status!==401)
  fail('PKCE_CALLBACK_REPLAY_ACCEPTED');
 console.log(JSON.stringify({
  status:'ACTUAL_LOCAL_WORKERD_PKCE_RSA_D1_LOGIN_READ_REVOKE_PASS',
  realWorkerdHttps:true,localTls:true,realLocalD1:true,pinnedRS256:true,
  s256Pkce:true,duplicateCallbackBlocked:true,sessionRevoked:true,
  unauthorizedPaymentRoutesBlocked:true,ownerScopedRecentList:true,
  privateOwnerDashboardAssets:true,realLocalChromiumOwnerDashboard:true,
  revokedChromiumSessionBlocked:true,syntheticIdpOnly:true,
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
