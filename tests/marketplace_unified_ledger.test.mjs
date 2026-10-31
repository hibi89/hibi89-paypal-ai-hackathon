import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createMarketplaceRecommendationStore} from '../src/marketplace_recommendation_store.mjs';
import {createLedgerMarketplaceSelectionStore} from '../src/marketplace_selection_store.mjs';
import {matchSyntheticMarketplaceSkills} from '../src/marketplace_match.mjs';

const owner='test-owner',merchant='test-merchant',quoteId='q1';
const brief='Build a website with PayPal checkout';
function fixture(fn){
 return async()=>{
  const folder=mkdtempSync(join(tmpdir(),'paypal-atomic-selection-'));
  const filename=join(folder,'ledger.sqlite');
  const recommendations=createMarketplaceRecommendationStore(join(folder,'recommendations.sqlite'));
  let ledger=createSqliteLedger({filename});
  try{
    await ledger.insertQuote({id:quoteId,ownerId:owner,merchantId:merchant});
    await fn({filename,ledger,recommendations,reopen:()=>{
      ledger.close();
      ledger=createSqliteLedger({filename});
      return ledger;
    }});
  }finally{recommendations.close();ledger.close();rmSync(folder,{recursive:true,force:true});}
 };
}
function prepare(recommendations){
 const skills=['web','payments'];
 const r=recommendations.start(owner,'ai_work',brief,skills);
 const match=matchSyntheticMarketplaceSkills(skills,{round:0,profileIds:r.roster[0]});
 const profile=match.profiles.find(x=>x.eligible);
 assert.ok(profile);
 return {r,profile,scope:brief+' [Synthetic candidate: '+profile.id+']'};
}
test('same SQLite file binds quote→candidate, approval→contract snapshot, restart and DB integrity',fixture(async({filename,ledger,recommendations,reopen})=>{
 const {r,profile,scope}=prepare(recommendations);
 const quote=await ledger.revise({id:quoteId,actorId:owner,expectedVersion:1,
   scope,suggestedMinor:1500,suggestionSource:'OFFLINE_MOCK'});
 const input={ownerId:owner,merchantId:merchant,quoteId,expectedQuoteVersion:quote.version,
   sessionId:r.id,round:1,profileId:profile.id};
 let bridge=createLedgerMarketplaceSelectionStore({quotes:ledger,recommendations});
 const first=await bridge.select(input);
 assert.equal(first.status,'BOUND');
 assert.equal(first.profileId,profile.id);
 assert.equal(first.paymentAuthorized,false);
 assert.deepEqual(await bridge.select(input),first); // replay does not create second row
 const observer=createSqliteLedger({filename});
 try{
   assert.equal((await observer.getMarketplaceCandidate({quoteId,ownerId:owner,merchantId:merchant})).profileId,profile.id);
   assert.equal(await observer.getMarketplaceCandidate({quoteId,ownerId:'foreign',merchantId:merchant}),null);
   await assert.rejects(observer.bindMarketplaceCandidate({...input,profileId:'synthetic-fraud',
     requiredSkills:['web'],scopeDigest:'a'.repeat(64)}),{code:'QUOTE_SCOPE_CANDIDATE_MISMATCH'});
 }finally{observer.close();}
 await ledger.approve({id:quoteId,actorId:owner,expectedVersion:quote.version,amountMinor:1500});
 const contract=await ledger.createContract({
   id:'contract1',quoteId,actorId:owner,merchantId:merchant,reviewerId:'reviewer',
   expectedVersion:quote.version,eventId:'contract-created',
   milestones:[{id:'milestone1',step:1,amountMinor:1500}]
 });
 assert.equal(contract.paymentState,'NOT_CAPTURED');
 let evidence=await ledger.getContractCandidate({contractId:'contract1',actorId:owner,merchantId:merchant});
 assert.equal(evidence.profileId,profile.id);
 assert.equal(evidence.quoteVersion,2);
 assert.equal(evidence.source,'LOCAL_SYNTHETIC_SNAPSHOT');
 assert.equal((await ledger.getContractCandidate({contractId:'contract1',actorId:'reviewer',merchantId:merchant})).profileId,profile.id);
 await assert.rejects(ledger.getContractCandidate({contractId:'contract1',actorId:'foreign',merchantId:merchant}),{code:'CONTRACT_NOT_FOUND'});
 ledger=reopen(); // existing SQLite is not wiped on restart
 evidence=await ledger.getContractCandidate({contractId:'contract1',actorId:owner,merchantId:merchant});
 assert.equal(evidence.profileId,profile.id);
 assert.equal((await ledger.getMarketplaceCandidate({ownerId:owner,merchantId:merchant,quoteId})).status,'BOUND');
 const sql=new DatabaseSync(filename);
 try{
   assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length,0);
   assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM quote_candidate_bindings').get().n,1);
   assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM contract_candidate_evidence').get().n,1);
   assert.throws(()=>sql.prepare("UPDATE contract_candidate_evidence SET profile_id='forged'").run(),/IMMUTABLE_CANDIDATE_EVIDENCE/);
 }finally{sql.close();}
 assert.equal((await ledger.listAttempts(quoteId)).length,0);
}));
test('direct ledger approve is fail-closed on stale candidate, despite bypassing HTTP guard',fixture(async({ledger,recommendations})=>{
 const {r,profile,scope}=prepare(recommendations);
 await ledger.revise({id:quoteId,actorId:owner,expectedVersion:1,
   scope,suggestedMinor:1200,suggestionSource:'OFFLINE_MOCK'});
 const bridge=createLedgerMarketplaceSelectionStore({quotes:ledger,recommendations});
 const selected={ownerId:owner,merchantId:merchant,quoteId,expectedQuoteVersion:2,
   sessionId:r.id,round:1,profileId:profile.id};
 await bridge.select(selected);
 await ledger.revise({id:quoteId,actorId:owner,expectedVersion:2,
   scope,suggestedMinor:1300,suggestionSource:'OFFLINE_MOCK'});
 await assert.rejects(ledger.approve({id:quoteId,actorId:owner,expectedVersion:3,amountMinor:1300}),
   {code:'QUOTE_SELECTION_STALE'});
 assert.equal((await ledger.get(quoteId)).status,'PROPOSED');
 await bridge.select({...selected,expectedQuoteVersion:3});
 await ledger.approve({id:quoteId,actorId:owner,expectedVersion:3,amountMinor:1300});
 assert.equal((await ledger.get(quoteId)).status,'APPROVED');
 assert.equal((await ledger.listAttempts(quoteId)).length,0);
}));
test('old standalone quotes without a candidate remain valid and expose no false evidence',fixture(async({ledger})=>{
 await ledger.approve({id:quoteId,actorId:owner,expectedVersion:1,amountMinor:100});
 const contract=await ledger.createContract({
   id:'legacy-contract',quoteId,actorId:owner,merchantId:merchant,reviewerId:'reviewer',
   expectedVersion:1,eventId:'legacy-create',milestones:[{id:'legacy-ms',step:1,amountMinor:100}]
 });
 assert.equal(contract.paymentState,'NOT_CAPTURED');
 assert.equal(await ledger.getContractCandidate({contractId:'legacy-contract',actorId:owner,merchantId:merchant}),null);
}));
