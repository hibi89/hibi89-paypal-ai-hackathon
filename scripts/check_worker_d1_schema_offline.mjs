// Offline file-only structural inspection. Never opens a remote D1 account,
// updates an owner file, sends a network request, or interprets schema PASS
// as deployment approval. A --sqlite path must be explicitly supplied.
import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
import {auditWorkerD1SchemaReadOnly} from '../src/worker_d1_schema_preflight.mjs';
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--sqlite'||!args[1]||!existsSync(args[1])){
 console.log(JSON.stringify({status:'BLOCKED_EXPLICIT_EXISTING_SQLITE_PATH_REQUIRED',
  releaseAuthorized:false,liveCloudflareD1Verified:false}));
 process.exitCode=2;
}else{
 let sqlite;
 try{
  sqlite=new DatabaseSync(args[1],{readOnly:true});
  const db={withSession(mode){
   if(mode!=='first-primary')throw Error('PRIMARY_REQUIRED');
   return {prepare(sql){
    if(!/^(SELECT|PRAGMA)\s/i.test(sql))throw Error('READ_ONLY_ONLY');
    return {all:async()=>({results:sqlite.prepare(sql).all()})};
   }};
  }};
  const report=await auditWorkerD1SchemaReadOnly({db});
  console.log(JSON.stringify(report));
  if(report.status!=='OFFLINE_SCHEMA_CANDIDATE_ONLY')process.exitCode=2;
 }catch{
  console.log(JSON.stringify({status:'BLOCKED_OFFLINE_DB_OPEN_FAILED',
   releaseAuthorized:false,liveCloudflareD1Verified:false}));
  process.exitCode=2;
 }finally{sqlite?.close();}
}
