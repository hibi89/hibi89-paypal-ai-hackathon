// Owner-operated Cloudflare D1 isolation gate. NO network in default mode.
// Only create an automatically named new Free D1, then separately and explicitly
// migrate that same UUID. Never accepts a preexisting production DB name.
// This script is not a hosted Worker or a substitute for login/owner approval.
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {existsSync,mkdtempSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

const expected=Object.freeze([
 '0001_payment_claims.sql','0002_worker_private_sessions.sql',
 '0003_worker_private_oidc.sql','0004_worker_private_binding_epoch.sql'
]);
const PREFIX='proofline-d1-isolated-';
const VERSION='4.156.0';
const bad=code=>{throw new Error(code)};
export function assertMigrationDirectory(root){
 const dir=resolve(root,'migrations','d1');
 const files=readdirSync(dir).filter(x=>x.endsWith('.sql')).sort();
 if(JSON.stringify(files)!==JSON.stringify([...expected].sort())||
    !existsSync(resolve(root,'scripts','restore_quarantine_private_sessions.sql')))
  bad('MIGRATION_DIRECTORY_NOT_EXACTLY_FOUR_SAFE_FILES');
 return files;
}
export function parseDatabases(value){
 let v=value;
 if(typeof v==='string'){try{v=JSON.parse(v)}catch{bad('D1_LIST_NOT_JSON')}}
 if(!Array.isArray(v)&&Array.isArray(v?.result))v=v.result;
 if(!Array.isArray(v)||!v.every(x=>x&&typeof x.name==='string'&&
   typeof (x.uuid??x.id)==='string'))bad('D1_LIST_UNRECOGNIZED');
 return v.map(x=>({name:x.name,uuid:x.uuid??x.id}));
}
export function checkUniqueNewDatabase(list,name,uuid){
 if(!/^proofline-d1-isolated-[a-f0-9]{16}$/.test(name)||
    !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(uuid))
  bad('UNSAFE_DATABASE_IDENTITY');
 const matched=list.filter(x=>x.name===name&&x.uuid.toLowerCase()===uuid.toLowerCase());
 if(matched.length!==1||list.some(x=>(x.name===name)!==(x.uuid.toLowerCase()===uuid.toLowerCase())))
  bad('D1_DATABASE_NAME_UUID_MISMATCH');
 return true;
}
export function validateArguments(args){
 if(args.length===0||args.length===1&&args[0]==='--plan')
  return {mode:'plan'};
 if(args.length===2&&args[0]==='--create-isolated'&&args[1]==='--free-confirmed')
  return {mode:'create'};
 if(args.length===4&&args[0]==='--apply-isolated'&&args[3]==='--free-confirmed')
  return {mode:'apply',name:args[1],uuid:args[2]};
 bad('EXPLICIT_OWNER_MODE_AND_FREE_TIER_REQUIRED');
}
const root=resolve(new URL('..',import.meta.url).pathname);
function tool(args){
 // argv vector, never a shell. stdout and stderr are intentionally not
 // forwarded; Wrangler may print account data, but this script reports only
 // bounded identifiers, counts and reason codes.
 const r=spawnSync('npx',['--yes','wrangler@'+VERSION,...args],{
  cwd:root,encoding:'utf8',timeout:60_000,maxBuffer:2_000_000,
  env:{...process.env,WRANGLER_SEND_METRICS:'false'}
 });
 if(r.error||r.status!==0)bad('WRANGLER_OPERATION_FAILED_STOP_NO_RETRY');
 return r.stdout;
}
function listRemote(){
 return parseDatabases(tool(['d1','list','--json']));
}
function findRow(data,match){
 if(!data||typeof data!=='object')return false;
 if(match(data))return true;
 return Object.values(data).some(x=>findRow(x,match));
}
function query(name,config,sql){
 let data;
 try{data=JSON.parse(tool(['d1','execute',name,'--remote','--config',config,
   '--command',sql,'--json']))}
 catch{bad('REMOTE_D1_QUERY_UNAVAILABLE')}
 return data;
}
function report(obj){console.log(JSON.stringify(obj))}
async function main(args){
 const parsed=validateArguments(args);
 const files=assertMigrationDirectory(root);
 if(parsed.mode==='plan'){
  report({status:'LOCAL_PLAN_ONLY_NO_ACCOUNT_CALLS',files,
    wranglerVersion:VERSION,remoteD1Verified:false,releaseAuthorized:false});
  return;
 }
 // An operator must have authenticated Wrangler in their own trusted shell.
 // Never copy Cloudflare credentials into GitHub, ChatGPT or CI.
 const before=listRemote();
 if(parsed.mode==='create'){
  // Cloudflare Workers Free currently permits at most 10 D1 databases.
  // The caller must have confirmed actual Free billing tier separately.
  if(before.length>=10)bad('FREE_D1_CAPACITY_NOT_CONFIRMED');
  const name=PREFIX+randomBytes(8).toString('hex');
  if(before.some(x=>x.name===name))bad('D1_NAME_COLLISION');
  // A new isolated DB only, without --update-config or Worker deployment.
  tool(['d1','create',name]);
  const after=listRemote();
  const created=after.filter(x=>x.name===name);
  if(created.length!==1)bad('CREATE_RESULT_NOT_CONFIRMABLE_NO_RETRY');
  checkUniqueNewDatabase(after,name,created[0].uuid);
  report({status:'NEW_ISOLATED_REMOTE_D1_CREATED_NO_MIGRATIONS',name,
    databaseId:created[0].uuid,sourceDatabaseCount:before.length,
    permissionToUseExistingDb:false,paidTierAssumed:false,
    instructions:'Record this exact name+UUID privately; then use --apply-isolated NAME UUID --free-confirmed',
    releaseAuthorized:false});
  return;
 }
 checkUniqueNewDatabase(before,parsed.name,parsed.uuid);
 // Run only against a never-migrated EMPTY DB. Even if someone copied the
 // exact name and UUID, existing application tables fail this gate.
 const work=mkdtempSync(join(tmpdir(),'paypal-d1-owner-only-'));
 const config=join(work,'wrangler.json');
 try{
  writeFileSync(config,JSON.stringify({name:'proofline-isolated-schema-check',
   compatibility_date:'2026-10-01',d1_databases:[{binding:'DB',
    database_name:parsed.name,database_id:parsed.uuid,
    migrations_dir:'migrations/d1'}]}),{mode:0o600,flag:'wx'});
  const empty=query(parsed.name,config,
   "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  if(!findRow(empty,x=>Number(x.n)===0))bad('REMOTE_D1_NOT_EMPTY_STOP');
  const pending=tool(['d1','migrations','list',parsed.name,'--remote','--config',config]);
  if(!expected.every(name=>pending.includes(name)))bad('REMOTE_D1_MIGRATIONS_UNEXPECTED');
  // One approved migration attempt. GitHub Actions CI=1 skips interactive
  // migration prompts and Cloudflare captures a migration backup.
  try{
   const p=spawnSync('npx',['--yes','wrangler@'+VERSION,'d1','migrations',
     'apply',parsed.name,'--remote','--config',config],{
     cwd:root,encoding:'utf8',timeout:90_000,maxBuffer:2_000_000,
     env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'}
   });
   if(p.error||p.status!==0)bad('REMOTE_MIGRATION_FAILED_PARTIAL_STATE_POSSIBLE_NO_RETRY');
  }catch{bad('REMOTE_MIGRATION_FAILED_PARTIAL_STATE_POSSIBLE_NO_RETRY')}
  const result=query(parsed.name,config,
   "SELECT (SELECT COUNT(*) FROM d1_migrations) AS applied, (SELECT COUNT(*) FROM sqlite_master WHERE type='trigger') AS guards, (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='worker_private_oidc_bindings') AS bindings");
  const integrity=query(parsed.name,config,'PRAGMA quick_check');
  if(!findRow(result,x=>Number(x.applied)===4&&Number(x.guards)===6&&Number(x.bindings)===1)||
     !findRow(integrity,x=>x.quick_check==='ok'))
   bad('REMOTE_D1_SCHEMA_VERIFICATION_BLOCKED_NO_RETRY');
  report({status:'ISOLATED_REMOTE_D1_MIGRATIONS_VERIFIED',name:parsed.name,
   databaseId:parsed.uuid,applied:4,triggers:6,quickCheck:'ok',
   actualWorkerRuntimeVerified:false,restorePerformed:false,
   paymentAuthorized:false,releaseAuthorized:false});
 }finally{rmSync(work,{recursive:true,force:true})}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main(process.argv.slice(2)).catch(e=>{
  console.error(JSON.stringify({status:'BLOCKED_NO_RETRY',reason:e.message,
   releaseAuthorized:false}));process.exitCode=2;
 });
}
