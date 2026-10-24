import test from 'node:test';
import assert from 'node:assert/strict';
import {createSubscriptionSnapshot,planTrustedSubscriptionEvent}
  from '../src/subscription_contract.mjs';

const fresh=()=>createSubscriptionSnapshot({
  subscriptionId:'I-SUB123',merchantId:'merchant-1',planId:'P-PLAN123'});
const event=(type,id,time='2026-10-24T10:00:00Z',resourceId='I-SUB123')=>({
  id,event_type:type,create_time:time,resource:{id:resourceId}});
const created=()=>event('BILLING.SUBSCRIPTION.CREATED','WH-CREATED');
const activated=()=>event('BILLING.SUBSCRIPTION.ACTIVATED','WH-ACTIVE','2026-10-24T10:01:00Z');
const trusted={trusted:true};
test('snapshot starts UNKNOWN with no verified payment and rejects bad identity',()=>{
  const x=fresh();
  assert.equal(x.status,'UNKNOWN');assert.equal(x.paymentEvidence,'NOT_VERIFIED');
  assert.deepEqual(x.seenEventIds,[]);
  assert.throws(()=>createSubscriptionSnapshot({subscriptionId:'x',merchantId:'',planId:'p'}),
    {code:'INVALID_SUBSCRIPTION_IDENTITY'});
});
test('unverified webhook MUST fail closed before applying a lifecycle transition',()=>{
  assert.throws(()=>planTrustedSubscriptionEvent(fresh(),created()),
    {code:'UNVERIFIED_PAYPAL_WEBHOOK'});
  assert.throws(()=>planTrustedSubscriptionEvent(fresh(),created(),{trusted:false}),
    {code:'UNVERIFIED_PAYPAL_WEBHOOK'});
});
test('created→activated→suspended→activated→cancelled valid exact lifecycle',()=>{
  let x=fresh();
  const steps=[
    created(),activated(),
    event('BILLING.SUBSCRIPTION.SUSPENDED','WH-SUSPEND','2026-10-24T10:02:00Z'),
    event('BILLING.SUBSCRIPTION.ACTIVATED','WH-RESUME','2026-10-24T10:03:00Z'),
    event('BILLING.SUBSCRIPTION.CANCELLED','WH-CANCEL','2026-10-24T10:04:00Z')
  ];
  for(const [index,e] of steps.entries()){
    const prev=x,decision=planTrustedSubscriptionEvent(x,e,trusted);
    assert.equal(decision.action,'APPLY_VERIFIED_LIFECYCLE');
    assert.equal(prev.status,index===0?'UNKNOWN':['APPROVAL_PENDING','ACTIVE','SUSPENDED','ACTIVE'][index-1]);
    x=decision.snapshot;
    assert.equal(x.paymentEvidence,'NOT_VERIFIED');
  }
  assert.equal(x.status,'CANCELLED');assert.equal(x.seenEventIds.length,5);
});
test('does not mutate input; replay same event is idempotent planning',()=>{
  const x=fresh(),before=structuredClone(x);
  const first=planTrustedSubscriptionEvent(x,created(),trusted);
  assert.deepEqual(x,before);
  const replay=planTrustedSubscriptionEvent(first.snapshot,created(),trusted);
  assert.equal(replay.action,'IGNORE_DUPLICATE');
  assert.deepEqual(replay.snapshot,first.snapshot);
  replay.snapshot.seenEventIds.push('WH-TAMPER');
  assert.equal(first.snapshot.seenEventIds.length,1);
});
test('out-of-order and equal timestamps demand GET, never regress ACTIVE',()=>{
  const x=planTrustedSubscriptionEvent(fresh(),activated(),trusted).snapshot;
  const old=planTrustedSubscriptionEvent(x,created(),trusted);
  assert.equal(old.action,'RECONCILE_GET_FIRST');
  assert.equal(old.reason,'OUT_OF_ORDER_OR_SAME_TIMESTAMP');
  assert.equal(old.snapshot.status,'ACTIVE');
  const equal=planTrustedSubscriptionEvent(x,
    event('BILLING.SUBSCRIPTION.SUSPENDED','WH-SAME','2026-10-24T10:01:00Z'),trusted);
  assert.equal(equal.action,'RECONCILE_GET_FIRST');
});
test('terminal CANCELLED cannot reactivate on webhook alone',()=>{
  const cancelled=planTrustedSubscriptionEvent(fresh(),
    event('BILLING.SUBSCRIPTION.CANCELLED','WH-CAN'),trusted).snapshot;
  const again=planTrustedSubscriptionEvent(cancelled,activated(),trusted);
  assert.equal(again.action,'RECONCILE_GET_FIRST');
  assert.equal(again.reason,'ILLEGAL_OR_TERMINAL_TRANSITION');
  assert.equal(again.snapshot.status,'CANCELLED');
});
test('unknown→suspended without activation is refused',()=>{
  const d=planTrustedSubscriptionEvent(fresh(),
    event('BILLING.SUBSCRIPTION.SUSPENDED','WH-SUSPEND'),trusted);
  assert.equal(d.action,'RECONCILE_GET_FIRST');
  assert.equal(d.reason,'ILLEGAL_OR_TERMINAL_TRANSITION');
});
test('foreign subscription resource and forged id cannot affect state',()=>{
  const d=planTrustedSubscriptionEvent(fresh(),
    event('BILLING.SUBSCRIPTION.ACTIVATED','WH-FOREIGN',undefined,'I-FOREIGN'),trusted);
  assert.equal(d.action,'RECONCILE_GET_FIRST');
  assert.equal(d.reason,'SUBSCRIPTION_RESOURCE_MISMATCH');
});
test('payment failure and sale completion never mark subscription paid or inactive',()=>{
  const x=planTrustedSubscriptionEvent(fresh(),activated(),trusted).snapshot;
  for(const type of ['BILLING.SUBSCRIPTION.PAYMENT.FAILED',
    'PAYMENT.SALE.COMPLETED','PAYMENT.SALE.REVERSED','PAYMENT.SALE.REFUNDED']){
    const decision=planTrustedSubscriptionEvent(x,event(type,'WH-'+type.replace(/[^A-Z0-9_-]/g,'-')),trusted);
    assert.equal(decision.action,'RECONCILE_GET_FIRST');
    assert.equal(decision.snapshot.status,'ACTIVE');
    assert.equal(decision.snapshot.paymentEvidence,'NOT_VERIFIED');
    assert.equal(decision.reason,'ADVISORY_EVENT_REQUIRES_PROVIDER_GET');
  }
});
test('updated and unknown event types need provider GET; no implicit state change',()=>{
  const x=fresh();
  for(const type of ['BILLING.SUBSCRIPTION.UPDATED','BILLING.SUBSCRIPTION.MYSTERY']){
    const decision=planTrustedSubscriptionEvent(x,event(type,'WH-'+type.replace(/[^A-Z0-9_-]/g,'-')),trusted);
    assert.equal(decision.action,'RECONCILE_GET_FIRST');
    assert.equal(decision.snapshot.status,'UNKNOWN');
  }
});
test('invalid event identifiers and timestamp reject before changes',()=>{
  for(const bad of [
    {...created(),id:''},
    {...created(),create_time:'invalid'},
    {...created(),event_type:42},
    null]){
    assert.throws(()=>planTrustedSubscriptionEvent(fresh(),bad,trusted),
      {code:'INVALID_PAYPAL_EVENT'});
  }
});
test('capacity never forgets old event ids silently',()=>{
  const x=fresh();x.seenEventIds=Array.from({length:200},(_,i)=>'WH-'+i);
  const d=planTrustedSubscriptionEvent(x,created(),trusted);
  assert.equal(d.action,'RECONCILE_GET_FIRST');
  assert.equal(d.reason,'EVENT_TRACKING_CAPACITY_REACHED');
  assert.equal(d.snapshot.seenEventIds.length,200);
});
test('EXPIRED is a terminal subscription state without any money claim',()=>{
  const x=planTrustedSubscriptionEvent(fresh(),
    event('BILLING.SUBSCRIPTION.EXPIRED','WH-EXPIRE'),trusted).snapshot;
  assert.equal(x.status,'EXPIRED');
  assert.equal(x.paymentEvidence,'NOT_VERIFIED');
  assert.equal(planTrustedSubscriptionEvent(x,activated(),trusted).action,
    'RECONCILE_GET_FIRST');
});
