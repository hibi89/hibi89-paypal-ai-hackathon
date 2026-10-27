import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync,writeFileSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createMarketplaceAiBudgetStore} from '../src/marketplace_ai_budget.mjs';
import {createPilotCheckoutSessionStore} from '../src/pilot_checkout_session_store.mjs';
import {inspectOwnerMvpLocalState,inspectOwnerMvpConfig}
  from '../src/owner_mvp_local_status.mjs';
const merchant='A1B2C3D4E5F6G',quoteId='operator_mvp_01';
const fixture=fn=>async()=>{const dir=mkdtempSync(join(tmpdir(),'mvp-state-'));
  try{await fn(dir)}finally{rmSync(dir,{force:true,recursive:true})}};
test('empty private directory is safe to inspect without creating DB files',
fixture(async dir=>{
 const before=readdirSync(dir);
 const r=inspectOwnerMvpLocalState({directory:dir});
 assert.equal(r.status,'CLEAN_LOCAL_ONE_SHOT');
 assert.equal(r.safeToStartNewAttempt,true);
 assert.equal(r.networkRequests,0);
 assert.equal(r.secretsRead,false);
 assert.deepEqual(readdirSync(dir),before);
}));
test('owner config reports presence and format only, never secret values',
()=>{
 const env={
  GEMINI_API_KEY:'SENTINEL_GEMINI_DO_NOT_ECHO',
  PAYPAL_SANDBOX_CLIENT_ID:'SENTINEL_CLIENT_DO_NOT_ECHO',
  PAYPAL_SANDBOX_CLIENT_SECRET:'NOT_A_REAL_SECRET',
  PAYPAL_SANDBOX_MERCHANT_ID:merchant,
  PAYPAL_PILOT_PUBLIC_ORIGIN:'https://sandbox-checkout.example.org'
 };
 const r=inspectOwnerMvpConfig({env});
 assert.equal(r.configShapeReady,true);
 assert.equal(r.actualGeminiFreeTierVerified,false);
 assert.equal(r.actualPayPalSandboxOAuthVerified,false);
 assert.equal(r.realProviderCalls,0);
 const rendered=JSON.stringify(r);
 assert.ok(!rendered.includes('SENTINEL'));
 assert.ok(!rendered.includes(merchant));
 assert.ok(!rendered.includes('sandbox-checkout.example.org'));
});
test('persisted quote and previously consumed AI prevent one-shot replay',
fixture(async dir=>{
 const db=createSqliteLedger({filename:join(dir,'checkout.sqlite')});
 await db.insertQuote({id:quoteId,ownerId:'local_operator',merchantId:merchant});
 db.close();
 const ai=createMarketplaceAiBudgetStore({filename:join(dir,'gemini_skills.sqlite')});
 ai.claim({actorId:'local_operator',merchantId:merchant,
  brief:'Fictional web application with test payments and checkout'});
 ai.close();
 const r=inspectOwnerMvpLocalState({directory:dir});
 assert.equal(r.status,'PREVIOUS_PRIVATE_ATTEMPT_REVIEW_REQUIRED');
 assert.equal(r.states.quote,'PROPOSED');
 assert.equal(r.states.gemini,'RESERVED');
 assert.equal(r.safeToStartNewAttempt,false);
 assert.equal(r.paymentRetryAllowed,false);
 assert.ok(!JSON.stringify(r).includes(merchant));
}));
test('durable payment claim blocks replay even without a provider order id',
fixture(async dir=>{
 const db=createSqliteLedger({filename:join(dir,'checkout.sqlite')});
 await db.insertQuote({id:quoteId,ownerId:'local_operator',merchantId:merchant});
 await db.approve({id:quoteId,actorId:'local_operator',expectedVersion:1,
  amountMinor:150});
 await db.claimOperation({quoteId,actorId:'local_operator',
  merchantId:merchant,operation:'create'});
 db.close();
 const r=inspectOwnerMvpLocalState({directory:dir});
 assert.equal(r.states.create,'IN_FLIGHT');
 assert.equal(r.safeToStartNewAttempt,false);
 assert.equal(r.userAction,'REVIEW_PROVIDER_AND_SQLITE_NO_AUTO_RETRY');
 assert.equal(r.priorRecordedCaptureIsFreshProviderProof,false);
}));
test('expired/revoked session still prevents unsafe replacement token',
fixture(async dir=>{
 const ledger=createSqliteLedger({filename:join(dir,'checkout.sqlite')});
 await ledger.insertQuote({id:quoteId,ownerId:'local_operator',merchantId:merchant});
 await ledger.approve({id:quoteId,actorId:'local_operator',
  expectedVersion:1,amountMinor:150});
 const quote=await ledger.get(quoteId);
 const store=createPilotCheckoutSessionStore({
  filename:join(dir,'checkout_sessions.sqlite'),
  now:()=>1800000000000
 });
 const principal={verified:true,actorId:'local_operator',merchantId:merchant};
 const {token}=store.issue({quote,principal});
 store.revoke({token,quote,principal});
 store.close();ledger.close();
 const r=inspectOwnerMvpLocalState({directory:dir,now:1800000000100});
 assert.equal(r.states.session,'REVOKED');
 assert.equal(r.safeToStartNewAttempt,false);
}));
test('corrupt SQLite and symbolic links fail closed instead of creating new files',
fixture(async dir=>{
 writeFileSync(join(dir,'checkout.sqlite'),'INVALID_DB_CONTENT');
 let r=inspectOwnerMvpLocalState({directory:dir});
 assert.equal(r.status,'UNREADABLE_PRIVATE_STATE_REVIEW_REQUIRED');
 assert.equal(r.safeToStartNewAttempt,false);
 rmSync(join(dir,'checkout.sqlite'));
 symlinkSync(join(dir,'other.file'),join(dir,'checkout.sqlite'));
 r=inspectOwnerMvpLocalState({directory:dir});
 assert.equal(r.status,'UNREADABLE_PRIVATE_STATE_REVIEW_REQUIRED');
}));
test('CLI prints sanitized read-only status with no provider credentials',
fixture(async dir=>{
 const {spawnSync}=await import('node:child_process');
 const cmd=new URL('../scripts/check_owner_mvp_local_status.mjs',import.meta.url);
 const env={...process.env,HOME:dir,USERPROFILE:dir,
  GEMINI_API_KEY:'NOT_A_REAL_SECRET',
  PAYPAL_SANDBOX_CLIENT_SECRET:'NOT_A_REAL_SECRET'};
 const result=spawnSync(process.execPath,['--experimental-sqlite',cmd.pathname],{
   env,encoding:'utf8',timeout:12000});
 assert.equal(result.status,0,result.stderr);
 const summary=JSON.parse(result.stdout.trim());
 assert.equal(summary.local.networkRequests,0);
 assert.equal(summary.local.safeToStartNewAttempt,true);
 assert.ok(!result.stdout.includes('NOT_A_REAL_SECRET'));
 assert.ok(!result.stderr.includes('NOT_A_REAL_SECRET'));
}));
