import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {inspectLocalEvidence} from '../src/local_evidence_inspector.mjs';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';

test('read-only SQLite observation reflects approved state, tenant isolation, and local-only proof',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'paypal-evidence-test-'));
  const filename=join(folder,'audit.sqlite');
  const ledger=createSqliteLedger({filename});
  try {
    await ledger.insertQuote({id:'private-a',ownerId:'tenant-a',merchantId:'merchant-a'});
    await ledger.insertQuote({id:'private-b',ownerId:'tenant-b',merchantId:'merchant-b'});
    const prior=inspectLocalEvidence({filename,actorId:'tenant-a',merchantId:'merchant-a'});
    assert.equal(prior.dbvoraInspired.integrity,'PASS');
    assert.equal(prior.dbvoraInspired.readOnly,true);
    assert.deepEqual(prior.dbvoraInspired.tables.map(t=>t.present),[true,true,true]);
    assert.deepEqual(prior.businessIntelligence.quotes,{total:1,approved:0,proposed:1});
    assert.equal(prior.businessIntelligence.humanApprovalRate.percentage,0);
    const absent=inspectLocalEvidence({filename,actorId:'tenant-a',merchantId:'merchant-b'});
    assert.equal(absent.businessIntelligence.quotes.total,0);
    assert.equal(absent.businessIntelligence.humanApprovalRate.percentage,null);
    await ledger.approve({id:'private-a',expectedVersion:1,actorId:'tenant-a',amountMinor:1500});
    const claim=await ledger.claimOperation({
      quoteId:'private-a',actorId:'tenant-a',merchantId:'merchant-a',operation:'create'
    });
    await ledger.markUnknown(claim.attempt.requestId);
    const after=inspectLocalEvidence({filename,actorId:'tenant-a',merchantId:'merchant-a'});
    assert.deepEqual(after.businessIntelligence.quotes,{total:1,approved:1,proposed:0});
    assert.equal(after.businessIntelligence.humanApprovalRate.percentage,100);
    assert.equal(after.businessIntelligence.paymentAttempts.total,1);
    assert.equal(after.businessIntelligence.paymentAttempts.createClaims,1);
    assert.equal(after.businessIntelligence.paymentAttempts.unresolved,1);
    assert.equal(after.businessIntelligence.providerTransactionsMeasured,false);
    assert.equal(after.soviaStyle.checks.find(c=>c.rule==='PAYMENT_OUTCOME_UNRESOLVED').status,'NEEDS_REVIEW');
    assert.equal(JSON.stringify(after).includes('private-a'),false);
    assert.equal(JSON.stringify(after).includes('tenant-a'),false);
    assert.equal(JSON.stringify(after).includes('merchant-a'),false);
  } finally {ledger.close();rmSync(folder,{recursive:true,force:true});}
});
test('evidence inspector never creates a DB if path does not exist',()=>{
  const folder=mkdtempSync(join(tmpdir(),'paypal-evidence-no-create-'));
  const filename=join(folder,'not-existent.sqlite');
  try {
    assert.throws(()=>inspectLocalEvidence({
      filename,actorId:'tenant-a',merchantId:'merchant-a'
    }));
    assert.throws(()=>statSync(filename));
  }finally{rmSync(folder,{recursive:true,force:true});}
});
test('HTTP GET evidence view scopes owner and never marks paid',async()=>{
  const demo=await startOfflineDemo({testReviewSessions:true});
  try {
    const url=demo.url+'/api/demo/evidence';
    const res=await fetch(url);
    assert.equal(res.status,200);
    assert.equal(res.headers.get('cache-control'),'no-store');
    const body=await res.json();
    assert.equal(body.mode,'OFFLINE_SYNTHETIC');
    assert.equal(body.dbvoraInspired.readOnly,true);
    assert.equal(body.businessIntelligence.quotes.total,1);
    assert.equal(body.businessIntelligence.paymentAttempts.total,0);
    assert.equal(body.businessIntelligence.providerTransactionsMeasured,false);
    assert.equal((await fetch(url,{headers:{cookie:demo.testReviewerCookie}})).status,404);
    assert.equal((await fetch(url,{method:'POST'})).status,405);
    assert.equal((await fetch(demo.url+'/demo/evidence.js')).status,200);
    assert.equal((await fetch(demo.url+'/api/quotes/sample-project/payment')).status,503);
  }finally{await demo.close();}
});


test('new local audit chain records quote, approval and payment state in SQLite',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'paypal-audit-chain-'));
 const filename=join(folder,'audit.sqlite');
 let ledger=createSqliteLedger({filename});
 try{
  await ledger.insertQuote({id:'qa1',ownerId:'u1',merchantId:'m1'});
  let read=inspectLocalEvidence({filename,actorId:'u1',merchantId:'m1'});
  assert.equal(read.soviaStyle.audit.integrity,'PASS');
  assert.equal(read.soviaStyle.audit.ownerEvents,1);
  await ledger.approve({id:'qa1',actorId:'u1',expectedVersion:1,amountMinor:1500});
  const claim=await ledger.claimOperation({quoteId:'qa1',actorId:'u1',merchantId:'m1',
    operation:'create'});
  await ledger.markUnknown(claim.attempt.requestId);
  read=inspectLocalEvidence({filename,actorId:'u1',merchantId:'m1'});
  assert.equal(read.soviaStyle.audit.ownerEvents,4);
  assert.equal(read.soviaStyle.audit.verifiedEvents,4);
  assert.equal(read.soviaStyle.audit.integrity,'PASS');
  assert.equal(read.soviaStyle.checks.find(x=>x.rule==='LOCAL_AUDIT_HASH_CHAIN').status,'PASS');
  assert.equal(JSON.stringify(read).includes('qa1'),false);
  assert.equal(JSON.stringify(read).includes('m1'),false);
  ledger.close();ledger=null;
  ledger=createSqliteLedger({filename});
  read=inspectLocalEvidence({filename,actorId:'u1',merchantId:'m1'});
  assert.equal(read.soviaStyle.audit.verifiedEvents,4);
  assert.equal(read.soviaStyle.audit.integrity,'PASS');
 }finally{ledger?.close();rmSync(folder,{recursive:true,force:true})}
});
test('SQLite triggers reject mutation and deletion of audit rows',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'paypal-audit-no-update-'));
 const filename=join(folder,'audit.sqlite');
 const ledger=createSqliteLedger({filename});
 try{
  await ledger.insertQuote({id:'qa1',ownerId:'u1',merchantId:'m1'});
  const {DatabaseSync}=await import('node:sqlite');
  const db=new DatabaseSync(filename);
  try{
   assert.throws(()=>db.exec("UPDATE local_audit_events SET state='TAMPERED' WHERE seq=1"),
     /LOCAL_AUDIT_IMMUTABLE/);
   assert.throws(()=>db.exec("DELETE FROM local_audit_events WHERE seq=1"),
     /LOCAL_AUDIT_IMMUTABLE/);
  }finally{db.close()}
  assert.equal(inspectLocalEvidence({filename,actorId:'u1',merchantId:'m1'})
    .soviaStyle.audit.integrity,'PASS');
 }finally{ledger.close();rmSync(folder,{recursive:true,force:true})}
});
test('privileged audit row tampering is detected, NOT silently treated as PASS',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'paypal-audit-tamper-'));
 const filename=join(folder,'audit.sqlite');
 let ledger=createSqliteLedger({filename});
 try{
  await ledger.insertQuote({id:'qa1',ownerId:'u1',merchantId:'m1'});
  ledger.close();ledger=null;
  const {DatabaseSync}=await import('node:sqlite');
  const db=new DatabaseSync(filename);
  try{
   db.exec('DROP TRIGGER local_audit_deny_update');
   db.exec("UPDATE local_audit_events SET state='PAID' WHERE seq=1");
  }finally{db.close()}
  const report=inspectLocalEvidence({filename,actorId:'u1',merchantId:'m1'});
  assert.equal(report.soviaStyle.audit.integrity,'NEEDS_REVIEW');
  assert.equal(report.soviaStyle.audit.reason,'HASH_CHAIN_MISMATCH');
 }finally{ledger?.close();rmSync(folder,{recursive:true,force:true})}
});
test('audit tenant summary cannot enumerate other merchants',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'paypal-audit-tenant-'));
 const filename=join(folder,'audit.sqlite');
 const ledger=createSqliteLedger({filename});
 try{
  await ledger.insertQuote({id:'qa1',ownerId:'u1',merchantId:'m1'});
  await ledger.insertQuote({id:'qa2',ownerId:'u2',merchantId:'m2'});
  const own=inspectLocalEvidence({filename,actorId:'u1',merchantId:'m1'});
  const other=inspectLocalEvidence({filename,actorId:'u3',merchantId:'m3'});
  assert.equal(own.soviaStyle.audit.ownerEvents,1);
  assert.equal(other.soviaStyle.audit.ownerEvents,0);
  assert.equal(own.soviaStyle.audit.integrity,'PASS');
  assert.equal(JSON.stringify(own).includes('qa2'),false);
  assert.equal(JSON.stringify(own).includes('u2'),false);
 }finally{ledger.close();rmSync(folder,{recursive:true,force:true})}
});
