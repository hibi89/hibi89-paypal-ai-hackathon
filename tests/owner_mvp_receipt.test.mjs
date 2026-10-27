import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync,writeFileSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createMarketplaceAiBudgetStore} from '../src/marketplace_ai_budget.mjs';
import {inspectOwnerMvpReceipt} from '../src/owner_mvp_receipt.mjs';

const ID='operator_mvp_01',ACTOR='local_operator',MERCHANT='A1B2C3D4E5F6G';
const brief='Build a fictional website with PayPal checkout and QA testing.';
const fixture=fn=>async()=>{
  const directory=mkdtempSync(join(tmpdir(),'receipt-readonly-'));
  try{await fn(directory)}
  finally{rmSync(directory,{recursive:true,force:true})}
};
async function seed(directory,{paid=true,ai=true}={}){
 const ledger=createSqliteLedger({filename:join(directory,'checkout.sqlite')});
 await ledger.insertQuote({id:ID,ownerId:ACTOR,merchantId:MERCHANT});
 await ledger.approve({id:ID,actorId:ACTOR,expectedVersion:1,amountMinor:150});
 const inputs={quoteId:ID,actorId:ACTOR,merchantId:MERCHANT};
 await ledger.claimOperation({...inputs,operation:'create'});
 const order=(status='APPROVED')=>({
  id:'SYNTHETIC_ORDER_1',intent:'CAPTURE',status,
  purchase_units:[{reference_id:ID,payee:{merchant_id:MERCHANT},
   amount:{currency_code:'USD',value:'1.50'},
   ...(status==='COMPLETED'?{payments:{captures:[{
    id:'SYNTHETIC_CAPTURE_1',status:'COMPLETED',
    amount:{currency_code:'USD',value:'1.50'}
   }]}}:{})}]
 });
 await ledger.recordApprovedOrderFromGet({...inputs,order:order()});
 if(paid){
   await ledger.claimOperation({...inputs,operation:'capture'});
   await ledger.recordCaptureFromGet({...inputs,order:order('COMPLETED'),
    capture:{id:'SYNTHETIC_CAPTURE_1',orderId:'SYNTHETIC_ORDER_1',status:'COMPLETED',
      amount:{currency_code:'USD',value:'1.50'}}});
 }
 ledger.close();
 if(ai){
  const store=createMarketplaceAiBudgetStore({filename:join(directory,'gemini_skills.sqlite')});
  const scope={actorId:ACTOR,merchantId:MERCHANT,brief};
  store.claim(scope);
  store.commit({...scope,skills:['web','payments','qa']});
  store.close();
 }
}
test('empty directory is read-only and not a successful receipt',fixture(async directory=>{
 const before=readdirSync(directory);
 const r=inspectOwnerMvpReceipt({directory});
 assert.equal(r.status,'NO_LOCAL_ATTEMPT');
 assert.equal(r.providerGetPerformedNow,false);
 assert.equal(r.safeToRepeatPayment,false);
 assert.deepEqual(readdirSync(directory),before);
}));
test('matching local SQLite records produce sanitized receipt without remote recheck',fixture(async directory=>{
 await seed(directory);
 const before=readdirSync(directory).sort();
 const r=inspectOwnerMvpReceipt({directory});
 assert.equal(r.status,'LOCAL_PROVIDER_RESULT_RECORDED_NOT_FRESH_GET');
 assert.equal(r.localStates.capture,'PAID');
 assert.equal(r.localAuditIntegrity,'PASS');
 assert.ok(r.localAuditEvents>=4);
 assert.equal(r.currency,'USD');
 assert.equal(r.amountMinor,150);
 assert.deepEqual(r.classifiedSkills,['web','payments','qa']);
 assert.equal(r.providerGetPerformedNow,false);
 assert.equal(r.productionOrLivePaymentProof,false);
 assert.equal(r.freshRemotePaymentProof,false);
 assert.equal(r.safeToRepeatPayment,false);
 assert.deepEqual(readdirSync(directory).sort(),before);
 const output=JSON.stringify(r);
 for(const secret of [MERCHANT,ACTOR,'SYNTHETIC_ORDER_1',
 'SYNTHETIC_CAPTURE_1','checkoutnow','token','client_secret',
 brief,'A1B2C3D4'])assert.equal(output.includes(secret),false,secret);
}));
test('approved but uncaptured order fails closed',fixture(async directory=>{
 await seed(directory,{paid:false});
 const r=inspectOwnerMvpReceipt({directory});
 assert.equal(r.status,'LOCAL_EVIDENCE_REVIEW_REQUIRED');
 assert.equal(r.localStates.create,'APPROVED');
 assert.equal(r.localStates.capture,'ABSENT');
 assert.equal(r.amountMinor,null);
}));
test('paid ledger without committed AI result is not the combined MVP proof',fixture(async directory=>{
 await seed(directory,{ai:false});
 const r=inspectOwnerMvpReceipt({directory});
 assert.equal(r.status,'LOCAL_EVIDENCE_REVIEW_REQUIRED');
 assert.equal(r.localStates.capture,'PAID');
}));
test('corrupt and symlinked SQLite files cannot become paid evidence',fixture(async directory=>{
 await seed(directory);
 const f=join(directory,'checkout.sqlite');
 rmSync(f);
 writeFileSync(f,'NOT_SQLITE');
 let r=inspectOwnerMvpReceipt({directory});
 assert.equal(r.status,'LOCAL_EVIDENCE_REVIEW_REQUIRED');
 rmSync(f);
 symlinkSync(join(directory,'other.sqlite'),f);
 r=inspectOwnerMvpReceipt({directory});
 assert.equal(r.status,'LOCAL_EVIDENCE_REVIEW_REQUIRED');
}));
test('receipt CLI with no private DB performs zero network and does not echo secrets',
fixture(async directory=>{
 const {spawnSync}=await import('node:child_process');
 const path=new URL('../scripts/print_owner_mvp_receipt.mjs',import.meta.url);
 const result=spawnSync(process.execPath,['--experimental-sqlite',path.pathname],{
  env:{...process.env,HOME:directory,USERPROFILE:directory,
   GEMINI_API_KEY:'SENTINEL_DO_NOT_PRINT',
   PAYPAL_SANDBOX_CLIENT_SECRET:'SENTINEL_DO_NOT_PRINT'},
  encoding:'utf8',timeout:10000
 });
 assert.equal(result.status,2,result.stderr);
 assert.equal(JSON.parse(result.stdout).status,'NO_LOCAL_ATTEMPT');
 assert.ok(!result.stdout.includes('SENTINEL_DO_NOT_PRINT'));
 assert.ok(!result.stderr.includes('SENTINEL_DO_NOT_PRINT'));
}));
