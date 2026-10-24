import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteLedger } from '../src/sqlite_ledger.mjs';
import { createSandboxTransport } from '../src/paypal_sandbox_transport.mjs';
import { createSandboxPaymentOrchestrator } from '../src/payment_orchestrator.mjs';

const ctx={quoteId:'q1',actorId:'owner',merchantId:'merchant'};
function fixture({createLost=false,captureLost=false,invalidAmount=false,merchantMismatch=false,
  captureMismatch=false}={}){
  const dir=mkdtempSync(join(tmpdir(),'paypal-orchestration-'));
  const filename=join(dir,'ledger.sqlite');
  let ledger=createSqliteLedger({filename});
  const calls=[];
  const state={buyerApproved:false,captured:false,createLost,captureLost};
  const transport=createSandboxTransport({
    clientId:'TEST_ONLY_PUBLIC_ID',clientSecret:'TEST_ONLY_PRIVATE_PLACEHOLDER',
    async fetchImpl(url,options){
      calls.push({url,method:options.method,headers:options.headers});
      const end=path=>url.endsWith(path);
      if(end('/v1/oauth2/token'))
        return {status:200,json:async()=>({access_token:'TEST_TOKEN',token_type:'Bearer'})};
      if(options.method==='POST' && end('/v2/checkout/orders')){
        if(state.createLost) throw Error('request might have reached remote');
        return {status:201,json:async()=>({id:'ORDER42',status:'CREATED',links:[
          {rel:'payer-action',href:'https://www.sandbox.paypal.com/checkoutnow?token=ORDER42'},
        ]})};
      }
      if(options.method==='GET' && end('/v2/checkout/orders/ORDER42')){
        const status=state.captured?'COMPLETED':state.buyerApproved?'APPROVED':'CREATED';
        return {status:200,json:async()=>({
          id:'ORDER42',intent:'CAPTURE',status,
          purchase_units:[{
            reference_id:'q1',payee:{merchant_id:merchantMismatch?'other':'merchant'},
            amount:{currency_code:'USD',value:invalidAmount?'99.00':'15.00'},
            ...(state.captured ? {payments:{captures:[{
              id:'CAPTURE42',status:'COMPLETED',
              amount:{currency_code:'USD',value:captureMismatch?'30.00':'15.00'},
            }]}} : {}),
          }],
        })};
      }
      if(options.method==='POST' && end('/v2/checkout/orders/ORDER42/capture')){
        state.captured=true;
        if(state.captureLost) throw Error('response lost after remote capture');
        return {status:201,json:async()=>({id:'ORDER42',status:'COMPLETED'})};
      }
      throw new Error('UNEXPECTED_TEST_TRANSPORT');
    },
  });
  async function seed(){
    await ledger.insertQuote({id:'q1',ownerId:'owner',merchantId:'merchant',version:2});
    await ledger.approve({id:'q1',actorId:'owner',expectedVersion:2,amountMinor:1500});
  }
  const service=()=>createSandboxPaymentOrchestrator({ledger,transport});
  return {
    ledger:()=>ledger,service,calls,state,seed,
    restart(){ledger.close();ledger=createSqliteLedger({filename});},
    close(){ledger.close();rmSync(dir,{recursive:true,force:true});},
  };
}
const withFixture=(options,fn)=>async()=>{
  const f=fixture(options);
  try {await f.seed();await fn(f);}finally{f.close();}
};
const counts=(f,path)=>f.calls.filter(x=>x.method==='POST'&&x.url.endsWith(path)).length;

test('internal orchestrator rejects missing transport and exposes no public route',()=>{
  assert.throws(()=>createSandboxPaymentOrchestrator({}),{code:'DURABLE_LEDGER_REQUIRED'});
  const f=fixture();
  try {
    assert.throws(()=>createSandboxPaymentOrchestrator({ledger:f.ledger(),
      transport:{mode:'LIVE'}}),{code:'SANDBOX_TRANSPORT_REQUIRED'});
    assert.equal(f.service().publicHttpEnabled,false);
  }finally{f.close();}
});
test('quote requires approved matching actor and merchant; rejects before any network',
  withFixture({},async f=>{
    await assert.rejects(f.service().openOrder({...ctx,actorId:'other'}),
      {code:'QUOTE_NOT_FOUND'});
    await assert.rejects(f.service().openOrder({...ctx,merchantId:'other'}),
      {code:'QUOTE_NOT_FOUND'});
    assert.equal(f.calls.length,0);
  }));
test('single create POST stored as UNKNOWN with known order id; duplicate calls GET only',
  withFixture({},async f=>{
    const first=await f.service().openOrder(ctx);
    assert.equal(first.status,'BUYER_APPROVAL_PENDING');
    assert.match(first.approvalUrl,/sandbox\.paypal\.com/);
    const attempts=await f.ledger().listAttempts('q1');
    assert.equal(attempts.length,1);
    assert.equal(attempts[0].state,'UNKNOWN');
    assert.equal(attempts[0].remoteId,'ORDER42');
    assert.equal(counts(f,'/v2/checkout/orders'),1);
    const second=await f.service().openOrder(ctx);
    assert.equal(second.status,'BUYER_APPROVAL_PENDING');
    assert.equal(counts(f,'/v2/checkout/orders'),1);
  }));
test('second SQLite connection after restart never recreates same order',
  withFixture({},async f=>{
    await f.service().openOrder(ctx);
    f.restart();
    assert.equal((await f.service().openOrder(ctx)).status,'BUYER_APPROVAL_PENDING');
    assert.equal(counts(f,'/v2/checkout/orders'),1);
  }));
test('create network ambiguity with missing order id is operator-only, no repeat POST',
  withFixture({createLost:true},async f=>{
    const r=await f.service().openOrder(ctx);
    assert.equal(r.status,'UNKNOWN');
    const d=await f.ledger().listAttempts('q1');
    assert.equal(d[0].state,'UNKNOWN');
    assert.equal(d[0].remoteId,null);
    const again=await f.service().openOrder(ctx);
    assert.equal(again.status,'UNKNOWN');
    assert.match(again.detail,/OPERATOR/);
    assert.equal(counts(f,'/v2/checkout/orders'),1);
  }));
test('merchant mismatch on verified GET never persists accepted order',
  withFixture({merchantMismatch:true},async f=>{
    const r=await f.service().openOrder(ctx);
    assert.equal(r.status,'UNKNOWN');
    assert.equal((await f.ledger().listAttempts('q1'))[0].remoteId,null);
    assert.equal(counts(f,'/v2/checkout/orders'),1);
  }));
test('amount mismatch on verified GET cannot mark buyer approval or paid',
  withFixture({invalidAmount:true},async f=>{
    assert.equal((await f.service().openOrder(ctx)).status,'UNKNOWN');
    assert.equal((await f.ledger().listAttempts('q1'))[0].state,'UNKNOWN');
  }));
test('capture will not POST until buyer approval appears in fresh GET',
  withFixture({},async f=>{
    await f.service().openOrder(ctx);
    const r=await f.service().captureApproved(ctx);
    assert.equal(r.status,'BUYER_APPROVAL_PENDING');
    assert.equal(counts(f,'/capture'),0);
    assert.equal((await f.ledger().listAttempts('q1')).length,1);
  }));
test('buyer approval GET allows exactly one capture POST and GET proves PAID',
  withFixture({},async f=>{
    await f.service().openOrder(ctx);
    f.state.buyerApproved=true;
    const r=await f.service().captureApproved(ctx);
    assert.equal(r.status,'PAID');
    assert.equal(r.captureId,'CAPTURE42');
    assert.equal(counts(f,'/capture'),1);
    assert.equal((await f.service().captureApproved(ctx)).status,'PAID');
    assert.equal(counts(f,'/capture'),1);
    assert.equal((await f.ledger().listAttempts('q1')).find(x=>x.operation==='capture').state,'PAID');
  }));
test('capture POST response lost; GET reconciliation proves paid, not second POST',
  withFixture({captureLost:true},async f=>{
    await f.service().openOrder(ctx);
    f.state.buyerApproved=true;
    assert.equal((await f.service().captureApproved(ctx)).status,'PAID');
    assert.equal(counts(f,'/capture'),1);
    f.restart();
    assert.equal((await f.service().captureApproved(ctx)).status,'PAID');
    assert.equal(counts(f,'/capture'),1);
  }));
test('mismatched capture amount remains UNKNOWN, never paid or retry POST',
  withFixture({captureMismatch:true},async f=>{
    await f.service().openOrder(ctx);
    f.state.buyerApproved=true;
    const r=await f.service().captureApproved(ctx);
    assert.equal(r.status,'UNKNOWN');
    assert.equal(r.paymentState,'NOT_CONFIRMED');
    assert.equal((await f.ledger().listAttempts('q1')).find(x=>x.operation==='capture').state,'UNKNOWN');
    assert.equal(counts(f,'/capture'),1);
    await f.service().captureApproved(ctx);
    assert.equal(counts(f,'/capture'),1);
  }));
test('two concurrent calls to openOrder cause only one create POST',
  withFixture({},async f=>{
    const [a,b]=await Promise.all([
      f.service().openOrder(ctx),f.service().openOrder(ctx),
    ]);
    assert.equal(counts(f,'/v2/checkout/orders'),1);
    assert.ok(['UNKNOWN','BUYER_APPROVAL_PENDING'].includes(a.status));
    assert.ok(['UNKNOWN','BUYER_APPROVAL_PENDING'].includes(b.status));
    // Later safe GET can reconcile; nothing can rerun POST.
    assert.equal((await f.service().openOrder(ctx)).status,'BUYER_APPROVAL_PENDING');
  }));
