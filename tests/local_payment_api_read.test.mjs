import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createQuoteApi} from '../src/quote_api.mjs';

test('actual SQLite quote API exposes redacted unresolved claims without provider GET/POST',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'ppl-pay-read-'));
 const ledger=createSqliteLedger({filename:join(folder,'ledger.sqlite')});
 let providerCalls=0,reads=0;
 try{
  await ledger.insertQuote({id:'quote-local',ownerId:'buyer',merchantId:'tenant'});
  await ledger.approve({id:'quote-local',actorId:'buyer',expectedVersion:1,amountMinor:150});
  const handle=createQuoteApi({repository:{
   get:id=>ledger.get(id),
   approve:args=>ledger.approve(args),
   listAttempts:async id=>{reads++;return ledger.listAttempts(id);}
  },resolveSession:async r=>({
   verified:true,actorId:r.headers.get('x-test-owner')||'buyer',
   merchantId:r.headers.get('x-test-merchant')||'tenant',
   csrfToken:'secret'
  })});
  const endpoint='http://127.0.0.1:8888/api/quotes/quote-local/payment';
  const get=headers=>handle(new Request(endpoint,{method:'GET',headers}));
  let response=await get();
  assert.equal(response.status,200);
  assert.equal((await response.json()).payment.paymentState,'NO_PAYMENT_ATTEMPT');
  const claimed=await ledger.claimOperation({
   quoteId:'quote-local',actorId:'buyer',merchantId:'tenant',operation:'create'
  });
  assert.equal(claimed.action,'FIRST_CLAIM_ONLY_NO_PROVIDER_CALL');
  response=await get();
  assert.equal(response.status,200);
  const unresolved=(await response.json()).payment;
  assert.equal(unresolved.paymentState,'ORDER_UNRESOLVED_NEEDS_PROVIDER_GET');
  assert.equal(unresolved.livePaymentVerifiedThisRead,false);
  assert.equal(unresolved.providerCalls,0);
  assert.equal(unresolved.autoRetryAllowed,false);
  assert.equal(JSON.stringify(unresolved).includes(claimed.attempt.requestId),false);
  assert.equal((await get({'x-test-merchant':'wrong'})).status,404);
  assert.equal((await get({'x-test-owner':'someone-else'})).status,404);
  await ledger.markUnknown(claimed.attempt.requestId);
  assert.equal((await (await get()).json()).payment.paymentState,
    'ORDER_UNRESOLVED_NEEDS_PROVIDER_GET');
  assert.equal((await ledger.listAttempts('quote-local'))[0].state,'UNKNOWN');
  assert.equal(providerCalls,0);
  assert.equal(reads>=3,true);
 }finally{ledger.close();rmSync(folder,{recursive:true,force:true});}
});
