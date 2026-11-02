// INTERNAL ONLY. Inspect D1-shaped SQLite schema without reading customer rows,
// modifying database state, provisioning a Worker, or calling an external API.
// Passing this structural check NEVER authorizes hosting, login or payment.
export class WorkerD1SchemaPreflightError extends Error {
 constructor(code){super(code);this.name='WorkerD1SchemaPreflightError';this.code=code;}
}
const TABLES=Object.freeze({
 quotes:['id','owner_id','merchant_id','version','currency','status','approval_actor','approval_version','approval_amount_minor'],
 payment_attempts:['request_id','quote_id','quote_version','merchant_id','operation','state','amount_minor','currency'],
 worker_private_sessions:['token_sha256','actor_id','merchant_id','role','issuer','issuer_verified_at_ms','expires_at_ms','revoked_at_ms','assertion_sha256','binding_subject_hmac','binding_revision'],
 worker_private_oidc_bindings:['issuer','subject_hmac','actor_id','merchant_id','role','active','revision'],
 worker_private_login_challenges:['challenge_sha256','nonce','created_at_ms','expires_at_ms','consumed_at_ms']
});
const INDEXES=Object.freeze([
 'idx_attempts_quote','idx_worker_sessions_expiry',
 'ux_worker_session_assertion','idx_worker_private_session_binding'
]);
const TRIGGERS=Object.freeze([
 'protect_claimed_quote_update','protect_claimed_quote_delete',
 'worker_private_binding_revision_on_change',
 'worker_private_binding_monotonic_revision',
 'worker_private_binding_no_delete','worker_private_binding_no_replace'
]);
const auditReport=(issues,queries)=>Object.freeze({
 status:issues.length?'BLOCKED_OFFLINE_D1_SCHEMA':'OFFLINE_SCHEMA_CANDIDATE_ONLY',
 issueCodes:Object.freeze([...new Set(issues)].sort()),
 readOnly:true,metadataQueries:queries,
 liveCloudflareD1Verified:false,restoreFreshnessVerified:false,
 externalIdentityVerified:false,providerCalls:0,dbWrites:0,
 accountChangesAuthorized:false,releaseAuthorized:false,paymentAuthorized:false
});
export async function auditWorkerD1SchemaReadOnly({db}={}){
 let count=0;
 if(!db||typeof db.withSession!=='function')
  return auditReport(['D1_PRIMARY_UNAVAILABLE'],count);
 try{
  const primary=db.withSession('first-primary');
  if(!primary||typeof primary.prepare!=='function')
   throw new WorkerD1SchemaPreflightError('D1_PRIMARY_UNAVAILABLE');
  const rows=async sql=>{
   // No dynamic user strings are accepted; all SQL is fixed schema metadata.
   if(!/^(SELECT|PRAGMA)\s/i.test(sql))
    throw new WorkerD1SchemaPreflightError('D1_READ_ONLY_CONTRACT');
   count++;
   const statement=primary.prepare(sql);
   if(typeof statement?.all!=='function')
    throw new WorkerD1SchemaPreflightError('D1_READ_ONLY_CONTRACT');
   const output=await statement.all();
   if(!Array.isArray(output?.results))
    throw new WorkerD1SchemaPreflightError('D1_METADATA_UNAVAILABLE');
   return output.results;
  };
  const entries=await rows("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','trigger')");
  const issues=[],has=(type,name)=>entries.some(e=>e?.type===type&&e.name===name);
  for(const name of Object.keys(TABLES)){
   if(!has('table',name)){issues.push('MISSING_TABLE:'+name);continue;}
   const columns=await rows("PRAGMA table_info('"+name+"')");
   const found=new Set(columns.map(x=>x.name));
   for(const column of TABLES[name]){
    if(!found.has(column))issues.push('MISSING_COLUMN:'+name+'.'+column);
   }
  }
  for(const name of INDEXES)if(!has('index',name))issues.push('MISSING_INDEX:'+name);
  for(const name of TRIGGERS)if(!has('trigger',name))issues.push('MISSING_TRIGGER:'+name);
  if(has('index','ux_worker_session_assertion')){
   // A same-named UNIQUE index on a different column does NOT prevent OIDC
   // assertion replay. Verify the actual key, scope and complete predicate.
   const definition=entries.find(x=>x.type==='index'&&x.name==='ux_worker_session_assertion');
   const indexes=await rows("PRAGMA index_list('worker_private_sessions')");
   const assertionIndex=indexes.find(x=>x.name==='ux_worker_session_assertion');
   if(!assertionIndex||Number(assertionIndex.unique)!==1)
    issues.push('ASSERTION_INDEX_NOT_UNIQUE');
   if(definition?.tbl_name!=='worker_private_sessions')
    issues.push('ASSERTION_INDEX_WRONG_TABLE');
   const indexColumns=await rows("PRAGMA index_xinfo('ux_worker_session_assertion')");
   const keyColumns=indexColumns.filter(x=>Number(x.key)===1)
    .sort((a,b)=>Number(a.seqno)-Number(b.seqno)).map(x=>x.name);
   if(keyColumns.length!==1||keyColumns[0]!=='assertion_sha256')
    issues.push('ASSERTION_INDEX_WRONG_COLUMNS');
   const expectedSql=/^CREATE\s+UNIQUE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?ux_worker_session_assertion\s+ON\s+worker_private_sessions\s*\(\s*assertion_sha256\s*\)\s+WHERE\s+assertion_sha256\s+IS\s+NOT\s+NULL\s*;?$/i;
   if(Number(assertionIndex?.partial)!==1||!expectedSql.test(definition?.sql??''))
    issues.push('ASSERTION_INDEX_PREDICATE_UNEXPECTED');
  }
  // Structural signatures, NOT a cryptographic attestation of exact SQL.
  // Missing guard clauses prevent even offline schema-candidate status.
  const guardPatterns={
   protect_claimed_quote_update:/BEFORE\s+UPDATE[\s\S]*RAISE\s*\(\s*ABORT/i,
   protect_claimed_quote_delete:/BEFORE\s+DELETE[\s\S]*RAISE\s*\(\s*ABORT/i,
   worker_private_binding_revision_on_change:/AFTER\s+UPDATE[\s\S]*SET\s+revision\s*=\s*OLD\.revision\s*\+\s*1/i,
   worker_private_binding_monotonic_revision:/BEFORE\s+UPDATE[\s\S]*RAISE\s*\(\s*ABORT/i,
   worker_private_binding_no_delete:/BEFORE\s+DELETE[\s\S]*RAISE\s*\(\s*ABORT/i,
   worker_private_binding_no_replace:/BEFORE\s+INSERT[\s\S]*RAISE\s*\(\s*ABORT/i
  };
  for(const [name,pattern] of Object.entries(guardPatterns)){
   const object=entries.find(x=>x.type==='trigger'&&x.name===name);
   if(object&&!pattern.test(object.sql??''))issues.push('GUARD_SIGNATURE_UNEXPECTED:'+name);
  }
  return auditReport(issues,count);
 }catch(error){
  const code=error instanceof WorkerD1SchemaPreflightError?
   error.code:'D1_METADATA_UNAVAILABLE';
  return auditReport([code],count);
 }
}
