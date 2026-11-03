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
 worker_private_login_challenges:['challenge_sha256','nonce','created_at_ms','expires_at_ms','consumed_at_ms'],
 payment_attempt_audit:['sequence','request_id','quote_id','quote_version','merchant_id','operation','event_type','before_state','after_state','remote_id','observed_at']
});
const INDEXES=Object.freeze([
 'idx_attempts_quote','idx_worker_sessions_expiry',
 'ux_worker_session_assertion','idx_worker_private_session_binding','idx_payment_attempt_audit_request'
]);
const TRIGGERS=Object.freeze([
 'protect_claimed_quote_update','protect_claimed_quote_delete',
 'worker_private_binding_revision_on_change',
 'worker_private_binding_monotonic_revision',
 'worker_private_binding_no_delete','worker_private_binding_no_replace',
 'payment_attempt_audit_on_insert',
 'payment_attempt_audit_on_state_or_remote',
 'payment_attempt_audit_no_update',
 'payment_attempt_audit_no_delete',
 'payment_attempt_claim_identity_immutable',
 'payment_attempt_remote_id_immutable',
 'payment_attempt_must_start_inflight',
 'payment_attempt_state_monotonic',
 'payment_attempt_proof_reference_required'
]);
// Independently pinned from the reviewed 0001/0004 migration definitions.
// sqlite_master omits IF NOT EXISTS. Full SQL comparison catches inert WHEN 0
// guards which would pass a superficial RAISE(ABORT) signature check.
// A matching catalog remains OFFLINE evidence, not remote D1 attestation.
const EXPECTED_GUARD_SQL=Object.freeze({
 "protect_claimed_quote_update": "CREATE TRIGGER protect_claimed_quote_update BEFORE UPDATE ON quotes\nWHEN EXISTS(SELECT 1 FROM payment_attempts a WHERE a.quote_id=OLD.id)\nBEGIN SELECT RAISE(ABORT,'CLAIMED_QUOTE_IMMUTABLE'); END",
 "protect_claimed_quote_delete": "CREATE TRIGGER protect_claimed_quote_delete BEFORE DELETE ON quotes\nWHEN EXISTS(SELECT 1 FROM payment_attempts a WHERE a.quote_id=OLD.id)\nBEGIN SELECT RAISE(ABORT,'CLAIMED_QUOTE_IMMUTABLE'); END",
 "worker_private_binding_revision_on_change": "CREATE TRIGGER worker_private_binding_revision_on_change\nAFTER UPDATE OF active,actor_id,merchant_id,role,issuer,subject_hmac ON worker_private_oidc_bindings\nBEGIN\n UPDATE worker_private_oidc_bindings SET revision = OLD.revision + 1\n WHERE issuer = NEW.issuer AND subject_hmac = NEW.subject_hmac;\nEND",
 "worker_private_binding_monotonic_revision": "CREATE TRIGGER worker_private_binding_monotonic_revision\nBEFORE UPDATE OF revision ON worker_private_oidc_bindings\nWHEN NEW.revision != OLD.revision + 1\nBEGIN SELECT RAISE(ABORT,'OIDC_BINDING_REVISION_NOT_MONOTONIC'); END",
 "worker_private_binding_no_delete": "CREATE TRIGGER worker_private_binding_no_delete\nBEFORE DELETE ON worker_private_oidc_bindings\nBEGIN SELECT RAISE(ABORT,'OIDC_BINDING_MUST_BE_REVOKED'); END",
 "worker_private_binding_no_replace": "CREATE TRIGGER worker_private_binding_no_replace\nBEFORE INSERT ON worker_private_oidc_bindings\nWHEN EXISTS(SELECT 1 FROM worker_private_oidc_bindings\n WHERE issuer=NEW.issuer AND subject_hmac=NEW.subject_hmac)\nBEGIN SELECT RAISE(ABORT,'OIDC_BINDING_REPLACE_FORBIDDEN'); END"
,
 // Independently pinned SQL from reviewed local 0005/0006 candidates.
 // This is an offline structural check, never a remote migration approval.
 "payment_attempt_audit_on_insert": "CREATE TRIGGER payment_attempt_audit_on_insert\nAFTER INSERT ON payment_attempts\nBEGIN\n INSERT INTO payment_attempt_audit\n (request_id,quote_id,quote_version,merchant_id,operation,event_type,before_state,after_state,remote_id)\n VALUES (NEW.request_id,NEW.quote_id,NEW.quote_version,NEW.merchant_id,NEW.operation,\n 'CLAIM_CREATED',NULL,NEW.state,NEW.remote_id);\nEND;",
 "payment_attempt_audit_on_state_or_remote": "CREATE TRIGGER payment_attempt_audit_on_state_or_remote\nAFTER UPDATE OF state,remote_id ON payment_attempts\nWHEN OLD.state IS NOT NEW.state OR OLD.remote_id IS NOT NEW.remote_id\nBEGIN\n INSERT INTO payment_attempt_audit\n (request_id,quote_id,quote_version,merchant_id,operation,event_type,before_state,after_state,remote_id)\n VALUES (NEW.request_id,NEW.quote_id,NEW.quote_version,NEW.merchant_id,NEW.operation,\n CASE WHEN OLD.state IS NOT NEW.state THEN 'STATE_CHANGED' ELSE 'REMOTE_ID_BOUND' END,\n OLD.state,NEW.state,NEW.remote_id);\nEND;",
 "payment_attempt_audit_no_update": "CREATE TRIGGER payment_attempt_audit_no_update\nBEFORE UPDATE ON payment_attempt_audit\nBEGIN SELECT RAISE(ABORT,'PAYMENT_AUDIT_APPEND_ONLY'); END;",
 "payment_attempt_audit_no_delete": "CREATE TRIGGER payment_attempt_audit_no_delete\nBEFORE DELETE ON payment_attempt_audit\nBEGIN SELECT RAISE(ABORT,'PAYMENT_AUDIT_APPEND_ONLY'); END;",
 "payment_attempt_claim_identity_immutable": "CREATE TRIGGER payment_attempt_claim_identity_immutable\nBEFORE UPDATE OF request_id,quote_id,quote_version,merchant_id,operation,amount_minor,currency\nON payment_attempts\nWHEN OLD.request_id IS NOT NEW.request_id OR OLD.quote_id IS NOT NEW.quote_id\n OR OLD.quote_version IS NOT NEW.quote_version OR OLD.merchant_id IS NOT NEW.merchant_id\n OR OLD.operation IS NOT NEW.operation OR OLD.amount_minor IS NOT NEW.amount_minor\n OR OLD.currency IS NOT NEW.currency\nBEGIN SELECT RAISE(ABORT,'PAYMENT_CLAIM_IDENTITY_IMMUTABLE'); END;",
 "payment_attempt_remote_id_immutable": "CREATE TRIGGER payment_attempt_remote_id_immutable\nBEFORE UPDATE OF remote_id ON payment_attempts\nWHEN OLD.remote_id IS NOT NULL AND OLD.remote_id IS NOT NEW.remote_id\nBEGIN SELECT RAISE(ABORT,'PAYMENT_REMOTE_ID_IMMUTABLE'); END;",
 "payment_attempt_must_start_inflight": "CREATE TRIGGER payment_attempt_must_start_inflight\nBEFORE INSERT ON payment_attempts\nWHEN NEW.state != 'IN_FLIGHT' OR NEW.remote_id IS NOT NULL\nBEGIN SELECT RAISE(ABORT,'PAYMENT_CLAIM_MUST_START_IN_FLIGHT'); END;",
 "payment_attempt_state_monotonic": "CREATE TRIGGER payment_attempt_state_monotonic\nBEFORE UPDATE OF state ON payment_attempts\nWHEN OLD.state IS NOT NEW.state AND NOT (\n (OLD.state='IN_FLIGHT' AND NEW.state IN ('UNKNOWN','APPROVED')) OR\n (OLD.state='UNKNOWN' AND NEW.state IN ('APPROVED','PAID')) OR\n (OLD.state='APPROVED' AND NEW.state IN ('UNKNOWN','PAID'))\n)\nBEGIN SELECT RAISE(ABORT,'PAYMENT_STATE_TRANSITION_FORBIDDEN'); END;",
 "payment_attempt_proof_reference_required": "CREATE TRIGGER payment_attempt_proof_reference_required\nBEFORE UPDATE OF state,remote_id ON payment_attempts\nWHEN NEW.state IN ('APPROVED','PAID') AND NEW.remote_id IS NULL\nBEGIN SELECT RAISE(ABORT,'REMOTE_ORDER_REFERENCE_REQUIRED'); END;"
});
const normalizeGuardSql=sql=>typeof sql==='string'
 ? sql.replace(/^CREATE\s+TRIGGER\s+(?:IF\s+NOT\s+EXISTS\s+)?/i,'CREATE TRIGGER ')
    .replace(/\s+/g,' ').trim().replace(/;$/,'')
 : '';

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
   // A guard must match the complete reviewed migration contract, not
   // merely contain RAISE(ABORT) in a path that might never execute.
   if(object&&normalizeGuardSql(object.sql)!==normalizeGuardSql(EXPECTED_GUARD_SQL[name]))
    issues.push('GUARD_SQL_DRIFT:'+name);
  }
  // New audit and state-integrity triggers must match the reviewed full DDL.
  // Name-only presence or inert WHEN 0 is insufficient to clear this gate.
  for(const name of ["payment_attempt_audit_on_insert","payment_attempt_audit_on_state_or_remote","payment_attempt_audit_no_update","payment_attempt_audit_no_delete","payment_attempt_claim_identity_immutable","payment_attempt_remote_id_immutable","payment_attempt_must_start_inflight","payment_attempt_state_monotonic","payment_attempt_proof_reference_required"]){
   const object=entries.find(x=>x.type==='trigger'&&x.name===name);
   if(object&&normalizeGuardSql(object.sql)!==normalizeGuardSql(EXPECTED_GUARD_SQL[name]))
    issues.push('GUARD_SQL_DRIFT:'+name);
  }
  return auditReport(issues,count);
 }catch(error){
  const code=error instanceof WorkerD1SchemaPreflightError?
   error.code:'D1_METADATA_UNAVAILABLE';
  return auditReport([code],count);
 }
}
