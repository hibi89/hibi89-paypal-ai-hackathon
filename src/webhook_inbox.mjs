// D11: durable OFFLINE SYNTHETIC webhook inbox. NOT a hosted PayPal receiver.
// No PayPal request, no live money side effects. SQLite is not D1.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {createSubscriptionSnapshot,planTrustedSubscriptionEvent}
  from './subscription_contract.mjs';

export class WebhookInboxError extends Error {
  constructor(code,status=409){super(code);this.code=code;this.status=status;}
}
const fail=(condition,code,status=409)=>{
  if(condition)throw new WebhookInboxError(code,status);
};
const identifier=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);

export function createWebhookInbox({filename}={}){
  fail(typeof filename!=='string'||!filename||filename===':memory:'||
    filename.startsWith('file:')||filename.includes('?'),
    'DURABLE_INBOX_FILENAME_REQUIRED',400);
  const db=new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys=ON');
  db.exec('PRAGMA busy_timeout=5000');
  db.exec('PRAGMA journal_mode=WAL');
  db.exec('CREATE TABLE IF NOT EXISTS webhook_subscriptions ('+
    'id TEXT PRIMARY KEY,merchant_id TEXT NOT NULL,plan_id TEXT NOT NULL,'+
    'snapshot_json TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS webhook_events ('+
    'event_id TEXT PRIMARY KEY,transmission_id TEXT NOT NULL UNIQUE,'+
    'subscription_id TEXT NOT NULL REFERENCES webhook_subscriptions(id),'+
    'event_type TEXT NOT NULL,body_sha256 TEXT NOT NULL,'+
    'action TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  db.exec('CREATE TABLE IF NOT EXISTS webhook_deliveries ('+
    'transmission_id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES webhook_events(event_id))');
  db.exec('CREATE TABLE IF NOT EXISTS webhook_reconciliation_queue ('+
    'event_id TEXT PRIMARY KEY REFERENCES webhook_events(event_id),'+
    'subscription_id TEXT NOT NULL REFERENCES webhook_subscriptions(id),'+
    'reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  db.exec("CREATE TRIGGER IF NOT EXISTS webhook_events_no_update BEFORE UPDATE ON "+
    "webhook_events BEGIN SELECT RAISE(ABORT,'IMMUTABLE_WEBHOOK_EVENT'); END");
  db.exec("CREATE TRIGGER IF NOT EXISTS webhook_events_no_delete BEFORE DELETE ON "+
    "webhook_events BEGIN SELECT RAISE(ABORT,'IMMUTABLE_WEBHOOK_EVENT'); END");
  const q=s=>db.prepare(s);
  const transaction=fn=>{
    db.exec('BEGIN IMMEDIATE');
    try{const result=fn();db.exec('COMMIT');return result;}
    catch(e){db.exec('ROLLBACK');throw e;}
  };
  return {
    registerSubscription({subscriptionId,merchantId,planId}){
      const snapshot=createSubscriptionSnapshot({subscriptionId,merchantId,planId});
      return transaction(()=>{
        const exists=q('SELECT * FROM webhook_subscriptions WHERE id=?').get(subscriptionId);
        if(exists){
          fail(exists.merchant_id!==merchantId||exists.plan_id!==planId,
            'SUBSCRIPTION_BINDING_CONFLICT');
          return JSON.parse(exists.snapshot_json);
        }
        q('INSERT INTO webhook_subscriptions(id,merchant_id,plan_id,snapshot_json) VALUES(?,?,?,?)')
          .run(subscriptionId,merchantId,planId,JSON.stringify(snapshot));
        return snapshot;
      });
    },
    receiveVerified({event,rawBody,transmissionId,verified=false}={}){
      // verified=true must be passed only after local cryptographic verification;
      // never map a user-supplied HTTP property to this input.
      fail(verified!==true,'UNVERIFIED_WEBHOOK',401);
      fail(!identifier(transmissionId)||!Buffer.isBuffer(rawBody)||
        !event||!identifier(event.id),'INVALID_VERIFIED_ENVELOPE',400);
      const digest=createHash('sha256').update(rawBody).digest('hex');
      return transaction(()=>{
        const existingTransmission=q('SELECT event_id FROM webhook_deliveries WHERE transmission_id=?')
          .get(transmissionId);
        if(existingTransmission) {
          fail(existingTransmission.event_id!==event.id,'TRANSMISSION_REUSE_CONFLICT');
          const prior=q('SELECT body_sha256,action,reason FROM webhook_events WHERE event_id=?')
            .get(event.id);
          fail(!prior||prior.body_sha256!==digest,'WEBHOOK_EVENT_BODY_CONFLICT');
          return {action:'IGNORE_DUPLICATE',reason:'DELIVERY_ALREADY_RECORDED'};
        }
        const prior=q('SELECT body_sha256,subscription_id FROM webhook_events WHERE event_id=?')
          .get(event.id);
        if(prior){
          fail(prior.body_sha256!==digest,'WEBHOOK_EVENT_BODY_CONFLICT');
          q('INSERT INTO webhook_deliveries(transmission_id,event_id) VALUES(?,?)')
            .run(transmissionId,event.id);
          return {action:'IGNORE_DUPLICATE',reason:'EVENT_ID_ALREADY_PROCESSED'};
        }
        const subscriptionId=event.resource?.id;
        fail(!identifier(subscriptionId),'UNBOUND_SUBSCRIPTION_EVENT');
        const binding=q('SELECT * FROM webhook_subscriptions WHERE id=?').get(subscriptionId);
        fail(!binding,'UNBOUND_SUBSCRIPTION_EVENT');
        const previous=JSON.parse(binding.snapshot_json);
        // Database owns unbounded event-id uniqueness. Cap the local planner
        // memory window to 199 observed IDs; never expire SQL audit history.
        const plannerInput={...previous,seenEventIds:previous.seenEventIds.slice(-199)};
        const result=planTrustedSubscriptionEvent(plannerInput,event,{trusted:true});
        fail(!['APPLY_VERIFIED_LIFECYCLE','RECONCILE_GET_FIRST'].includes(result.action),
          'UNEXPECTED_WEBHOOK_DECISION');
        q('INSERT INTO webhook_events(event_id,transmission_id,subscription_id,'+
          'event_type,body_sha256,action,reason) VALUES(?,?,?,?,?,?,?)')
          .run(event.id,transmissionId,subscriptionId,event.event_type,
            digest,result.action,result.reason);
        q('INSERT INTO webhook_deliveries(transmission_id,event_id) VALUES(?,?)')
          .run(transmissionId,event.id);
        if(result.action==='APPLY_VERIFIED_LIFECYCLE')
          q('UPDATE webhook_subscriptions SET snapshot_json=? WHERE id=?')
            .run(JSON.stringify(result.snapshot),subscriptionId);
        else
          q('INSERT INTO webhook_reconciliation_queue(event_id,subscription_id,reason) VALUES(?,?,?)')
            .run(event.id,subscriptionId,result.reason);
        return {action:result.action,reason:result.reason,
          subscriptionId,status:result.snapshot.status};
      });
    },
    getSubscription(id){
      const r=q('SELECT snapshot_json FROM webhook_subscriptions WHERE id=?').get(id);
      return r?JSON.parse(r.snapshot_json):null;
    },
    listEvents(){
      return q('SELECT event_id,transmission_id,subscription_id,event_type,'+
        'body_sha256,action,reason FROM webhook_events ORDER BY rowid').all();
    },
    listTransmissions(){
      return q('SELECT transmission_id,event_id FROM webhook_deliveries ORDER BY rowid').all();
    },
    listReconciliations(){
      return q('SELECT event_id,subscription_id,reason FROM webhook_reconciliation_queue ORDER BY rowid').all();
    },
    close(){db.close();}
  };
}
