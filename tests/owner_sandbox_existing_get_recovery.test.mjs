import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {DatabaseSync} from 'node:sqlite';
import {createPilotCheckoutSessionStore} from '../src/pilot_checkout_session_store.mjs';
import {createSandboxTransport} from '../src/paypal_sandbox_transport.mjs';
import {createExistingSandboxGetOnlyFetch} from '../src/sandbox_existing_get_only_fetch.mjs';
import {createOwnerExistingSandboxGetRecovery}
 from '../src/owner_sandbox_existing_get_recovery.mjs';

const MERCHANT='A1B2C3D4E5F6G',ACTOR='local_operator',QUOTE='operator_mvp_01';
const fixture=fn=>async()=>{const dir=mkdtempSync(join(tmpdir(),'paypal-private-get-only-'));
 try{await fn(dir)}finally{rmSync(dir,{recursive:true,force:true})}};
const order=(status='COMPLETED')=>({
 id:'SYNTHETIC_ORDER_1',status,intent:'CAPTURE',
 purchase_units:[{reference_id:QUOTE,payee:{merchant_id:MERCHANT},
  amount:{currency_code:'USD',value:'1.50'},
  ...(status==='COMPLETED'?{payments:{captures:[{
   id:'SYNTHETIC_CAPTURE_1',status:'COMPLETED',
   amount:{currency_code:'USD',value:'1.50'}
  }]}}:{})}]
});
async function seed(dir,{captureState='PAID',unknownCreate=false}={}){
 const ledger=createSqliteLedger({filename:join(dir,'checkout.sqlite')});
 try{
  await ledger.insertQuote({id:QUOTE,ownerId:ACTOR,merchantId:MERCHANT});
  await ledger.approve({id:QUOTE,expectedVersion:1,actorId:ACTOR,amountMinor:150});
  const approved=await ledger.get(QUOTE);
  const sessions=createPilotCheckoutSessionStore({filename:join(dir,'checkout_sessions.sqlite')});
  sessions.issue({quote:approved,principal:{verified:true,actorId:ACTOR,merchantId:MERCHANT}});
  sessions.close();
  const args={quoteId:QUOTE,actorId:ACTOR,merchantId:MERCHANT};
  const create=await ledger.claimOperation({...args,operation:'create'});
  if(unknownCreate){await ledger.markUnknown(create.attempt.requestId);return;}
  await ledger.recordApprovedOrderFromGet({...args,order:order('APPROVED')});
  if(captureState){
   const claim=await ledger.claimOperation({...args,operation:'capture'});
   if(captureState==='PAID')
    await ledger.recordCaptureFromGet({...args,order:order('COMPLETED'),
     capture:{id:'SYNTHETIC_CAPTURE_1',orderId:'SYNTHETIC_ORDER_1',
      status:'COMPLETED',amount:{currency_code:'USD',value:'1.50'}}});
   else if(captureState==='UNKNOWN')
    await ledger.markUnknown(claim.attempt.requestId);
  }
 }finally{ledger.close()}
}
function transport(state={}){
 let calls=[];
 const network=async(url,init)=>{
  calls.push({url,method:init.method});
  if(state.fail)throw new Error('PRIVATE_FAKE_NETWORK_EXCEPTION');
  const path=new URL(url).pathname;
  if(path==='/v1/oauth2/token')return {status:200,json:async()=>({
   access_token:'FAKE_ACCESS_TOKEN',token_type:'Bearer'})};
  if(path==='/v2/checkout/orders/SYNTHETIC_ORDER_1')return {
   status:200,json:async()=>order(state.status??'COMPLETED')};
  throw Error('UNEXPECTED_OUTBOUND_PATH');
 };
 const firewall=createExistingSandboxGetOnlyFetch({fetchImpl:network});
 return {calls,firewall,paypal:createSandboxTransport({
  clientId:'FAKE_CLIENT',clientSecret:'FAKE_SECRET',
  fetchImpl:firewall.fetch})};
}
test('restart recovery reads original captured Sandbox evidence by GET only and changes zero local DB bytes',
 fixture(async dir=>{
  await seed(dir);const x=transport();
  const approvals=[];
  const reader=createOwnerExistingSandboxGetRecovery({
   directory:dir,merchantId:MERCHANT,transport:x.paypal,
   authorizeRead:async grant=>{approvals.push(grant);return true;}
  });
  const files=readdirSync(dir).sort();
  const before=files.map(x=>readFileSync(join(dir,x)));
  const initial=reader.inspect();
  assert.equal(initial.status,'EXISTING_ORDER_AVAILABLE_FOR_AUTHORIZED_GET');
  assert.equal(initial.payPalGetPerformed,false);
  assert.equal(x.calls.length,0);
  const result=await reader.refresh();
  assert.equal(result.status,'SANDBOX_CAPTURE_GET_MATCHES_LOCAL_PAID');
  assert.equal(result.paymentVerifiedByFreshGet,true);
  assert.equal(result.newOrderPostPermitted,false);
  assert.equal(result.capturePostPermitted,false);
  assert.equal(result.localLedgerMutated,false);
  assert.equal(approvals.length,1);
  assert.equal(approvals[0].createOrCapturePermitted,undefined);
  assert.equal(approvals[0].capturePostPermitted,false);
  assert.equal(x.firewall.status().oauthPostRequests,2);
  assert.equal(x.firewall.status().orderGetRequests,2);
  assert.equal(x.firewall.status().orderCreatePosts,0);
  assert.equal(x.firewall.status().capturePosts,0);
  assert.deepEqual(readdirSync(dir).sort(),files);
  files.forEach((name,i)=>assert.deepEqual(readFileSync(join(dir,name)),before[i]));
  assert.equal(JSON.stringify(result).includes('SYNTHETIC_ORDER_1'),false);
  assert.equal(JSON.stringify(result).includes('SYNTHETIC_CAPTURE_1'),false);
 }));
test('operator consent denial blocks OAuth and order GET before any I/O',
 fixture(async dir=>{
  await seed(dir);const x=transport();let count=0;
  const reader=createOwnerExistingSandboxGetRecovery({
   directory:dir,merchantId:MERCHANT,transport:x.paypal,
   authorizeRead:async()=>{count++;return false;}
  });
  await assert.rejects(reader.refresh(),
   e=>e.code==='EXISTING_ORDER_GET_OWNER_CONSENT_REQUIRED');
  assert.equal(count,1);
  assert.equal(x.calls.length,0);
 }));
test('UNKNOWN capture requires manual reconciliation even if remote GET says COMPLETED',
 fixture(async dir=>{
  await seed(dir,{captureState:'UNKNOWN'});const x=transport();
  const reader=createOwnerExistingSandboxGetRecovery({
   directory:dir,merchantId:MERCHANT,transport:x.paypal,
   authorizeRead:async()=>true
  });
  const result=await reader.refresh();
  assert.equal(result.status,'REMOTE_CAPTURE_FOUND_LOCAL_RECONCILIATION_REQUIRED');
  assert.equal(result.paymentVerifiedByFreshGet,false);
  assert.equal(result.localLedgerMutated,false);
  assert.equal(x.firewall.status().capturePosts,0);
 }));
test('crashed CREATE without remote ID and wrong merchant cannot access provider',
 fixture(async dir=>{
  await seed(dir,{unknownCreate:true});const x=transport();
  const reader=createOwnerExistingSandboxGetRecovery({
   directory:dir,merchantId:MERCHANT,transport:x.paypal,
   authorizeRead:async()=>true
  });
  assert.throws(()=>reader.inspect(),e=>e.code==='EXISTING_ORDER_GET_FIRST_MANUAL_REVIEW');
  assert.equal(x.calls.length,0);
  const foreign=createOwnerExistingSandboxGetRecovery({
   directory:dir,merchantId:'Z9Y8X7W6V5U4T',
   transport:x.paypal,authorizeRead:async()=>true
  });
  assert.throws(()=>foreign.inspect(),e=>e.code==='EXISTING_ORDER_BOUND_APPROVAL_REQUIRED');
  assert.equal(x.calls.length,0);
 }));
test('network failure is sanitized, no captured state invented and no retry',
 fixture(async dir=>{
  await seed(dir);const x=transport({fail:true});
  const reader=createOwnerExistingSandboxGetRecovery({
   directory:dir,merchantId:MERCHANT,transport:x.paypal,
   authorizeRead:async()=>true
  });
  const result=await reader.refresh();
  assert.equal(result.status,'SANDBOX_GET_UNVERIFIED_MANUAL_REVIEW');
  assert.equal(result.paymentVerifiedByFreshGet,false);
  assert.equal(result.autoRetryAllowed,false);
  assert.equal(x.calls.length,1);
  assert.equal(JSON.stringify(result).includes('PRIVATE_FAKE_NETWORK'),false);
 }));
test('owner GET-only CLI requires exact flags and private TTY before credentials are touched',()=>{
 const cli=fileURLToPath(new URL('../scripts/reconcile_existing_sandbox_get_only.mjs',import.meta.url));
 const run=extra=>spawnSync(process.execPath,['--experimental-sqlite',cli,...extra],{
  encoding:'utf8',timeout:10000,env:{...process.env,
   PAYPAL_SANDBOX_CLIENT_SECRET:'FAKE_PRIVATE_SENTINEL'}
 });
 for(const [flags,status] of [
  [[],'DRY_RUN_EXPLICIT_FLAGS_REQUIRED'],
  [['--execute','--owner-authorized','--sandbox-only','--get-existing-only'],
   'PRIVATE_INTERACTIVE_TTY_REQUIRED']
 ]){
  const response=run(flags);
  assert.equal(response.status,2,response.stderr);
  const j=JSON.parse(response.stdout);
  assert.equal(j.status,status);
  assert.equal(j.networkRequests,0);
  assert.equal(j.fileWrites,0);
  assert.equal(j.paymentPostPermitted,false);
  assert.doesNotMatch(response.stdout,/FAKE_PRIVATE_SENTINEL/);
 }
});

test('audit hash-chain tampering blocks saved capture as a reconciliation source before GET',
 fixture(async dir=>{
  await seed(dir);const x=transport();
  const filename=join(dir,'checkout.sqlite');
  const db=new DatabaseSync(filename);
  try{
   db.exec('DROP TRIGGER local_audit_deny_update');
   db.prepare('UPDATE local_audit_events SET event_hash=? WHERE seq=1')
    .run('f'.repeat(64));
  }finally{db.close()}
  const reader=createOwnerExistingSandboxGetRecovery({
   directory:dir,merchantId:MERCHANT,transport:x.paypal,
   authorizeRead:async()=>true
  });
  assert.throws(()=>reader.inspect(),e=>e.code==='EXISTING_ORDER_AUDIT_REVIEW_REQUIRED');
  await assert.rejects(reader.refresh(),e=>e.code==='EXISTING_ORDER_AUDIT_REVIEW_REQUIRED');
  assert.equal(x.calls.length,0);
 }));
test('local ledger mutation while remote GET is in flight prevents stale payment verification',
 fixture(async dir=>{
  await seed(dir);
  let changed=false;
  const t=transport({status:'COMPLETED'});
  const fetchImpl=async(url,init)=>{
   const path=new URL(url).pathname;
   if(path==='/v2/checkout/orders/SYNTHETIC_ORDER_1'&&!changed){
    changed=true;
    const ledger=createSqliteLedger({filename:join(dir,'checkout.sqlite')});
    try{
     await ledger.insertQuote({id:'other_quote',ownerId:ACTOR,
      merchantId:MERCHANT});
    }finally{ledger.close()}
   }
   return (async()=>{
    if(path==='/v1/oauth2/token')
     return {status:200,json:async()=>({
      access_token:'FAKE_ACCESS_TOKEN',token_type:'Bearer'})};
    if(path==='/v2/checkout/orders/SYNTHETIC_ORDER_1')
     return {status:200,json:async()=>order('COMPLETED')};
    throw new Error('UNEXPECTED_STUB');
   })();
  };
  const firewall=createExistingSandboxGetOnlyFetch({fetchImpl});
  const transport=createSandboxTransport({
   clientId:'FAKE_CLIENT',clientSecret:'FAKE_SECRET',fetchImpl:firewall.fetch
  });
  const reader=createOwnerExistingSandboxGetRecovery({
   directory:dir,merchantId:MERCHANT,transport,
   authorizeRead:async()=>true
  });
  assert.equal(reader.inspect().status,'EXISTING_ORDER_AVAILABLE_FOR_AUTHORIZED_GET');
  const result=await reader.refresh();
  assert.equal(changed,true);
  assert.equal(result.status,'EXISTING_ORDER_LOCAL_CHANGED_DURING_GET');
  assert.equal(result.paymentVerifiedByFreshGet,false);
  assert.equal(result.freshSandboxOrderGet,false);
  assert.equal(result.localLedgerMutated,false);
  assert.equal(firewall.status().orderCreatePosts,0);
  assert.equal(firewall.status().capturePosts,0);
 }));
