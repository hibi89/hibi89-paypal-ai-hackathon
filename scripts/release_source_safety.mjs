// Offline release preflight for Git-tracked source only. Never prints scanned values.
// This is a bounded high-confidence leak-pattern check, not a credential audit service.
import {readFileSync, lstatSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve, relative, isAbsolute, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(fileURLToPath(new URL('../',import.meta.url)));
const BLOCKED_NAME=/(?:^|\/)(?:\.env(?:\.(?!example$)[^\/]*)?|[^\/]+\.(?:sqlite|db|pem|p12|pfx|key|webm|mp4|wav|zip|sqlite-wal|sqlite-shm)|node_modules)(?:\/|$)/i;
const SECRET_PATTERNS=Object.freeze([
 ['PRIVATE_KEY_PEM', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
 ['GITHUB_TOKEN', /(?:github_pat_[A-Za-z0-9_]{30,}|gh[pousr]_[A-Za-z0-9]{25,})/],
 ['GOOGLE_API_KEY', /AIza[0-9A-Za-z_-]{35}/],
 ['AWS_ACCESS_KEY', /(?:AKIA|ASIA)[A-Z0-9]{16}/],
 ['STRIPE_SECRET', /sk_live_[A-Za-z0-9]{24,}/],
 ['NPM_TOKEN', /npm_[A-Za-z0-9]{25,}/],
 ['SLACK_TOKEN', /xox[baprs]-[A-Za-z0-9-]{18,}/],
 ['BEARER_CREDENTIAL', /\bBearer\s+[A-Za-z0-9._~+/=-]{48,}/],
]);
const LITERAL_SECRET=/(?:PAYPAL_SANDBOX_CLIENT_SECRET|PAYPAL_CLIENT_SECRET|GEMINI_API_KEY|GOOGLE_API_KEY|OPENAI_API_KEY|AWS_SECRET_ACCESS_KEY)\s*[:=]\s*(['"])([^'"\r\n]{18,})\1/gi;
const KNOWN_FAKE=/(?:FAKE|TEST|MOCK|DUMMY|SENTINEL|PLACEHOLDER|YOUR_|EXAMPLE|NOT_REAL|REDACTED|DO_NOT_PRINT|<[^>]+>)/i;
// Historical tests use conspicuously fake private/never-print strings. Scope the
// extra exemption strictly to tests; production code must still fail closed.
const TEST_ONLY_FAKE=/(?:NEVER_|PRIVATE_)/i;

function validPath(root, name) {
 if(typeof name!=='string'||name.length===0||name.includes('\\')||name.includes('\0')||isAbsolute(name))return null;
 const p=resolve(root,name),r=relative(root,p);
 if(r.startsWith('..'+sep)||r==='..'||isAbsolute(r)||r==='')return null;
 return p;
}
export function evaluateTrackedSource(root,trackedFiles){
 if(!Array.isArray(trackedFiles)||trackedFiles.length===0)return Object.freeze({
  status:'RELEASE_SOURCE_SCAN_BLOCKED',reason:'NO_TRACKED_FILES',filesScanned:0,findings:[]
 });
 const findings=[];let scanned=0;let bytes=0;
 for(const name of [...new Set(trackedFiles)].sort()){
  const full=validPath(root,name);
  if(!full){findings.push({path:'[INVALID_PATH]',code:'UNSAFE_TRACKED_PATH'});continue;}
  if(BLOCKED_NAME.test(name)){
    findings.push({path:name,code:'RESTRICTED_FILE_NAME'});continue;
  }
  try{
   const st=lstatSync(full);
   if(!st.isFile()||st.isSymbolicLink()||st.size>2*1024*1024){
    findings.push({path:name,code:'UNSAFE_OR_LARGE_SOURCE_FILE'});continue;
   }
   const raw=readFileSync(full);
   if(raw.includes(0)){
    findings.push({path:name,code:'BINARY_TRACKED_FILE'});continue;
   }
   const value=raw.toString('utf8');scanned++;bytes+=raw.length;
   for(const [code,re] of SECRET_PATTERNS){
    const m=re.exec(value);
    if(m)findings.push({path:name,code});
   }
   LITERAL_SECRET.lastIndex=0;
   for(const m of value.matchAll(LITERAL_SECRET)){
     if(!KNOWN_FAKE.test(m[2])&&
       !(name.startsWith('tests/')&&TEST_ONLY_FAKE.test(m[2]))){
       findings.push({path:name,code:'HARD_CODED_API_SECRET_LITERAL'});break;
     }
   }
  }catch{
   findings.push({path:name,code:'TRACKED_FILE_UNREADABLE'});
  }
 }
 return Object.freeze({schemaVersion:1,
  status:findings.length?'RELEASE_SOURCE_SCAN_BLOCKED':'RELEASE_SOURCE_SCAN_PASS',
  filesScanned:scanned,trackedPaths:trackedFiles.length,bytesScanned:bytes,
  findings,providerRequests:0,paymentPosts:0,fileWrites:0,
  ownerReleaseAuthorized:false,productionVerified:false});
}
export function trackedPaths(root){
 const bytes=execFileSync('git',['ls-files','-z','--cached'],{
   cwd:root,encoding:'buffer',timeout:10000,maxBuffer:5*1024*1024,
   windowsHide:true,stdio:['ignore','pipe','ignore']});
 return bytes.toString('utf8').split('\0').filter(Boolean);
}
export function inspectReleaseSource(root=ROOT){
 try{return evaluateTrackedSource(root,trackedPaths(root))}
 catch{return Object.freeze({status:'RELEASE_SOURCE_SCAN_BLOCKED',
  reason:'GIT_TRACKED_TREE_UNAVAILABLE',filesScanned:0,
  findings:[],providerRequests:0,paymentPosts:0,fileWrites:0,
  ownerReleaseAuthorized:false});}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==2){
   console.log(JSON.stringify({status:'RELEASE_SOURCE_SCAN_BLOCKED',
    reason:'NO_CLI_ARGUMENTS_SUPPORTED',providerRequests:0}));process.exitCode=2;
 }else{
   const outcome=inspectReleaseSource();
   // Only classifications and paths; never source lines, tokens or secret values.
   console.log(JSON.stringify(outcome));
   if(outcome.status!=='RELEASE_SOURCE_SCAN_PASS')process.exitCode=2;
 }
}
