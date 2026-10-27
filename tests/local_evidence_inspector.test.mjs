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
