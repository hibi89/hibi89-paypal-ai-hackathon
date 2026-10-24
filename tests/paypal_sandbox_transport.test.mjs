import test from 'node:test';
import assert from 'node:assert/strict';
import { createSandboxTransport } from '../src/paypal_sandbox_transport.mjs';
import { requestKey, paypalRequestHeaderId } from '../src/payment_contract.mjs';
const q={id:'quote-demo',merchantId:'sandbox_merchant',version:2,currency:'USD',
  approval:{decision:'APPROVED',quoteVersion:2,actorId:'synthetic',amountMinor:1500}};
const claim=operation=>({action:'FIRST_CLAIM_ONLY_NO_PROVIDER_CALL',attempt:{
  operation,quoteId:q.id,quoteVersion:q.version,merchantId:q.merchantId,
  requestId:requestKey(q,operation),
  amountMinor:1500,currency:'USD',state:'IN_FLIGHT'}});
function stub({getStatus='CREATED',value='15.00',linkHost='www.sandbox.paypal.com',
  failAt=null,getOverride=null}={}) {
  const calls=[];
  const transport=createSandboxTransport({
    clientId:'SYNTHETIC_TEST_ID',clientSecret:'SYNTHETIC_TEST_SECRET',
    async fetchImpl(url,options) {
      calls.push({url,method:options.method,headers:options.headers,body:options.body,
        signal:options.signal});
      if(failAt&&url.endsWith(failAt))throw Error('network reset');
      if(url.endsWith('/v1/oauth2/token'))
        return {status:200,json:async()=>({access_token:'SYNTHETIC_TOKEN',token_type:'Bearer'})};
      if(options.method==='POST'&&url.endsWith('/v2/checkout/orders'))
        return {status:201,json:async()=>({
          id:'ORDER0001',status:'CREATED',links:[{
            rel:'payer-action',href:'https://'+linkHost+'/checkoutnow?token=ORDER0001',
          }],
        })};
      if(options.method==='GET'&&url.endsWith('/v2/checkout/orders/ORDER0001'))
        return {status:200,json:async()=>{
          const result={id:'ORDER0001',intent:'CAPTURE',status:getStatus,
            purchase_units:[{reference_id:q.id,
              payee:{merchant_id:q.merchantId},
              amount:{currency_code:'USD',value}}]};
          return getOverride?getOverride(result):result;
        }};
      if(options.method==='POST'&&url.endsWith('/v2/checkout/orders/ORDER0001/capture'))
        return {status:201,json:async()=>({id:'ORDER0001',status:'COMPLETED'})};
      throw Error('UNEXPECTED_TEST_ROUTE');
    },
  });
  return {transport,calls};
}
test('cannot set live URL, environment, omit private credentials or omit explicit transport',()=>{
  for(const opt of [
    {baseUrl:'https://api-m.paypal.com'},
    {environment:'live'},
    {clientId:'synthetic',clientSecret:'synthetic'},
  ]) assert.throws(()=>createSandboxTransport(opt));
});
test('create requires a durable first-claim marker before any HTTP',async()=>{
  const {transport,calls}=stub();
  await assert.rejects(transport.createOrderOnce(q,{}),
    {code:'DURABLE_FIRST_CLAIM_REQUIRED'});
  assert.equal(calls.length,0);
});
test('create uses sandbox OAuth and PayPal-Request-Id, then validates GET',async()=>{
  const {transport,calls}=stub();
  const result=await transport.createOrderOnce(q,claim('create'));
  assert.equal(result.paymentState,'NOT_PAID');
  assert.equal(result.orderStatus,'CREATED');
  assert.match(result.payerUrl,/www\.sandbox\.paypal\.com/);
  assert.ok(calls.length>=3);
  assert.ok(calls.every(x=>x.url.startsWith('https://api-m.sandbox.paypal.com/')));
  const create=calls.find(x=>x.method==='POST'&&x.url.endsWith('/v2/checkout/orders'));
  assert.equal(create.headers['PayPal-Request-Id'],paypalRequestHeaderId(requestKey(q,'create')));
  assert.equal(Buffer.byteLength(create.headers['PayPal-Request-Id'],'utf8'),38);
  assert.equal(JSON.parse(create.body).purchase_units[0].amount.value,'15.00');
  assert.ok(!JSON.stringify(result).includes('SYNTHETIC_TOKEN'));
});
test('wrong order amount fails before showing sandbox approval link',async()=>{
  const {transport}=stub({value:'99.00'});
  await assert.rejects(transport.createOrderOnce(q,claim('create')),
    {code:'SANDBOX_ORDER_MISMATCH'});
});
test('live or fake approval link is rejected',async()=>{
  const {transport}=stub({linkHost:'www.paypal.com'});
  await assert.rejects(transport.createOrderOnce(q,claim('create')),
    {code:'UNSAFE_APPROVAL_LINK'});
});
test('capture requires approved GET, not redirect/CREATED response',async()=>{
  const {transport,calls}=stub({getStatus:'CREATED'});
  await assert.rejects(transport.captureOnce(q,claim('capture'),'ORDER0001'),
    {code:'PAYPAL_APPROVAL_REQUIRED'});
  assert.equal(calls.filter(x=>x.url.endsWith('/capture')).length,0);
});
test('capture gets latest approved order and returns UNKNOWN_PENDING_GET, not paid',async()=>{
  const {transport,calls}=stub({getStatus:'APPROVED'});
  const result=await transport.captureOnce(q,claim('capture'),'ORDER0001');
  assert.equal(result.paymentState,'UNKNOWN_AWAITING_GET');
  const capture=calls.find(x=>x.url.endsWith('/capture'));
  assert.equal(capture.headers['PayPal-Request-Id'],paypalRequestHeaderId(requestKey(q,'capture')));
  assert.equal(Buffer.byteLength(capture.headers['PayPal-Request-Id'],'utf8'),38);
  assert.equal(capture.method,'POST');
});
test('capture will not run if first claim is forged or wrong operation',async()=>{
  const {transport,calls}=stub({getStatus:'APPROVED'});
  await assert.rejects(transport.captureOnce(q,claim('create'),'ORDER0001'),
    {code:'DURABLE_FIRST_CLAIM_REQUIRED'});
  assert.equal(calls.length,0);
});
test('network loss after create POST exposes ambiguous state and does not retry',async()=>{
  const {transport,calls}=stub({failAt:'/v2/checkout/orders'});
  await assert.rejects(transport.createOrderOnce(q,claim('create')),
    {code:'SANDBOX_POST_OUTCOME_UNKNOWN'});
  assert.equal(calls.filter(x=>x.method==='POST'&&x.url.endsWith('/v2/checkout/orders')).length,1);
});
test('network loss during capture POST does not retry',async()=>{
  const {transport,calls}=stub({getStatus:'APPROVED',failAt:'/capture'});
  await assert.rejects(transport.captureOnce(q,claim('capture'),'ORDER0001'),
    {code:'SANDBOX_POST_OUTCOME_UNKNOWN'});
  assert.equal(calls.filter(x=>x.url.endsWith('/capture')).length,1);
});
test('invalid order ID cannot cause arbitrary URL request',async()=>{
  const {transport,calls}=stub();
  await assert.rejects(transport.getOrder(q,'../../v1/oauth2/token'),
    {code:'INVALID_ORDER_ID'});
  assert.equal(calls.length,0);
});

test('every Sandbox OAuth, create, GET and capture request uses a bounded AbortSignal',async()=>{
  const {transport,calls}=stub({getStatus:'APPROVED'});
  await transport.createOrderOnce(q,claim('create'));
  await transport.captureOnce(q,claim('capture'),'ORDER0001');
  assert.ok(calls.length>=7);
  assert.ok(calls.every(item=>item.signal instanceof AbortSignal && !item.signal.aborted));
});


test('missing merchant binding and mismatched claim merchant reject before OAuth or payment POST',async()=>{
 const {transport,calls}=stub();
 await assert.rejects(transport.createOrderOnce({...q,merchantId:null},claim('create')),
   {code:'SANDBOX_MERCHANT_BINDING_REQUIRED'});
 await assert.rejects(transport.captureOnce({...q,merchantId:null},claim('capture'),'ORDER0001'),
   {code:'SANDBOX_MERCHANT_BINDING_REQUIRED'});
 await assert.rejects(transport.getOrder({...q,merchantId:undefined},'ORDER0001'),
   {code:'SANDBOX_MERCHANT_BINDING_REQUIRED'});
 const forged={...claim('create'),attempt:{...claim('create').attempt,merchantId:'foreign_merchant'}};
 await assert.rejects(transport.createOrderOnce(q,forged),
   {code:'DURABLE_FIRST_CLAIM_REQUIRED'});
 assert.equal(calls.length,0);
});
test('GET refuses omitted or forged CAPTURE intent even when PayPal returns APPROVED',async()=>{
 for(const intent of [undefined,'AUTHORIZE','INVALID']){
  const {transport,calls}=stub({getStatus:'APPROVED',getOverride:o=>{
    if(intent===undefined)delete o.intent;
    else o.intent=intent;
    return o;
  }});
  await assert.rejects(transport.captureOnce(q,claim('capture'),'ORDER0001'),
    {code:'SANDBOX_ORDER_MISMATCH'});
  assert.equal(calls.filter(x=>x.url.endsWith('/capture')).length,0);
 }
});
test('GET refuses missing or foreign merchant payee before capture POST',async()=>{
 for(const seller of [undefined,'foreign_merchant']){
  const {transport,calls}=stub({getStatus:'APPROVED',getOverride:o=>{
    if(seller===undefined)delete o.purchase_units[0].payee;
    else o.purchase_units[0].payee.merchant_id=seller;
    return o;
  }});
  await assert.rejects(transport.captureOnce(q,claim('capture'),'ORDER0001'),
    {code:'SANDBOX_ORDER_MISMATCH'});
  assert.equal(calls.filter(x=>x.url.endsWith('/capture')).length,0);
 }
});
test('created order already reported COMPLETED by GET never returns misleading NOT_PAID approval link',async()=>{
 const {transport}=stub({getStatus:'COMPLETED'});
 await assert.rejects(transport.createOrderOnce(q,claim('create')),
   {code:'SANDBOX_CREATE_GET_STATUS_CONFLICT'});
});
test('synthetic COMPLETED order with uncompleted capture cannot yield capture proof',async()=>{
 const {transport}=stub({getStatus:'COMPLETED',getOverride:o=>{
  o.purchase_units[0].payments={captures:[{
   id:'CAPTURE0001',status:'PENDING',
   amount:{currency_code:'USD',value:'15.00'}
  }]};
  return o;
 }});
 await assert.rejects(transport.getCaptureProof(q,'ORDER0001'),
   {code:'SANDBOX_CAPTURE_PROOF_MISMATCH'});
});
test('valid authenticated synthetic GET remains usable with bound merchant and strict intent',async()=>{
 const {transport,calls}=stub({getStatus:'APPROVED'});
 const got=await transport.getOrder(q,'ORDER0001');
 assert.equal(got.intent,'CAPTURE');
 assert.equal(got.purchase_units[0].payee.merchant_id,q.merchantId);
 assert.equal(calls.filter(x=>x.method==='GET').length,1);
});
