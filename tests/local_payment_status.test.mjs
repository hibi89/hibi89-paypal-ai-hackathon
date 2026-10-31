import test from 'node:test';
import assert from 'node:assert/strict';
import {projectLocalPaymentStatus} from '../src/local_payment_status.mjs';

const quote={id:'q',ownerId:'owner',merchantId:'merchant',version:2,
 status:'APPROVED',currency:'USD',
 approval:{actorId:'owner',quoteVersion:2,amountMinor:29900}};
const item=(operation,state,extra={})=>({
 quoteId:'q',quoteVersion:2,merchantId:'merchant',operation,state,
 amountMinor:29900,currency:'USD',remoteId:'PRIVATE_REMOTE_DO_NOT_EXPOSE',
 requestId:'PRIVATE_REQUEST_ID',...extra
});
test('no attempt is a safe local no-payment status, with no remote IDs',()=>{
 const result=projectLocalPaymentStatus({quote,attempts:[]});
 assert.equal(result.paymentState,'NO_PAYMENT_ATTEMPT');
 assert.equal(result.providerCalls,0);
 assert.equal(result.createOrCaptureEnabled,false);
 assert.equal(JSON.stringify(result).includes('PRIVATE_'),false);
});
test('read-only projections never turn local records into live verification',()=>{
 const scenarios=[
  [[item('create','IN_FLIGHT')],'ORDER_UNRESOLVED_NEEDS_PROVIDER_GET'],
  [[item('create','UNKNOWN')],'ORDER_UNRESOLVED_NEEDS_PROVIDER_GET'],
  [[item('create','APPROVED')],'ORDER_APPROVAL_RECORDED_NOT_LIVE_RECHECKED'],
  [[item('create','APPROVED'),item('capture','IN_FLIGHT')],'CAPTURE_UNRESOLVED_NEEDS_PROVIDER_GET'],
  [[item('create','APPROVED'),item('capture','UNKNOWN')],'CAPTURE_UNRESOLVED_NEEDS_PROVIDER_GET'],
  [[item('create','APPROVED'),item('capture','PAID')],'LOCAL_CAPTURE_PAID_RECORD_NOT_LIVE_RECHECKED']
 ];
 for(const [attempts,expected] of scenarios){
  const result=projectLocalPaymentStatus({quote,attempts});
  assert.equal(result.paymentState,expected);
  assert.equal(result.livePaymentVerifiedThisRead,false);
  assert.equal(result.paymentAuthorizedByRead,false);
  assert.equal(result.autoRetryAllowed,false);
  assert.equal(result.providerCalls,0);
  assert.equal(JSON.stringify(result).includes('PRIVATE_REMOTE'),false);
  assert.equal(JSON.stringify(result).includes('PRIVATE_REQUEST'),false);
 }
});
test('proposed quote is not approved and cannot contain payment attempts',()=>{
 const proposed={...quote,status:'PROPOSED',approval:null};
 assert.equal(projectLocalPaymentStatus({quote:proposed,attempts:[]}).paymentState,
  'QUOTE_NOT_APPROVED');
 assert.throws(()=>projectLocalPaymentStatus({
  quote:proposed,attempts:[item('create','UNKNOWN')]
 }),/LOCAL_PAYMENT_LEDGER_INVALID/);
});
test('cross-merchant, stale amount/version, illegal state and duplicate attempts fail closed',()=>{
 const bad=[
  [item('create','UNKNOWN',{merchantId:'other'})],
  [item('create','UNKNOWN',{quoteVersion:1})],
  [item('create','UNKNOWN',{amountMinor:1})],
  [item('create','PAID')],
  [item('capture','PAID')],
  [item('create','IN_FLIGHT'),item('capture','PAID')],
  [item('create','UNKNOWN'),item('create','UNKNOWN')],
  [item('create','WRONG')]
 ];
 for(const attempts of bad)
  assert.throws(()=>projectLocalPaymentStatus({quote,attempts}),
   /LOCAL_PAYMENT_LEDGER_INVALID/);
});
