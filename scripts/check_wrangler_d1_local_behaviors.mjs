// Test-only: real Wrangler --local D1 engine, disposable data and account-free.
// Refuses operation outside a bounded GitHub Actions ephemeral environment.
// Never uses --remote, Cloudflare credentials, source DBs, payments or provider APIs.
import {spawnSync} from 'node:child_process';
import {existsSync,realpathSync} from 'node:fs';
import {resolve,sep} from 'node:path';

const fail=(code)=>{console.error(code);process.exit(2)};
const dir=process.env.RUNNER_TEMP;
if(process.env.GITHUB_ACTIONS!=='true'||!dir||
   process.env.CLOUDFLARE_API_TOKEN!==''||
   process.env.WRANGLER_SEND_METRICS!=='false'||
   !existsSync('.wrangler-d1-local-ci.json'))fail('LOCAL_D1_CI_BOUNDARY_REQUIRED');
const persist=resolve(dir,'paypal-d1-local-only');
const parent=realpathSync(dir);
if(!existsSync(persist)||!realpathSync(persist).startsWith(parent+sep))
 fail('LOCAL_D1_STATE_OUTSIDE_RUNNER_TEMP');
const config=JSON.parse(await (await import('node:fs/promises'))
 .readFile('.wrangler-d1-local-ci.json','utf8'));
const binding=config.d1_databases?.[0];
if(config.d1_databases?.length!==1||binding?.binding!=='DB'||
   binding?.database_id!=='00000000-0000-4000-8000-000000000001'||
   binding?.migrations_dir!=='migrations/d1')
 fail('LOCAL_D1_CONFIG_UNEXPECTED');

const offlineEnv={...process.env,CLOUDFLARE_API_TOKEN:'',CLOUDFLARE_ACCOUNT_ID:'',
 WRANGLER_SEND_METRICS:'false'};
let checks=0;
function query(sql,{blocked=null}={}){
 // Only static SQL literals in this local test; npx receives argv, no shell.
 const args=['--yes','wrangler@4.156.0','d1','execute','DB','--local',
  '--config','.wrangler-d1-local-ci.json','--persist-to',persist,
  '--command',sql,'--json'];
 const r=spawnSync('npx',args,{cwd:process.cwd(),env:offlineEnv,
  encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
 if(r.error)fail('LOCAL_D1_EXEC_ERROR:'+r.error.code);
 const output=r.stdout+'\n'+r.stderr;
 if(blocked!==null){
  if(r.status===0||!output.includes(blocked))
   fail('LOCAL_D1_GUARD_NOT_ENFORCED:'+blocked);
  checks++;return null;
 }
 if(r.status!==0)fail('LOCAL_D1_SQL_UNEXPECTED_FAILURE');
 let json;
 try{json=JSON.parse(r.stdout)}catch{fail('LOCAL_D1_JSON_INVALID')}
 checks++;
 return json;
}
function hasRow(json,predicate){
 const visit=x=>{
  if(x&&typeof x==='object'){
   if(predicate(x))return true;
   return Object.values(x).some(visit);
  }
  return false;
 };
 return visit(json);
}
const H='a'.repeat(64),S1='b'.repeat(64),S2='c'.repeat(64),A='d'.repeat(64);
const claimRow=`('request_first','quote_local',1,'merchant_local','create','IN_FLIGHT',150,'USD')`;
query("INSERT INTO quotes (id,owner_id,merchant_id,version,currency,status,approval_actor,approval_version,approval_amount_minor) VALUES ('quote_local','owner_local','merchant_local',1,'USD','APPROVED','owner_local',1,150)");
query("INSERT INTO payment_attempts(request_id,quote_id,quote_version,merchant_id,operation,state,amount_minor,currency) VALUES "+claimRow);
query("UPDATE quotes SET version=2 WHERE id='quote_local'",{blocked:'CLAIMED_QUOTE_IMMUTABLE'});
query("DELETE FROM quotes WHERE id='quote_local'",{blocked:'CLAIMED_QUOTE_IMMUTABLE'});
query("INSERT INTO payment_attempts(request_id,quote_id,quote_version,merchant_id,operation,state,amount_minor,currency) VALUES ('request_second','quote_local',1,'merchant_local','create','IN_FLIGHT',150,'USD')",
 {blocked:'UNIQUE constraint failed'});
query(`INSERT INTO worker_private_oidc_bindings(issuer,subject_hmac,actor_id,merchant_id,role,active) VALUES('https://idp.local.invalid','${H}','owner_local','merchant_local','OWNER',1)`);
query(`INSERT INTO worker_private_sessions(token_sha256,actor_id,merchant_id,role,issuer,issuer_verified_at_ms,expires_at_ms,assertion_sha256,binding_subject_hmac,binding_revision) VALUES('${S1}','owner_local','merchant_local','OWNER','https://idp.local.invalid',1000,900000,'${A}','${H}',1)`);
query(`INSERT INTO worker_private_sessions(token_sha256,actor_id,merchant_id,role,issuer,issuer_verified_at_ms,expires_at_ms,assertion_sha256,binding_subject_hmac,binding_revision) VALUES('${S2}','owner_local','merchant_local','OWNER','https://idp.local.invalid',1000,900000,'${A}','${H}',1)`,
 {blocked:'UNIQUE constraint failed'});
query(`UPDATE worker_private_oidc_bindings SET active=0 WHERE subject_hmac='${H}'`);
const state=query(`SELECT b.active,b.revision,s.binding_revision,COUNT(*) AS sessions
 FROM worker_private_oidc_bindings b JOIN worker_private_sessions s
 ON b.issuer=s.issuer AND b.subject_hmac=s.binding_subject_hmac
 WHERE b.subject_hmac='${H}' GROUP BY b.active,b.revision,s.binding_revision`);
if(!hasRow(state,v=>Number(v.active)===0&&Number(v.revision)===2&&
  Number(v.binding_revision)===1&&Number(v.sessions)===1))
 fail('LOCAL_D1_REVOKED_BINDING_GENERATION_NOT_ENFORCED');
query(`UPDATE worker_private_oidc_bindings SET revision=99 WHERE subject_hmac='${H}'`,
 {blocked:'OIDC_BINDING_REVISION_NOT_MONOTONIC'});
query(`DELETE FROM worker_private_oidc_bindings WHERE subject_hmac='${H}'`,
 {blocked:'OIDC_BINDING_MUST_BE_REVOKED'});
const final=query("SELECT (SELECT COUNT(*) FROM quotes) AS quotes, (SELECT COUNT(*) FROM payment_attempts) AS attempts, (SELECT COUNT(*) FROM worker_private_sessions) AS sessions");
if(!hasRow(final,v=>Number(v.quotes)===1&&Number(v.attempts)===1&&Number(v.sessions)===1))
 fail('LOCAL_D1_NEGATIVE_OPERATIONS_MUTATED_ROWS');
console.log(JSON.stringify({
 status:'WRANGLER_LOCAL_D1_SECURITY_BEHAVIOR_PASS',checks,
 denied:'quote-change,quote-delete,duplicate-claim,assertion-replay,revision-forge,binding-delete',
 verified:'revocation-generation-increment-and-stale-session-rejection-condition',
 realCloudflareD1Verified:false,providerCalls:0,paymentAuthorized:false,
 releaseAuthorized:false
}));
