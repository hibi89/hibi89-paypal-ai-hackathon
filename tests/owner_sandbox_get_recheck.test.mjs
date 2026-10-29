import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createMarketplaceAiBudgetStore} from '../src/marketplace_ai_budget.mjs';
import {createPilotCheckoutSessionStore} from '../src/pilot_checkout_session_store.mjs';
import {readExistingSandboxClaim,recheckExistingSandboxGet}
  from '../src/owner_sandbox_get_recheck.mjs';

const merchant='A1B2C3D4E5F6G',orderId='FICTIONALORDER1',captureId='FICTIONALCAPTURE1';
const quoteId='operator_mvp_01',actorId='local_operator';
const brief='Build a fictional website with PayPal checkout and QA testing.';
const q=()=>({id:quoteId,ownerId:actorId,merchantId:merchant,version:1,
 currency:'USD',status:'APPROVED',
 approval:{decision:'APPROVED',quoteVersion:1,actorId,amountMinor:150}});
const validClaim=()=>({quote:q(),orderId,captureId});
function fakeProvider({status='COMPLETED',capture=captureId,order=orderId}={}){
 const calls=[];
 const fetchImpl=async(url,options)=>{
   const method=options.method;
   calls.push({method,url});
   if(url==='https://api-m.sandbox.paypal.com/v1/oauth2/token'&&method==='POST'){
     assert.equal(options.body,'grant_type=client_credentials');
     return {status:200,json:async()=>({
       access_token:'FAKE_ACCESS_FOR_TEST_ONLY',token_type:'Bearer'
     })};
   }
   if(url==='https://api-m.sandbox.paypal.com/v2/checkout/orders/'+orderId&&
     method==='GET'){
     return {status:200,json:async()=>({
       id:order,intent:'CAPTURE',status,
       purchase_units:[{reference_id:quoteId,payee:{merchant_id:merchant},
         amount:{currency_code:'USD',value:'1.50'},
         ...(status==='COMPLETED'?{payments:{captures:[{id:capture,
           status:'COMPLETED',amount:{currency_code:'USD',value:'1.50'}}]}}:{})
       }]
     })};
   }
   throw Error('UNEXPECTED_NETWORK_REQUEST_IN_TEST');
 };
 return {calls,fetchImpl};
}
async function seed(directory){
 const ledger=createSqliteLedger({filename:join(directory,'checkout.sqlite')});
 try{
   await ledger.insertQuote({id:quoteId,ownerId:actorId,merchantId:merchant});
   await ledger.approve({id:quoteId,actorId,expectedVersion:1,amountMinor:150});
   const quote=await ledger.get(quoteId);
   const session=createPilotCheckoutSessionStore({
     filename:join(directory,'checkout_sessions.sqlite')
   });
   session.issue({quote,principal:{verified:true,actorId,merchantId:merchant}});
   session.close();
   const input={quoteId,actorId,merchantId:merchant};
   await ledger.claimOperation({...input,operation:'create'});
   const result=state=>({id:orderId,intent:'CAPTURE',status:state,
     purchase_units:[{reference_id:quoteId,payee:{merchant_id:merchant},
       amount:{currency_code:'USD',value:'1.50'},
       ...(state==='COMPLETED'?{payments:{captures:[{id:captureId,
         status:'COMPLETED',amount:{currency_code:'USD',value:'1.50'}}]}}:{})
     }]});
   await ledger.recordApprovedOrderFromGet({...input,order:result('APPROVED')});
   await ledger.claimOperation({...input,operation:'capture'});
   await ledger.recordCaptureFromGet({...input,order:result('COMPLETED'),
      capture:{id:captureId,orderId,status:'COMPLETED',
       amount:{currency_code:'USD',value:'1.50'}}});
 }finally{ledger.close()}
 const ai=createMarketplaceAiBudgetStore({filename:join(directory,'gemini_skills.sqlite')});
 try{
   const scope={actorId,merchantId:merchant,brief};
   ai.claim(scope);
   ai.commit({...scope,skills:['web','payments','qa']});
 }finally{ai.close()}
}

test('no explicit authorization means zero claim reads, credentials or network',async()=>{
 let invoked=false;
 const response=await recheckExistingSandboxGet({
   authorized:false,clientId:'fakeid',clientSecret:'fakesecret',
   claimReader:()=>{invoked=true;throw Error('SHOULD_NOT_READ')},
   fetchImpl:()=>{invoked=true;throw Error('SHOULD_NOT_FETCH')}
 });
 assert.equal(response.status,'OWNER_AUTHORIZATION_REQUIRED_NO_NETWORK');
 assert.equal(response.externalProviderCalls,0);
 assert.equal(response.paymentPosts,0);
 assert.equal(invoked,false);
});

test('only consented OAuth and existing order GET match recorded capture with no payment POST',async()=>{
 const mock=fakeProvider();
 const output=await recheckExistingSandboxGet({
   authorized:true,claimReader:validClaim,
   clientId:'FAKE_TEST_CLIENT',clientSecret:'FAKE_TEST_KEY',
   fetchImpl:mock.fetchImpl
 });
 assert.equal(output.status,'EXISTING_SANDBOX_CAPTURE_RECHECKED_BY_AUTHENTICATED_GET');
 assert.equal(output.sandboxGetVerified,true);
 assert.equal(output.oauthPosts,1);
 assert.equal(output.orderGetRequests,1);
 assert.equal(output.paymentPosts,0);
 assert.equal(output.geminiCalls,0);
 assert.equal(output.submissionEligible,false);
 assert.deepEqual(mock.calls.map(x=>x.method),['POST','GET']);
 assert.equal(mock.calls.some(x=>x.url.includes('/capture')),false);
 const publicText=JSON.stringify(output);
 for(const privateValue of [merchant,orderId,captureId,'FAKE_TEST_CLIENT',
   'FAKE_TEST_KEY','FAKE_ACCESS_FOR_TEST_ONLY']){
   assert.equal(publicText.includes(privateValue),false);
 }
});

test('historical capture ID or order status mismatch fails without creating a new order',async()=>{
 for(const variant of [
   {capture:'DIFFERENT_CAPTURE'},{order:'DIFFERENT_ORDER'},
   {status:'APPROVED'}, {status:'PAYER_ACTION_REQUIRED'}
 ]){
   const mock=fakeProvider(variant);
   const x=await recheckExistingSandboxGet({
     authorized:true,claimReader:validClaim,
     clientId:'testid',clientSecret:'testsecret',fetchImpl:mock.fetchImpl
   });
   assert.equal(x.sandboxGetVerified,false);
   assert.equal(x.paymentPosts,0);
   assert.equal(x.automaticRetry,false);
   assert.ok(mock.calls.every(z=>z.url.endsWith('/oauth2/token')||
     z.method==='GET'));
 }
});

test('no credentials or unsafe stored claim must not contact provider',async()=>{
 const mock=fakeProvider();
 const missing=await recheckExistingSandboxGet({
   authorized:true,claimReader:validClaim,clientId:'',clientSecret:'x',
   fetchImpl:mock.fetchImpl
 });
 assert.equal(missing.externalProviderCalls,0);
 const unsafe=await recheckExistingSandboxGet({
   authorized:true,claimReader:()=>({...validClaim(),orderId:'../../evil'}),
   clientId:'testid',clientSecret:'testsecret',fetchImpl:mock.fetchImpl
 });
 assert.equal(unsafe.status,'EXISTING_CLAIM_UNSAFE');
 assert.equal(mock.calls.length,0);
});

test('existing private captured SQLite can be read immutably but never modified',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'get-recheck-readonly-'));
 try{
   await seed(directory);
   const before=readdirSync(directory).sort();
   const bytes=readFileSync(join(directory,'checkout.sqlite'));
   const claim=readExistingSandboxClaim(directory);
   assert.equal(claim.orderId,orderId);
   assert.equal(claim.captureId,captureId);
   assert.deepEqual(claim.quote.approval,{decision:'APPROVED',quoteVersion:1,
     actorId,amountMinor:150});
   assert.deepEqual(readdirSync(directory).sort(),before);
   assert.deepEqual(readFileSync(join(directory,'checkout.sqlite')),bytes);
   writeFileSync(join(directory,'checkout.sqlite-wal'),'FAKE_WAL');
   assert.throws(()=>readExistingSandboxClaim(directory),/READONLY_SANDBOX_/);
 }finally{rmSync(directory,{recursive:true,force:true})}
});

test('command line without explicit flags or interactive TTY cannot make provider calls',()=>{
 const script=fileURLToPath(new URL('../scripts/recheck_existing_sandbox_get.mjs',import.meta.url));
 const result=spawnSync(process.execPath,['--experimental-sqlite',script],{
   encoding:'utf8',timeout:12000,env:{
     PATH:process.env.PATH||'',HOME:process.env.HOME||'',
     PAYPAL_SANDBOX_CLIENT_ID:'DO_NOT_PRINT_SANDBOX_CLIENT',
     PAYPAL_SANDBOX_CLIENT_SECRET:'CANARY_NO_LEAK'
   }
 });
 assert.equal(result.status,2,result.stderr);
 const body=JSON.parse(result.stdout);
 assert.equal(body.status,'OWNER_AUTHORIZATION_REQUIRED_NO_NETWORK');
 assert.equal(body.privateFilesRead,false);
 assert.equal(body.paymentPosts,0);
 assert.doesNotMatch(result.stdout,/DO_NOT_PRINT_SANDBOX_/);
});
