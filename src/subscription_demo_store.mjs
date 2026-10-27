// D12: 127.0.0.1-only synthetic subscription scenario persistence.
// NEVER a PayPal REST adapter, payment source, or production authentication system.
import { DatabaseSync } from 'node:sqlite';

export class SubscriptionDemoError extends Error {
  constructor(code,status=409){super(code);this.code=code;this.status=status;}
}
const fail=(yes,code,status=409)=>{if(yes)throw new SubscriptionDemoError(code,status)};
const validId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(v);
const STEPS=Object.freeze({
  start:{from:['NOT_STARTED'],to:'ACTIVE'},
  fail:{from:['ACTIVE'],to:'RECOVERY_REQUIRED'},
  recover:{from:['RECOVERY_REQUIRED'],to:'ACTIVE'},
  cancel:{from:['ACTIVE','RECOVERY_REQUIRED'],to:'CANCELLED'}
});
export function createSubscriptionScenarioStore({filename}={}){
  fail(typeof filename!=='string'||!filename||filename===':memory:'||
    filename.startsWith('file:')||filename.includes('?'),
    'DURABLE_DEMO_DB_REQUIRED',400);
  const db=new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  db.exec("CREATE TABLE IF NOT EXISTS demo_subscriptions("+
    "id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,merchant_id TEXT NOT NULL,"+
    "version INTEGER NOT NULL CHECK(version>=1),"+
    "state TEXT NOT NULL CHECK(state IN ('NOT_STARTED','ACTIVE','RECOVERY_REQUIRED','CANCELLED')),"+
    "payment_evidence TEXT NOT NULL DEFAULT 'NOT_VERIFIED' CHECK(payment_evidence='NOT_VERIFIED'),"+
    "failure_hint TEXT,last_recovery TEXT)");
  db.exec("CREATE TABLE IF NOT EXISTS demo_subscription_events("+
    "event_id TEXT PRIMARY KEY,subscription_id TEXT NOT NULL REFERENCES demo_subscriptions(id),"+
    "action TEXT NOT NULL,from_state TEXT NOT NULL,to_state TEXT NOT NULL,"+
    "version INTEGER NOT NULL,source TEXT NOT NULL CHECK(source='OFFLINE_SCENARIO'),"+
    "UNIQUE(subscription_id,version))");
  db.exec("CREATE TRIGGER IF NOT EXISTS demo_subscription_events_no_update BEFORE UPDATE ON demo_subscription_events "+
    "BEGIN SELECT RAISE(ABORT,'IMMUTABLE_EVENT'); END");
  db.exec("CREATE TRIGGER IF NOT EXISTS demo_subscription_events_no_delete BEFORE DELETE ON demo_subscription_events "+
    "BEGIN SELECT RAISE(ABORT,'IMMUTABLE_EVENT'); END");
  const stmt=sql=>db.prepare(sql);
  const transact=fn=>{
    db.exec('BEGIN IMMEDIATE');
    try{const result=fn();db.exec('COMMIT');return result}
    catch(e){db.exec('ROLLBACK');throw e}
  };
  const read=id=>{
    const s=stmt('SELECT * FROM demo_subscriptions WHERE id=?').get(id);
    return s&&{id:s.id,ownerId:s.owner_id,merchantId:s.merchant_id,
      version:s.version,state:s.state,paymentEvidence:s.payment_evidence,
      failureHint:s.failure_hint,recoveryEvidence:s.last_recovery,
      mode:'OFFLINE_SCENARIO_NO_PROVIDER'};
  };
  const owned=({subscriptionId,actorId,merchantId})=>{
    const s=read(subscriptionId);
    fail(!s||s.ownerId!==actorId||s.merchantId!==merchantId,
      'SUBSCRIPTION_NOT_FOUND',404);
    return s;
  };
  return {
    seed({subscriptionId,ownerId,merchantId}){
      fail(!validId(subscriptionId)||!validId(ownerId)||!validId(merchantId),
        'INVALID_DEMO_IDENTITY',400);
      return transact(()=>{
        const prev=read(subscriptionId);
        if(prev){
          fail(prev.ownerId!==ownerId||prev.merchantId!==merchantId,
            'SUBSCRIPTION_BINDING_CONFLICT');
          return prev;
        }
        stmt("INSERT INTO demo_subscriptions(id,owner_id,merchant_id,version,state) "+
          "VALUES(?,?,?,1,'NOT_STARTED')").run(subscriptionId,ownerId,merchantId);
        return read(subscriptionId);
      });
    },
    get(input){return owned(input)},
    events(input){
      owned(input);
      return stmt('SELECT event_id,action,from_state,to_state,version,source '+
        'FROM demo_subscription_events WHERE subscription_id=? ORDER BY version')
        .all(input.subscriptionId).map(x=>({eventId:x.event_id,
          action:x.action,from:x.from_state,to:x.to_state,
          version:x.version,source:x.source}));
    },
    step({subscriptionId,actorId,merchantId,action,expectedVersion,eventId}={}){
      fail(!Object.hasOwn(STEPS,action)||!validId(eventId)||
        !Number.isSafeInteger(expectedVersion)||expectedVersion<1,
      'INVALID_DEMO_ACTION',400);
      return transact(()=>{
        const s=owned({subscriptionId,actorId,merchantId});
        fail(s.version!==expectedVersion,'STALE_DEMO_VERSION');
        const rule=STEPS[action];
        fail(!rule.from.includes(s.state),'DEMO_TRANSITION_FORBIDDEN');
        fail(!!stmt('SELECT 1 FROM demo_subscription_events WHERE event_id=?').get(eventId),
          'DUPLICATE_DEMO_EVENT');
        fail(s.version>=Number.MAX_SAFE_INTEGER,'DEMO_VERSION_EXHAUSTED');
        const failure=action==='fail'?'Synthetic renewal failure (no provider transaction)':
          action==='recover'||action==='start'?null:s.failureHint;
        const recovered=action==='recover'?
          'SYNTHETIC_GET_FIXTURE_ONLY_NOT_PAYPAL':
          action==='start'?null:s.recoveryEvidence;
        const u=stmt('UPDATE demo_subscriptions SET version=version+1,state=?,'+
          'failure_hint=?,last_recovery=? WHERE id=? AND version=?')
          .run(rule.to,failure,recovered,subscriptionId,s.version);
        fail(u.changes!==1,'DEMO_VERSION_CONFLICT');
        stmt("INSERT INTO demo_subscription_events(event_id,subscription_id,action,"+
          "from_state,to_state,version,source) VALUES(?,?,?,?,?,?,'OFFLINE_SCENARIO')")
          .run(eventId,subscriptionId,action,s.state,rule.to,s.version+1);
        return read(subscriptionId);
      });
    },
    close(){db.close()}
  };
}
