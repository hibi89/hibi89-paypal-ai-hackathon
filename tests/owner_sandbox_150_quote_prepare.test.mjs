// Only temporary SQLite fixtures; no outbound Gemini, PayPal or purchase.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareFreshOwnerSandbox150Quote} from '../src/owner_sandbox_150_quote_prepare.mjs';
import {inspectOwnerProposedA2AQuote} from '../src/owner_private_a2a_quote_binding.mjs';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';

const actorId='owner_local',merchantId='A1B2C3D4E5F6G',quoteId='worknova_a2a_150_once';
const dir=()=>mkdtempSync(join(tmpdir(),'worknova-owner-150-prep-'));
const args=privateDirectory=>({privateDirectory,actorId,merchantId,quoteId});
test('isolated private $1.50 new PROPOSED quote requires no provider, approval or payment',async()=>{
 const root=dir();
 try{
  const privateDirectory=join(root,'brand-new');
  const result=await prepareFreshOwnerSandbox150Quote(args(privateDirectory));
  assert.equal(result.status,'OWNER_PRIVATE_PROPOSED_QUOTE_CREATED');
  assert.equal(result.quoteHumanApproved,false);
  assert.equal(result.networkRequests,0);
  assert.equal(result.paypalCapturePerformed,false);
  const filename=join(privateDirectory,'owner-sandbox150-part1.sqlite');
  const binding=inspectOwnerProposedA2AQuote({filename,actorId,merchantId,quoteId});
  assert.equal(binding.quoteFingerprint,result.quoteFingerprint);
  assert.equal(binding.amountMinor,150);
  const ledger=createSqliteLedger({filename});
  try{
   const quote=await ledger.get(quoteId);
   assert.equal(quote.status,'PROPOSED');
   assert.equal(quote.approval,null);
   assert.equal(quote.version,1);
   assert.equal(quote.merchantId,merchantId);
   assert.deepEqual(await ledger.listAttempts(quoteId),[]);
   const member=await ledger.getLocalMember(actorId);
   assert.equal(member.role,'buyer');assert.equal(member.active,true);
  }finally{ledger.close()}
 }finally{rmSync(root,{recursive:true,force:true})}
});
test('repeated preparation NEVER overwrites an existing private Part1 quote DB',async()=>{
 const root=dir();
 try{
  const privateDirectory=join(root,'once');
  await prepareFreshOwnerSandbox150Quote(args(privateDirectory));
  const filename=join(privateDirectory,'owner-sandbox150-part1.sqlite');
  const bytes=readFileSync(filename);
  await assert.rejects(
   prepareFreshOwnerSandbox150Quote(args(privateDirectory)),
   {code:'OWNER_SANDBOX150_EXISTING_DB_REVIEW_REQUIRED'}
  );
  assert.deepEqual(readFileSync(filename),bytes);
 }finally{rmSync(root,{recursive:true,force:true})}
});
test('invalid owner or merchant cannot create a directory or database',async()=>{
 const root=dir();
 try{
  for(const [i,change] of [
   {merchantId:'fake'},
   {actorId:'bad actor'},
   {quoteId:'bad/quote'}
  ].entries()){
   const privateDirectory=join(root,'not-created-'+i);
   await assert.rejects(
    prepareFreshOwnerSandbox150Quote({...args(privateDirectory),...change}),
    {code:'OWNER_SANDBOX150_PREPARE_SCOPE_REQUIRED'}
   );
   assert.equal(existsSync(privateDirectory),false);
  }
 }finally{rmSync(root,{recursive:true,force:true})}
});
test('owner preparation CLI remains strictly no-write without private TTY consent',()=>{
 const root=dir();
 try{
  const cli=fileURLToPath(new URL('../scripts/prepare_owner_sandbox_150_quote.mjs',import.meta.url));
  const initial=readdirSync(root).sort();
  for(const argv of [[],['--create-fresh-proposal'],
   ['--create-fresh-proposal','--unexpected']]){
   const run=spawnSync(process.execPath,
    ['--experimental-sqlite',cli,...argv],{
     encoding:'utf8',timeout:15000,
     env:{...process.env,HOME:root,USERPROFILE:root,
      NODE_NO_WARNINGS:'1',
      WORKNOVA_SANDBOX_MERCHANT_ID:merchantId,
      GEMINI_API_KEY:'FAKE_ONLY_SENTINEL_NO_CALL'}
    });
   assert.equal(run.error,undefined);
   assert.equal(run.stderr,'');
   const result=JSON.parse(run.stdout);
   assert.equal(result.status,argv.length===1?
    'PRIVATE_TTY_REQUIRED':'DRY_RUN_NO_DISK_NO_NETWORK');
   assert.equal(result.networkRequests,0);
   assert.equal(result.paymentAuthorized,false);
   assert.equal(result.geminiPostPerformed,false);
   assert.doesNotMatch(run.stdout,/FAKE_ONLY_SENTINEL_NO_CALL/);
  }
  assert.deepEqual(readdirSync(root).sort(),initial);
 }finally{rmSync(root,{recursive:true,force:true})}
});
