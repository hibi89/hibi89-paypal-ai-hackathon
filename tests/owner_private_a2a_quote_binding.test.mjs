// Pure local quote preflight; no API key, browser, provider or payment POST.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,symlinkSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {inspectOwnerProposedA2AQuote,
 fingerprintOwnerQuoteContract,resolveOwnerSandbox150QuoteScope}
 from '../src/owner_private_a2a_quote_binding.mjs';

const actor='owner',merchant='A1B2C3D4E5F6G',quoteId='real-pilot-proposal';
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'worknova-bind-quote-'));
 const filename=join(dir,'part1.sqlite');
 const ledger=createSqliteLedger({filename});
 const args={filename,actorId:actor,merchantId:merchant,quoteId};
 return {dir,filename,ledger,args,async seed(){
  await ledger.insertQuote({id:quoteId,ownerId:actor,merchantId:merchant});
 },close(){ledger.close();rmSync(dir,{recursive:true,force:true})}};
}
test('same buyer/merchant PROPOSED quote gives read-only $1.50 A2A binding',async()=>{
 const f=fixture();
 try{
  await f.seed();
  const before=await f.ledger.get(quoteId);
  const a=inspectOwnerProposedA2AQuote(f.args);
  const b=inspectOwnerProposedA2AQuote(f.args);
  assert.deepEqual(a,b);
  assert.equal(a.amountMinor,150);
  assert.equal(a.quoteStatus,'PROPOSED_NOT_PAYMENT_AUTHORITY');
  assert.equal(a.actorId,actor);
  assert.equal(a.merchantId,merchant);
  assert.equal(a.quoteId,quoteId);
  assert.equal(a.quoteVersion,1);
  assert.match(a.quoteFingerprint,/^[a-f0-9]{64}$/);
  assert.equal(a.quoteFingerprint,fingerprintOwnerQuoteContract(before));
  assert.deepEqual(await f.ledger.get(quoteId),before);
  assert.deepEqual(await f.ledger.listAttempts(quoteId),[]);
 }finally{f.close()}
});
test('wrong actor, merchant, fake merchant or unknown quote fails before model call',async()=>{
 const f=fixture();
 try{
  await f.seed();
  const wrong=[
   {...f.args,actorId:'other'},
   {...f.args,merchantId:'B1B2C3D4E5F6G'},
   {...f.args,merchantId:'fictional_merchant'},
   {...f.args,quoteId:'missing'}
  ];
  for(const value of wrong)assert.throws(
   ()=>inspectOwnerProposedA2AQuote(value)
  );
 }finally{f.close()}
});
test('already approved or revised quote cannot start this pre-approval negotiation',async()=>{
 const f=fixture();
 try{
  await f.seed();
  const initial=inspectOwnerProposedA2AQuote(f.args);
  await f.ledger.revise({id:quoteId,actorId:actor,
   expectedVersion:1,scope:'A revised fictional service',
   suggestedMinor:150,suggestionSource:'OFFLINE_MOCK'});
  const changed=inspectOwnerProposedA2AQuote(f.args);
  assert.notEqual(initial.quoteFingerprint,changed.quoteFingerprint);
  await f.ledger.approve({id:quoteId,actorId:actor,
   expectedVersion:2,amountMinor:150});
  assert.equal(changed.quoteFingerprint,
   fingerprintOwnerQuoteContract(await f.ledger.get(quoteId)));
  assert.throws(()=>inspectOwnerProposedA2AQuote(f.args),
   {code:'OWNER_A2A_UNAPPROVED_UNPAID_QUOTE_REQUIRED'});
 }finally{f.close()}
});
test('missing file and symbolic-link ledger fail without creating files',()=>{
 const dir=mkdtempSync(join(tmpdir(),'worknova-binding-file-'));
 try{
  const filename=join(dir,'no-such.sqlite');
  assert.throws(()=>inspectOwnerProposedA2AQuote({
   filename,actorId:actor,merchantId:merchant,quoteId
  }),{code:'OWNER_A2A_EXISTING_OUTSIDE_REPO_LEDGER_REQUIRED'});
  assert.equal(existsSync(filename),false);
  const dbFile=join(dir,'real.sqlite');
  const ledger=createSqliteLedger({filename:dbFile});
  ledger.close();
  const link=join(dir,'link.sqlite');
  symlinkSync(dbFile,link);
  assert.throws(()=>inspectOwnerProposedA2AQuote({
   filename:link,actorId:actor,merchantId:merchant,quoteId
  }),{code:'OWNER_A2A_EXISTING_OUTSIDE_REPO_LEDGER_REQUIRED'});
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test('single private $1.50 scope applies the same default ledger before and after model calls',async()=>{
 const f=fixture();
 try{
  const base=join(f.dir,'pilot-private');
  const {mkdirSync}=await import('node:fs');
  mkdirSync(base);
  const scope=resolveOwnerSandbox150QuoteScope({
   environment:{PAYPAL_SANDBOX_MERCHANT_ID:merchant},
   privateDirectory:base
  });
  assert.equal(scope.filename,join(base,'owner-sandbox150-part1.sqlite'));
  assert.equal(scope.actorId,'operator_owner');
  assert.equal(scope.quoteId,'worknova_a2a_150_once');
  assert.equal(scope.merchantId,merchant);
  assert.equal(Object.isFrozen(scope),true);
  assert.throws(()=>resolveOwnerSandbox150QuoteScope({
   environment:{WORKNOVA_SANDBOX_MERCHANT_ID:merchant,
    PAYPAL_SANDBOX_MERCHANT_ID:'B1B2C3D4E5F6G'},
   privateDirectory:base
  }),{code:'OWNER_A2A_MERCHANT_ENV_CONFLICT'});
  await f.seed();
  const override=resolveOwnerSandbox150QuoteScope({
   environment:{WORKNOVA_SANDBOX_MERCHANT_ID:merchant,
    WORKNOVA_OWNER_ACTOR_ID:actor,WORKNOVA_PILOT_QUOTE_ID:quoteId,
    WORKNOVA_OWNER_LEDGER_PATH:f.filename},
   privateDirectory:base
  });
  const before=inspectOwnerProposedA2AQuote(override);
  const after=inspectOwnerProposedA2AQuote(override);
  assert.equal(after.quoteFingerprint,before.quoteFingerprint);
  await f.ledger.revise({id:quoteId,actorId:actor,
   expectedVersion:1,scope:'Changed after model start',suggestedMinor:150,
   suggestionSource:'OFFLINE_MOCK'});
  assert.notEqual(inspectOwnerProposedA2AQuote(override).quoteFingerprint,
   before.quoteFingerprint);
 }finally{f.close()}
});
