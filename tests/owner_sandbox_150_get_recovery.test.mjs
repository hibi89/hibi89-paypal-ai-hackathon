import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createSandboxTransport} from '../src/paypal_sandbox_transport.mjs';
import {createExistingSandboxGetOnlyFetch}
 from '../src/sandbox_existing_get_only_fetch.mjs';
import {createOwnerSandbox150GetRecovery,inspectOwnerSandbox150ExistingOrder}
 from '../src/owner_sandbox_150_get_recovery.mjs';

const merchant='A1B2C3D4E5F6G',actor='owner',quoteId='new_same_quote150';
const orderId='TEST_NEW_150_ORDER',captureId='TEST_NEW_150_CAPTURE';
const scope=filename=>({filename,actorId:actor,merchantId:merchant,quoteId});
const remote=status=>({
 id:orderId,status,intent:'CAPTURE',purchase_units:[{
  reference_id:quoteId,payee:{merchant_id:merchant},
  amount:{currency_code:'USD',value:'1.50'},
  ...(status==='COMPLETED'?{payments:{captures:[{
   id:captureId,status:'COMPLETED',
   amount:{currency_code:'USD',value:'1.50'}
  }]}}:{})
 }]
});
const withDir=fn=>async()=>{
 const dir=mkdtempSync(join(tmpdir(),'worknova-new150-get-'));
 try{await fn(dir)}finally{rmSync(dir,{recursive:true,force:true})}
};
async function seed(dir,{captureState='PAID',unknownCreate=false}={}){
 const filename=join(dir,'owner-sandbox150-part1.sqlite');
 const ledger=createSqliteLedger({filename,enforceLocalMemberWrites:true});
 try{
  await ledger.provisionLocalMember({actorId:actor,merchantId:merchant,role:'buyer'});
  await ledger.insertQuote({id:quoteId,ownerId:actor,merchantId:merchant});
  await ledger.approve({id:quoteId,actorId:actor,
   expectedVersion:1,amountMinor:150,expectedMembershipRevision:1});
  const ctx={quoteId,actorId:actor,merchantId:merchant};
  const created=await ledger.claimOperation({...ctx,operation:'create'});
  if(unknownCreate){
   await ledger.markUnknown(created.attempt.requestId);
   return filename;
  }
  await ledger.recordApprovedOrderFromGet({...ctx,order:remote('APPROVED')});
  if(captureState){
   const captured=await ledger.claimOperation({...ctx,operation:'capture'});
   if(captureState==='PAID')
    await ledger.recordCaptureFromGet({...ctx,order:remote('COMPLETED'),
     capture:{id:captureId,orderId,status:'COMPLETED',
      amount:{currency_code:'USD',value:'1.50'}}});
   else if(captureState==='UNKNOWN')
    await ledger.markUnknown(captured.attempt.requestId);
  }
 }finally{ledger.close()}
 return filename;
}
const transport=(state='COMPLETED')=>{
 const calls=[],remoteNetwork=async(url,init)=>{
  calls.push({method:init.method,path:new URL(url).pathname});
  if(url.endsWith('/v1/oauth2/token'))
   return {status:200,json:async()=>({
    access_token:'SYNTHETIC_ACCESS',token_type:'Bearer'
   })};
  if(url.endsWith('/v2/checkout/orders/'+orderId))
   return {status:200,json:async()=>remote(state)};
  throw Error('UNEXPECTED_PROVIDER_PATH');
 };
 const firewall=createExistingSandboxGetOnlyFetch({
  fetchImpl:remoteNetwork,maxOrderGets:2,maxOauthPosts:2
 });
 const paypal=createSandboxTransport({
  clientId:'SYNTHETIC_CLIENT',clientSecret:'SYNTHETIC_SECRET',
  fetchImpl:firewall.fetch
 });
 return {calls,firewall,paypal};
};
test('new $1.50 owner quote restart recovery: fresh GET and no local file mutation',withDir(async dir=>{
 const filename=await seed(dir);
 const net=transport();
 const files=readdirSync(dir).sort();
 const before=files.map(f=>readFileSync(join(dir,f)));
 let authorizations=0;
 const recovery=createOwnerSandbox150GetRecovery({
  quoteScope:scope(filename),transport:net.paypal,
  authorizeRead:grant=>{
   authorizations++;
   assert.equal(grant.quoteId,quoteId);
   assert.equal(grant.amountMinor,150);
   assert.equal(grant.paymentPostPermitted,false);
   return true;
  }
 });
 assert.equal(recovery.inspect().status,'OWNER150_EXISTING_ORDER_ELIGIBLE_FOR_GET');
 assert.equal(net.calls.length,0);
 const result=await recovery.refresh();
 assert.equal(result.status,'OWNER150_GET_MATCHES_LOCAL_PAID');
 assert.equal(result.freshSandboxOrderGet,true);
 assert.equal(result.paymentVerifiedByFreshGet,true);
 assert.equal(result.newOrderPostPermitted,false);
 assert.equal(result.capturePostPermitted,false);
 assert.equal(result.localLedgerMutated,false);
 assert.equal(authorizations,1);
 assert.deepEqual(net.calls.map(x=>x.method),['POST','GET','POST','GET']);
 assert.equal(net.firewall.status().orderCreatePosts,0);
 assert.equal(net.firewall.status().capturePosts,0);
 assert.deepEqual(readdirSync(dir).sort(),files);
 files.forEach((name,i)=>assert.deepEqual(readFileSync(join(dir,name)),before[i]));
 assert.equal(JSON.stringify(result).includes(orderId),false);
 assert.equal(JSON.stringify(result).includes(captureId),false);
}));
test('no remote ID, changed merchant, and denied read never invoke network',withDir(async dir=>{
 const filename=await seed(dir,{unknownCreate:true});
 const net=transport();
 assert.throws(()=>inspectOwnerSandbox150ExistingOrder(scope(filename)),{
  code:'OWNER150_GET_ORDER_ID_UNKNOWN_NO_RETRY'
 });
 assert.equal(net.calls.length,0);
 const mismatch=createOwnerSandbox150GetRecovery({
  quoteScope:{...scope(filename),merchantId:'Z9Y8X7W6V5U4T'},
  transport:net.paypal,authorizeRead:async()=>true
 });
 assert.throws(()=>mismatch.inspect(),{code:'OWNER150_GET_EXACT_APPROVAL_REQUIRED'});
 assert.equal(net.calls.length,0);
}));
test('unknown capture is not reported PAID even if Sandbox GET says COMPLETED',withDir(async dir=>{
 const filename=await seed(dir,{captureState:'UNKNOWN'});
 const net=transport();
 const reader=createOwnerSandbox150GetRecovery({
  quoteScope:scope(filename),transport:net.paypal,
  authorizeRead:async()=>true
 });
 const result=await reader.refresh();
 assert.equal(result.status,'OWNER150_REMOTE_CAPTURE_LOCAL_REVIEW_REQUIRED');
 assert.equal(result.paymentVerifiedByFreshGet,false);
 assert.equal(result.freshSandboxOrderGet,true);
 assert.equal(net.firewall.status().orderCreatePosts,0);
 assert.equal(net.firewall.status().capturePosts,0);
}));
test('buyer APPROVED GET cannot become paid and does not POST Capture',withDir(async dir=>{
 const filename=await seed(dir,{captureState:null});
 const net=transport('APPROVED');
 const reader=createOwnerSandbox150GetRecovery({
  quoteScope:scope(filename),transport:net.paypal,
  authorizeRead:async()=>true
 });
 const result=await reader.refresh();
 assert.equal(result.status,'OWNER150_BUYER_APPROVED_SEPARATE_CAPTURE_REQUIRED');
 assert.equal(result.paymentVerifiedByFreshGet,false);
 assert.equal(net.firewall.status().orderCreatePosts,0);
 assert.equal(net.firewall.status().capturePosts,0);
}));
test('denied owner read consent blocks OAuth and GET',withDir(async dir=>{
 const filename=await seed(dir);
 const net=transport();
 const reader=createOwnerSandbox150GetRecovery({
  quoteScope:scope(filename),transport:net.paypal,
  authorizeRead:async()=>false
 });
 await assert.rejects(reader.refresh(),{
  code:'OWNER150_GET_EXPLICIT_READ_AUTHORIZATION_REQUIRED'
 });
 assert.equal(net.calls.length,0);
}));
test('audit tamper blocks provider and does not turn local paid into proof',withDir(async dir=>{
 const filename=await seed(dir);
 const db=new DatabaseSync(filename);
 try{
  db.exec('DROP TRIGGER local_audit_deny_update');
  db.prepare('UPDATE local_audit_events SET event_hash=? WHERE seq=1')
   .run('f'.repeat(64));
 }finally{db.close()}
 const net=transport();
 const reader=createOwnerSandbox150GetRecovery({
  quoteScope:scope(filename),transport:net.paypal,
  authorizeRead:async()=>true
 });
 assert.throws(()=>reader.inspect(),{code:'OWNER150_GET_AUDIT_REVIEW_REQUIRED'});
 assert.equal(net.calls.length,0);
}));
test('local claim update during GET invalidates remote PAID observation',withDir(async dir=>{
 const filename=await seed(dir,{captureState:'UNKNOWN'});
 let updated=false;
 const net=createExistingSandboxGetOnlyFetch({fetchImpl:async(url,init)=>{
  if(url.endsWith('/v1/oauth2/token'))
   return {status:200,json:async()=>({
    access_token:'FAKE_ACCESS',token_type:'Bearer'
   })};
  if(url.endsWith('/v2/checkout/orders/'+orderId)){
   if(!updated){
    updated=true;
    const ledger=createSqliteLedger({filename});
    try{
     await ledger.insertQuote({id:'another_quote',ownerId:actor,merchantId:merchant});
    }finally{ledger.close()}
   }
   return {status:200,json:async()=>remote('COMPLETED')};
  }
  throw Error('FAKE_ONLY');
 }});
 const paypal=createSandboxTransport({
  clientId:'SYNTHETIC_CLIENT',clientSecret:'SYNTHETIC_SECRET',
  fetchImpl:net.fetch
 });
 const reader=createOwnerSandbox150GetRecovery({
  quoteScope:scope(filename),transport:paypal,
  authorizeRead:async()=>true
 });
 const result=await reader.refresh();
 assert.equal(updated,true);
 assert.equal(result.status,'OWNER150_LOCAL_CHANGED_DURING_PROVIDER_GET');
 assert.equal(result.paymentVerifiedByFreshGet,false);
 assert.equal(net.status().orderCreatePosts,0);
 assert.equal(net.status().capturePosts,0);
}));
test('CLI dry-run and no-TTY use zero local file and zero provider HTTP',()=>{
 const cli=fileURLToPath(new URL('../scripts/reconcile_owner_sandbox150_get_only.mjs',import.meta.url));
 const run=flags=>spawnSync(process.execPath,['--experimental-sqlite',cli,...flags],{
  encoding:'utf8',timeout:15000,env:{...process.env,
   PAYPAL_SANDBOX_CLIENT_SECRET:'FAKE_PRIVATE_SENTINEL'}
 });
 for(const [flags,status] of [
  [[], 'DRY_RUN_NO_FILE_NO_NETWORK'],
  [['--execute','--owner-authorized','--sandbox-only','--get-existing-only'],
   'PRIVATE_INTERACTIVE_TTY_REQUIRED']
 ]){
  const done=run(flags);
  assert.equal(done.status,2,done.stderr);
  const report=JSON.parse(done.stdout);
  assert.equal(report.status,status);
  assert.equal(report.networkRequests,0);
  assert.equal(report.fileWrites,0);
  assert.equal(report.paymentPostPermitted,false);
  assert.doesNotMatch(done.stdout,/FAKE_PRIVATE_SENTINEL/);
 }
});
