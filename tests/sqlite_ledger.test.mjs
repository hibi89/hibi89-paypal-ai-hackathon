import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteLedger } from '../src/sqlite_ledger.mjs';
import { createQuoteApi } from '../src/quote_api.mjs';

function setup() {
  const folder=mkdtempSync(join(tmpdir(),'paypal-db-'));
  const filename=join(folder,'state.sqlite');
  return {filename, open:()=>createSqliteLedger({filename}),
    destroy:()=>rmSync(folder,{recursive:true,force:true})};
}
async function seed(db,id='q1',ownerId='owner',merchantId='merchant') {
  return db.insertQuote({id,ownerId,merchantId,version:2,aiSuggestedMinor:9900});
}
async function approve(db,id='q1',amountMinor=1500) {
  return db.approve({id,actorId:'owner',expectedVersion:2,amountMinor});
}
const claim=(operation='create',extra={})=>({
  quoteId:'q1',actorId:'owner',merchantId:'merchant',operation,...extra
});
const order=(status='APPROVED')=>({id:'ORDER001',intent:'CAPTURE',status,
  purchase_units:[{reference_id:'q1',payee:{merchant_id:'merchant'},
    amount:{currency_code:'USD',value:'15.00'},
    ...(status==='COMPLETED'?{payments:{captures:[{
      id:'CAP001',status:'COMPLETED',
      amount:{currency_code:'USD',value:'15.00'}
    }]}}:{})}]});
const capture=()=>({id:'CAP001',orderId:'ORDER001',status:'COMPLETED',
  amount:{currency_code:'USD',value:'15.00'}});
function withDb(fn) {
  return async () => {
    const env=setup();
    try { await fn(env); }
    finally { env.destroy(); }
  };
}
test('reject memory-only database: persistence required',()=>{
  assert.throws(()=>createSqliteLedger({filename:':memory:'}),
    {code:'DURABLE_SQLITE_FILENAME_REQUIRED'});
  assert.throws(()=>createSqliteLedger({}),{code:'DURABLE_SQLITE_FILENAME_REQUIRED'});
});
test('SQL schema survives close/open, approval snapshot stays durable',withDb(async e=>{
  let db=e.open();
  await seed(db);
  await approve(db);
  db.close();
  db=e.open();
  const q=await db.get('q1');
  assert.equal(q.status,'APPROVED');
  assert.equal(q.approval.amountMinor,1500);
  assert.equal(q.approval.quoteVersion,2);
  db.close();
}));
test('duplicate quote ID is rejected by PRIMARY KEY',withDb(async e=>{
  const db=e.open();
  await seed(db);
  await assert.rejects(seed(db),{code:'DUPLICATE_QUOTE_ID'});
  db.close();
}));
test('approved quote cannot be approved again, original amount preserved',withDb(async e=>{
  const db=e.open();
  await seed(db);
  await approve(db);
  await assert.rejects(approve(db,'q1',9999),{code:'QUOTE_ALREADY_APPROVED'});
  assert.equal((await db.get('q1')).approval.amountMinor,1500);
  db.close();
}));
test('version mismatch cannot approve and leaves proposal intact',withDb(async e=>{
  const db=e.open();
  await seed(db);
  await assert.rejects(db.approve({id:'q1',actorId:'owner',expectedVersion:1,
    amountMinor:1500}),{code:'STALE_QUOTE_VERSION'});
  assert.equal((await db.get('q1')).status,'PROPOSED');
  db.close();
}));
test('wrong owner cannot approve or claim, even with valid merchant',withDb(async e=>{
  const db=e.open();
  await seed(db);
  await assert.rejects(db.approve({id:'q1',actorId:'other',expectedVersion:2,
    amountMinor:1500}),{code:'QUOTE_NOT_FOUND'});
  await approve(db);
  await assert.rejects(db.claimOperation(claim('create',{actorId:'other'})),
    {code:'QUOTE_NOT_FOUND'});
  db.close();
}));
test('wrong merchant cannot claim and cannot create parallel payment',withDb(async e=>{
  const db=e.open(); await seed(db); await approve(db);
  await assert.rejects(db.claimOperation(claim('create',{merchantId:'evil'})),
    {code:'QUOTE_NOT_FOUND'});
  assert.equal((await db.listAttempts('q1')).length,0);
  db.close();
}));
test('capture before verified PayPal approval is prohibited',withDb(async e=>{
  const db=e.open(); await seed(db); await approve(db);
  await assert.rejects(db.claimOperation(claim('capture')),
    {code:'REMOTE_ORDER_APPROVAL_REQUIRED'});
  const first=await db.claimOperation(claim());
  assert.equal(first.action,'FIRST_CLAIM_ONLY_NO_PROVIDER_CALL');
  await assert.rejects(db.claimOperation(claim('capture')),
    {code:'REMOTE_ORDER_APPROVAL_REQUIRED'});
  db.close();
}));
test('create claim duplicate has same ID and cannot trigger second provider POST',withDb(async e=>{
  const db=e.open(); await seed(db); await approve(db);
  const a=await db.claimOperation(claim());
  const b=await db.claimOperation(claim());
  assert.equal(a.action,'FIRST_CLAIM_ONLY_NO_PROVIDER_CALL');
  assert.equal(b.action,'RECONCILE_GET_FIRST');
  assert.equal(b.attempt.requestId,a.attempt.requestId);
  assert.equal((await db.listAttempts('q1')).length,1);
  db.close();
}));
test('interrupted operation remains UNKNOWN after restart and never reclaims',withDb(async e=>{
  let db=e.open(); await seed(db); await approve(db);
  const a=await db.claimOperation(claim());
  db.close(); db=e.open();
  assert.equal(await db.recoverInterrupted(),1);
  assert.equal((await db.getAttempt(a.attempt.requestId)).state,'UNKNOWN');
  const duplicate=await db.claimOperation(claim());
  assert.equal(duplicate.action,'RECONCILE_GET_FIRST');
  assert.equal((await db.listAttempts('q1')).length,1);
  db.close();
}));
test('recovery does not mark APPROVED or PAID as UNKNOWN',withDb(async e=>{
  const db=e.open(); await seed(db); await approve(db);
  await db.claimOperation(claim());
  await db.recordApprovedOrderFromGet({...claim(),order:order()});
  assert.equal(await db.recoverInterrupted(),0);
  assert.equal((await db.listAttempts('q1'))[0].state,'APPROVED');
  db.close();
}));
test('synthetic GET observation rejects wrong order amount/quote and leaves state unchanged',withDb(async e=>{
  const db=e.open(); await seed(db); await approve(db);
  await db.claimOperation(claim());
  for(const bad of [
    {...order(),purchase_units:[{...order().purchase_units[0],
      amount:{currency_code:'USD',value:'99.00'}}]},
    {...order(),purchase_units:[{reference_id:'other',
      amount:{currency_code:'USD',value:'15.00'}}]},
    {...order(),status:'CREATED'},
  ]) {
    await assert.rejects(db.recordApprovedOrderFromGet({...claim(),order:bad}),
      {code:'ORDER_PROOF_MISMATCH'});
  }
  assert.equal((await db.listAttempts('q1'))[0].state,'IN_FLIGHT');
  db.close();
}));
test('synthetic approved order enables one capture claim only',withDb(async e=>{
  const db=e.open(); await seed(db); await approve(db);
  await db.claimOperation(claim());
  const observed=await db.recordApprovedOrderFromGet({...claim(),order:order()});
  assert.equal(observed.state,'APPROVED');
  assert.equal(observed.remoteId,'ORDER001');
  const first=await db.claimOperation(claim('capture'));
  const second=await db.claimOperation(claim('capture'));
  assert.equal(first.action,'FIRST_CLAIM_ONLY_NO_PROVIDER_CALL');
  assert.equal(second.action,'RECONCILE_GET_FIRST');
  assert.equal(second.attempt.requestId,first.attempt.requestId);
  assert.equal((await db.listAttempts('q1')).length,2);
  db.close();
}));
test('synthetic capture cannot be PAID without matching order/amount proof',withDb(async e=>{
  const db=e.open(); await seed(db); await approve(db);
  await db.claimOperation(claim());
  await db.recordApprovedOrderFromGet({...claim(),order:order()});
  await db.claimOperation(claim('capture'));
  await assert.rejects(db.recordCaptureFromGet({...claim(),order:order('COMPLETED'),
    capture:{...capture(),amount:{currency_code:'USD',value:'99.00'}}}),
    {code:'CAPTURE_PROOF_MISMATCH'});
  assert.notEqual((await db.listAttempts('q1')).find(x=>x.operation==='capture').state,'PAID');
  db.close();
}));
test('synthetic correct order and capture evidence can mark PAID, durable after reboot',withDb(async e=>{
  let db=e.open(); await seed(db); await approve(db);
  await db.claimOperation(claim()); await db.recordApprovedOrderFromGet({...claim(),order:order()});
  await db.claimOperation(claim('capture'));
  const paid=await db.recordCaptureFromGet({...claim(),order:order('COMPLETED'),capture:capture()});
  assert.equal(paid.state,'PAID');
  assert.equal(paid.remoteId,'CAP001');
  db.close(); db=e.open();
  assert.equal((await db.listAttempts('q1')).find(x=>x.operation==='capture').state,'PAID');
  assert.equal((await db.claimOperation(claim('capture'))).action,'RECONCILE_GET_FIRST');
  db.close();
}));
test('two SQLite connections race for same create; only one FIRST_CLAIM',withDb(async e=>{
  const db=e.open(), other=e.open();
  await seed(db); await approve(db);
  const [a,b]=await Promise.all([db.claimOperation(claim()),other.claimOperation(claim())]);
  const acts=[a.action,b.action].sort();
  assert.deepEqual(acts,['FIRST_CLAIM_ONLY_NO_PROVIDER_CALL','RECONCILE_GET_FIRST']);
  assert.equal((await db.listAttempts('q1')).length,1);
  other.close();db.close();
}));
test('two connections competing for quote approval: only one succeeds',withDb(async e=>{
  const db=e.open(), other=e.open();
  await seed(db);
  const results=await Promise.allSettled([approve(db),approve(other)]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(results.filter(x=>x.status==='rejected').length,1);
  assert.equal((await db.get('q1')).status,'APPROVED');
  other.close();db.close();
}));
test('read-only GET route uses durable repository and does not claim payment',withDb(async e=>{
  const db=e.open(); await seed(db);
  const api=createQuoteApi({repository:db,resolveSession:async()=>({
    verified:true,actorId:'owner',csrfToken:'secret',
  })});
  for(let i=0;i<3;i++) {
    const resp=await api(new Request('https://demo.example/api/quotes/q1'));
    assert.equal(resp.status,200);
  }
  assert.equal((await db.listAttempts('q1')).length,0);
  db.close();
}));
test('approval HTTP API writes to disk but payment POST remains 503',withDb(async e=>{
  let db=e.open(); await seed(db);
  const api=createQuoteApi({repository:db,resolveSession:async()=>({
    verified:true,actorId:'owner',csrfToken:'secret',
  })});
  const resp=await api(new Request('https://demo.example/api/quotes/q1/approve',{
    method:'POST',headers:{'content-type':'application/json','x-csrf-token':'secret',
      origin:'https://demo.example'},
    body:JSON.stringify({confirmed:true,expectedVersion:2,amountMinor:1500}),
  }));
  assert.equal(resp.status,200);
  const blocked=await api(new Request('https://demo.example/api/quotes/q1/orders',{
    method:'POST',headers:{'x-csrf-token':'secret',origin:'https://demo.example'},
  }));
  assert.equal(blocked.status,503);
  db.close();db=e.open();
  assert.equal((await db.get('q1')).approval.amountMinor,1500);
  assert.equal((await db.listAttempts('q1')).length,0);
  db.close();
}));

test('created order GET proof requires intent, bound payee and matching reference',withDb(async e=>{
 const db=e.open();try{
  await seed(db);await approve(db);await db.claimOperation(claim());
  const bad=[
   {...order('CREATED'),intent:undefined},
   {...order('CREATED'),purchase_units:[{...order().purchase_units[0],payee:null}]},
   {...order('CREATED'),purchase_units:[{...order().purchase_units[0],
     payee:{merchant_id:'foreign'}}]},
   {...order('CREATED'),purchase_units:[{...order().purchase_units[0],reference_id:'other'}]}
  ];
  for(const data of bad)
   await assert.rejects(db.recordCreatedOrderFromGet({...claim(),order:data}),
     {code:'ORDER_PROOF_MISMATCH'});
  assert.equal((await db.listAttempts('q1'))[0].remoteId,null);
 }finally{db.close();}
}));
test('approved order GET does not upgrade persisted attempt on omitted intent or wrong payee',withDb(async e=>{
 const db=e.open();try{
  await seed(db);await approve(db);await db.claimOperation(claim());
  for(const poisoned of [
   {...order(),intent:null},
   {...order(),purchase_units:[{...order().purchase_units[0],
     payee:{merchant_id:'foreign'}}]},
   {...order(),purchase_units:[{...order().purchase_units[0],payee:undefined}]},
  ]) await assert.rejects(db.recordApprovedOrderFromGet({...claim(),order:poisoned}),
   {code:'ORDER_PROOF_MISMATCH'});
  assert.equal((await db.listAttempts('q1'))[0].state,'IN_FLIGHT');
 }finally{db.close();}
}));
test('capture GET cannot persist PAID without nested matching capture proof',withDb(async e=>{
 const db=e.open();try{
  await seed(db);await approve(db);await db.claimOperation(claim());
  await db.recordApprovedOrderFromGet({...claim(),order:order()});
  await db.claimOperation(claim('capture'));
  const completed=order('COMPLETED');
  for(const changed of [
   {...completed,intent:undefined},
   {...completed,purchase_units:[{...completed.purchase_units[0],
     payee:{merchant_id:'foreign'}}]},
   {...completed,purchase_units:[{...completed.purchase_units[0],payments:{captures:[]}}]},
   {...completed,purchase_units:[{...completed.purchase_units[0],payments:{captures:[{
     ...completed.purchase_units[0].payments.captures[0],id:'FOREIGN'}]}}]},
   {...completed,purchase_units:[{...completed.purchase_units[0],payments:{captures:[{
     ...completed.purchase_units[0].payments.captures[0],status:'PENDING'}]}}]},
  ])await assert.rejects(db.recordCaptureFromGet({...claim(),order:changed,
   capture:capture()}));
  assert.equal((await db.listAttempts('q1')).find(x=>x.operation==='capture').state,
    'IN_FLIGHT');
 }finally{db.close();}
}));
