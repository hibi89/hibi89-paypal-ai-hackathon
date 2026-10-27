// Durable one-shot/one-ledger-budget reservation for optional remote skill classification.
// Stores SHA256 of normalized synthetic brief, not the raw project prompt.
// No implicit provider call and no automatic retry after UNKNOWN.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {validateMarketplaceBrief} from './gemini_marketplace_provider.mjs';

const deny=code=>{const e=new Error(code);e.code=code;throw e;};
const simpleId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const sha=brief=>createHash('sha256').update(brief).digest('hex');
export function createMarketplaceAiBudgetStore({filename}={}){
  if(typeof filename!=='string'||!filename||filename===':memory:'||
     filename.startsWith('file:')||filename.includes('?mode=memory'))
    deny('DURABLE_MARKETPLACE_AI_FILE_REQUIRED');
  const db=new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode=WAL');
  db.exec('PRAGMA busy_timeout=5000');
  db.exec("CREATE TABLE IF NOT EXISTS marketplace_ai_attempts ("+
    "id INTEGER PRIMARY KEY CHECK(id=1),"+
    "actor_id TEXT NOT NULL,merchant_id TEXT NOT NULL,brief_hash TEXT NOT NULL,"+
    "state TEXT NOT NULL CHECK(state IN ('RESERVED','UNKNOWN','COMMITTED')),"+
    "created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  let closed=false;
  const transaction=fn=>{
    if(closed)deny('MARKETPLACE_AI_STORE_CLOSED');
    db.exec('BEGIN IMMEDIATE');
    try{const val=fn();db.exec('COMMIT');return val;}
    catch(e){db.exec('ROLLBACK');throw e;}
  };
  const identity=({actorId,merchantId,brief}={})=>{
    if(!simpleId(actorId)||!simpleId(merchantId))
      deny('MARKETPLACE_AI_ACTOR_REQUIRED');
    validateMarketplaceBrief(brief);
    return {actorId,merchantId,hash:sha(brief)};
  };
  function claim(data){
    const {actorId,merchantId,hash}=identity(data);
    return transaction(()=>{
      if(db.prepare('SELECT id FROM marketplace_ai_attempts WHERE id=1').get())
        deny('MARKETPLACE_AI_BUDGET_USED');
      db.prepare("INSERT INTO marketplace_ai_attempts"+
        "(id,actor_id,merchant_id,brief_hash,state) VALUES(1,?,?,?,'RESERVED')")
        .run(actorId,merchantId,hash);
      return Object.freeze({state:'RESERVED',attemptsPerLedger:1});
    });
  }
  function settle(data,newState){
    const {actorId,merchantId,hash}=identity(data);
    return transaction(()=>{
      const row=db.prepare('SELECT state FROM marketplace_ai_attempts WHERE id=1 '+
        'AND actor_id=? AND merchant_id=? AND brief_hash=?').get(actorId,merchantId,hash);
      if(!row)deny('MARKETPLACE_AI_CLAIM_NOT_FOUND');
      if(row.state==='RESERVED'){
        db.prepare('UPDATE marketplace_ai_attempts SET state=? WHERE id=1 AND state=?')
          .run(newState,'RESERVED');
      }
      return Object.freeze({state:db.prepare('SELECT state FROM marketplace_ai_attempts WHERE id=1').get().state});
    });
  }
  function status(data){
    const {actorId,merchantId,hash}=identity(data);
    if(closed)deny('MARKETPLACE_AI_STORE_CLOSED');
    const row=db.prepare('SELECT state FROM marketplace_ai_attempts WHERE id=1 '+
      'AND actor_id=? AND merchant_id=? AND brief_hash=?').get(actorId,merchantId,hash);
    return row?Object.freeze({state:row.state}):null;
  }
  function close(){if(!closed){closed=true;db.close();}}
  return Object.freeze({claim,commit:data=>settle(data,'COMMITTED'),
    markUnknown:data=>settle(data,'UNKNOWN'),status,close,
    mode:'DURABLE_ONE_SHOT_NO_IMPLICIT_NETWORK'});
}
