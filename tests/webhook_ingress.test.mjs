import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createSign} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createWebhookInbox} from '../src/webhook_inbox.mjs';
import {createOfflineWebhookHandler,crc32Decimal} from '../src/webhook_ingress.mjs';

const webhookId='WH-REGISTERED-APP-123';
const certUrl='https://api.sandbox.paypal.com/v1/notifications/certs/CERT-ABCDEFGH12345678';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const keyPem=publicKey.export({type:'spki',format:'pem'});
const defaultTime='2026-10-24T09:00:00Z';
function env(){
  const dir=mkdtempSync(join(tmpdir(),'paypal-webhook-'));
  const file=join(dir,'events.sqlite');
  const db=createWebhookInbox({filename:file});
  db.registerSubscription({subscriptionId:'I-SUBTEST',merchantId:'MERCHANT',planId:'P-PLAN'});
  const makeHandler=(o={})=>createOfflineWebhookHandler({
    webhookId,certUrl,pinnedPublicKeyPem:keyPem,inbox:db,offlineOnly:true,...o});
  return {db,makeHandler,file,cleanup(){db.close();rmSync(dir,{recursive:true,force:true})}};
}
const event=(id='WH-ONE',type='BILLING.SUBSCRIPTION.CREATED',
  time='2026-10-24T08:59:59Z',subscription='I-SUBTEST')=>({
    id,event_type:type,create_time:time,resource:{id:subscription}});
function makeReq(body,overrides={}){
  const raw=Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body));
  const transmission=overrides.transmission||'T-TRANSMISSION-123';
  const time=overrides.time||defaultTime;
  const signature=createSign('RSA-SHA256')
    .update(transmission+'|'+time+'|'+(overrides.signWebhookId||webhookId)+'|'+crc32Decimal(raw),'utf8')
    .end().sign(overrides.privateKey||privateKey).toString('base64');
  const headers={
    'content-type':'application/json',
    'paypal-transmission-id':transmission,
    'paypal-transmission-time':time,
    'paypal-cert-url':certUrl,
    'paypal-auth-algo':'SHA256withRSA',
    'paypal-transmission-sig':signature,
    ...(overrides.headers||{})
  };
  return new Request('https://localhost/api/paypal/webhooks',{
    method:'POST',headers,body:overrides.rawBody||raw
  });
}
const read=async response=>({status:response.status,...await response.json()});
const withEnv=run=>async()=>{
 const e=env();
 try{await run(e)}finally{e.cleanup()}
};

test('D11 CRC32 decimal is over original bytes, not parsed/stringified JSON',()=>{
 assert.equal(crc32Decimal(Buffer.from('123456789')),'3421780262');
 const a=Buffer.from('{"a":1,"b":2}'),b=Buffer.from('{\n  "a": 1, "b": 2\n}');
 assert.notEqual(crc32Decimal(a),crc32Decimal(b));
});
test('handler refuses production mode, hostile cert URLs, missing RSA public key',withEnv(async e=>{
 assert.throws(()=>e.makeHandler({offlineOnly:false}),{code:'PRODUCTION_WEBHOOK_DISABLED'});
 for(const url of [
   'http://api.sandbox.paypal.com/v1/notifications/certs/CERT-ABCDEFGH12345678',
   'https://127.0.0.1/v1/notifications/certs/CERT-ABCDEFGH12345678',
   'https://api.sandbox.paypal.com.evil.test/v1/notifications/certs/CERT-ABCDEFGH12345678',
   'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-ABCDEFGH12345678?next=evil',
   'https://user@api.sandbox.paypal.com/v1/notifications/certs/CERT-ABCDEFGH12345678',
   'https://api.sandbox.paypal.com:8443/v1/notifications/certs/CERT-ABCDEFGH12345678'
 ])assert.throws(()=>e.makeHandler({certUrl:url}),{code:'INVALID_PINNED_CERT_URL'});
 assert.throws(()=>e.makeHandler({pinnedPublicKeyPem:'attacker'}),{code:'RSA_PINNED_KEY_REQUIRED'});
}));
test('cryptographically signed local fixture advances subscription; does not claim paid',withEnv(async e=>{
 const handle=e.makeHandler();
 const result=await read(await handle(makeReq(event())));
 assert.equal(result.status,200);assert.equal(result.code,'APPLY_VERIFIED_LIFECYCLE');
 assert.equal(e.db.getSubscription('I-SUBTEST').status,'APPROVAL_PENDING');
 assert.equal(e.db.getSubscription('I-SUBTEST').paymentEvidence,'NOT_VERIFIED');
 assert.equal(e.db.listEvents().length,1);
 assert.equal(e.db.listTransmissions().length,1);
}));
test('unsigned, wrong signature, forged body, wrong registered webhook ID all fail without writes',withEnv(async e=>{
 const handle=e.makeHandler();
 const mutations=[
   makeReq(event(),{headers:{'paypal-transmission-sig':'AAAA'}}),
   makeReq(event(),{rawBody:Buffer.from(JSON.stringify(event('WH-EVIL')))}),
   makeReq(event(),{signWebhookId:'WH-WRONG-123'}),
   makeReq(event(),{headers:{'paypal-transmission-sig':''}})
 ];
 for(const req of mutations){
   const res=await handle(req);assert.equal(res.status,401);
 }
 assert.equal(e.db.listEvents().length,0);
 assert.equal(e.db.getSubscription('I-SUBTEST').status,'UNKNOWN');
}));
test('wrong cert or unsupported header algorithm rejects; never fetches header URL',withEnv(async e=>{
 const handle=e.makeHandler();
 for(const headers of [
   {'paypal-cert-url':'https://evil.example/private'},
   {'paypal-auth-algo':'SHA1withRSA'},
   {'paypal-transmission-id':'oops'},
   {'paypal-transmission-time':'not-time'}
 ]){
   const res=await handle(makeReq(event(),{headers}));
   assert.equal(res.status,401);
 }
 assert.equal(e.db.listEvents().length,0);
}));
test('only JSON POST route accepted; GET and wrong route have no effects',withEnv(async e=>{
 const handle=e.makeHandler();
 assert.equal((await handle(new Request('https://localhost/api/paypal/webhooks'))).status,405);
 assert.equal((await handle(new Request('https://localhost/not-webhook',{method:'POST',body:'{}'}))).status,404);
 const req=makeReq(event(),{headers:{'content-type':'text/plain'}});
 assert.equal((await handle(req)).status,415);
 assert.equal(e.db.listEvents().length,0);
}));
test('oversize body and declared oversize length rejected before DB writes',withEnv(async e=>{
 const handle=e.makeHandler();
 const huge=Buffer.from(JSON.stringify({...event(),detail:'x'.repeat(65536)}));
 assert.equal((await handle(makeReq(huge))).status,413);
 assert.equal((await handle(makeReq(event(),{headers:{'content-length':'999999'}}))).status,413);
 assert.equal(e.db.listEvents().length,0);
}));
test('invalid signed JSON is rejected (no false 2xx)',withEnv(async e=>{
 const handle=e.makeHandler();
 const r=await read(await handle(makeReq(Buffer.from('{NOT JSON'))));
 assert.equal(r.status,400);assert.equal(r.code,'INVALID_WEBHOOK_JSON');
 assert.equal(e.db.listEvents().length,0);
}));
test('real signing over prettified raw JSON works; reserialized equivalent body fails',withEnv(async e=>{
 const handle=e.makeHandler();
 const raw=Buffer.from(JSON.stringify(event(),null,2));
 const result=await read(await handle(makeReq(raw)));
 assert.equal(result.status,200);
 const mutated=makeReq(raw,{transmission:'T-RESERIALIZED',rawBody:Buffer.from(JSON.stringify(event()))});
 assert.equal((await handle(mutated)).status,401);
 assert.equal(e.db.listEvents().length,1);
}));
test('repeated transmission and fresh transmission replay same event only one state change',withEnv(async e=>{
 const handle=e.makeHandler();
 assert.equal((await handle(makeReq(event()))).status,200);
 const first=await read(await handle(makeReq(event())));
 assert.equal(first.code,'IGNORE_DUPLICATE');
 const fresh=await read(await handle(makeReq(event(),{transmission:'T-SECOND-456'})));
 assert.equal(fresh.code,'IGNORE_DUPLICATE');
 assert.equal(e.db.listEvents().length,1);
 assert.equal(e.db.listTransmissions().length,2);
 assert.equal(e.db.getSubscription('I-SUBTEST').seenEventIds.length,1);
}));
test('event ID conflict and reused transmission ID with different signed event return 409',withEnv(async e=>{
 const handle=e.makeHandler();
 await handle(makeReq(event()));
 assert.equal((await handle(makeReq({...event(),event_type:'BILLING.SUBSCRIPTION.ACTIVATED'},
   {transmission:'T-OTHER-123'}))).status,409);
 assert.equal((await handle(makeReq(event('WH-TWO'),{transmission:'T-TRANSMISSION-123'}))).status,409);
 assert.equal(e.db.listEvents().length,1);
 assert.equal(e.db.listTransmissions().length,1);
}));
test('unbound target subscription and invalid event never receive 2xx or mutate',withEnv(async e=>{
 const handle=e.makeHandler();
 assert.equal((await handle(makeReq(event('WH-UNBOUND',undefined,undefined,'I-OTHER')))).status,409);
 assert.equal((await handle(makeReq(event('INVALID ID!'),{transmission:'T-INVALID-456'}))).status,400);
 assert.equal(e.db.listEvents().length,0);
}));
test('out-of-order and same-timestamp events recorded for GET-first reconciliation, not applied',withEnv(async e=>{
 const handle=e.makeHandler();
 const active=event('WH-ACTIVE','BILLING.SUBSCRIPTION.ACTIVATED','2026-10-24T09:00:00Z');
 assert.equal((await handle(makeReq(active))).status,200);
 const created=event('WH-OLDER','BILLING.SUBSCRIPTION.CREATED','2026-10-24T08:59:59Z');
 const old=await read(await handle(makeReq(created,{transmission:'T-OLDER-456'})));
 assert.equal(old.status,202);assert.equal(old.code,'RECONCILE_GET_FIRST');
 const same=await read(await handle(makeReq(
   event('WH-SAME','BILLING.SUBSCRIPTION.SUSPENDED','2026-10-24T09:00:00Z'),
   {transmission:'T-SAME-456'})));
 assert.equal(same.status,202);
 assert.equal(e.db.getSubscription('I-SUBTEST').status,'ACTIVE');
 assert.equal(e.db.listReconciliations().length,2);
 assert.equal(e.db.listEvents().length,3);
}));
test('payment sale and payment failed events never mark capture nor change lifecycle',withEnv(async e=>{
 const handle=e.makeHandler();
 await handle(makeReq(event('WH-ACTIVE','BILLING.SUBSCRIPTION.ACTIVATED',
   '2026-10-24T09:00:00Z')));
 for(const [i,type] of ['PAYMENT.SALE.COMPLETED',
     'BILLING.SUBSCRIPTION.PAYMENT.FAILED','PAYMENT.SALE.REVERSED'].entries()){
   const r=await read(await handle(makeReq(event('WH-PAY-'+i,type),
     {transmission:'T-PAY-'+String(i).padStart(10,'0')})));
   assert.equal(r.status,202);assert.equal(r.code,'RECONCILE_GET_FIRST');
 }
 const state=e.db.getSubscription('I-SUBTEST');
 assert.equal(state.paymentEvidence,'NOT_VERIFIED');
 assert.equal(state.status,'ACTIVE');
 assert.equal(e.db.listReconciliations().length,3);
}));
test('terminal CANCELLED blocks reactivation, queues GET reconciliation',withEnv(async e=>{
 const handle=e.makeHandler();
 await handle(makeReq(event('WH-CANCEL','BILLING.SUBSCRIPTION.CANCELLED',
   '2026-10-24T09:00:00Z')));
 const r=await read(await handle(makeReq(event('WH-REACT','BILLING.SUBSCRIPTION.ACTIVATED',
   '2026-10-24T09:01:00Z'),{transmission:'T-REACT-456'})));
 assert.equal(r.status,202);
 assert.equal(e.db.getSubscription('I-SUBTEST').status,'CANCELLED');
 assert.equal(e.db.listReconciliations()[0].reason,'ILLEGAL_OR_TERMINAL_TRANSITION');
}));
test('SQLite same physical file 2 clients preserves event uniqueness and state across restart',withEnv(async e=>{
 const handler=e.makeHandler();await handler(makeReq(event()));
 const second=createWebhookInbox({filename:e.file});
 try{
   const same=second.receiveVerified({event:event(),rawBody:Buffer.from(JSON.stringify(event())),
       transmissionId:'T-SECOND-456',verified:true});
   assert.equal(same.action,'IGNORE_DUPLICATE');
   assert.equal(second.listEvents().length,1);
   assert.equal(second.listTransmissions().length,2);
   assert.equal(second.getSubscription('I-SUBTEST').status,'APPROVAL_PENDING');
   assert.throws(()=>second.registerSubscription({subscriptionId:'I-SUBTEST',
     merchantId:'ANOTHER',planId:'P-PLAN'}),{code:'SUBSCRIPTION_BINDING_CONFLICT'});
 }finally{second.close()}
}));
test('unsigned direct inbox call rejects; memory-only DB rejected',()=>{
 assert.throws(()=>createWebhookInbox({filename:':memory:'}),
   {code:'DURABLE_INBOX_FILENAME_REQUIRED'});
 const e=env();
 try{
   assert.throws(()=>e.db.receiveVerified({event:event(),
      rawBody:Buffer.from('{}'),transmissionId:'T-ONE-123'}),
      {code:'UNVERIFIED_WEBHOOK'});
   assert.equal(e.db.listEvents().length,0);
 }finally{e.cleanup()}
});
