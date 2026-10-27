// Durable one-shot/one-file Gemini marketplace classification reservation and result.
// Stores ONLY a SHA256 brief digest and bounded validated skill enum, never raw brief.
// No implicit network, public HTTP, retry, billing permission or seller binding.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {validateMarketplaceBrief,validateMarketplaceSkills} from './gemini_marketplace_provider.mjs';

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
    "skills_json TEXT,result_hash TEXT,"+
    "created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  // Existing one-shot files may have COMMITTED without a saved result.
  // Preserve the consumed budget and surface LEGACY_RESULT_UNAVAILABLE;
  // never invent an answer or silently re-call Gemini to fill the gap.
  if(!db.prepare('PRAGMA table_info(marketplace_ai_attempts)').all()
      .some(c=>c.name==='skills_json'))
    db.exec('ALTER TABLE marketplace_ai_attempts ADD COLUMN skills_json TEXT');
  if(!db.prepare('PRAGMA table_info(marketplace_ai_attempts)').all()
      .some(c=>c.name==='result_hash'))
    db.exec('ALTER TABLE marketplace_ai_attempts ADD COLUMN result_hash TEXT');
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
  const getScoped=(scope)=>db.prepare(
    'SELECT state,skills_json,result_hash FROM marketplace_ai_attempts WHERE id=1 '+
    'AND actor_id=? AND merchant_id=? AND brief_hash=?')
      .get(scope.actorId,scope.merchantId,scope.hash);
  function claim(data){
    const scope=identity(data);
    return transaction(()=>{
      if(db.prepare('SELECT id FROM marketplace_ai_attempts WHERE id=1').get())
        deny('MARKETPLACE_AI_BUDGET_USED');
      db.prepare("INSERT INTO marketplace_ai_attempts"+
        "(id,actor_id,merchant_id,brief_hash,state) VALUES(1,?,?,?,'RESERVED')")
        .run(scope.actorId,scope.merchantId,scope.hash);
      return Object.freeze({state:'RESERVED',attemptsPerLedger:1});
    });
  }
  function commit(data){
    // Only a validated, source-constrained skill set may become durable.
    // Validation and the SQL update happen before returning AI success.
    const skills=validateMarketplaceSkills({skills:data?.skills});
    const scope=identity(data);
    const canonical=JSON.stringify(skills);
    const hash=createHash('sha256').update(JSON.stringify([
      scope.actorId,scope.merchantId,scope.hash,canonical])).digest('hex');
    return transaction(()=>{
      const row=getScoped(scope);
      if(!row)deny('MARKETPLACE_AI_CLAIM_NOT_FOUND');
      if(row.state!=='RESERVED')
        deny('MARKETPLACE_AI_RESULT_ALREADY_FINAL');
      const changed=db.prepare(
        "UPDATE marketplace_ai_attempts SET state='COMMITTED',skills_json=?,result_hash=? "+
        "WHERE id=1 AND actor_id=? AND merchant_id=? AND brief_hash=? "+
        "AND state='RESERVED' AND skills_json IS NULL AND result_hash IS NULL")
        .run(canonical,hash,scope.actorId,scope.merchantId,scope.hash);
      if(changed.changes!==1)deny('MARKETPLACE_AI_COMMIT_CONFLICT');
      return Object.freeze({state:'COMMITTED',savedSkills:skills.length});
    });
  }
  function markUnknown(data){
    const scope=identity(data);
    return transaction(()=>{
      const row=getScoped(scope);
      if(!row)deny('MARKETPLACE_AI_CLAIM_NOT_FOUND');
      if(row.state==='RESERVED')db.prepare(
        "UPDATE marketplace_ai_attempts SET state='UNKNOWN' "+
        "WHERE id=1 AND actor_id=? AND merchant_id=? AND brief_hash=? AND state='RESERVED'")
        .run(scope.actorId,scope.merchantId,scope.hash);
      return Object.freeze({state:getScoped(scope).state});
    });
  }
  function status(data){
    const scope=identity(data);
    if(closed)deny('MARKETPLACE_AI_STORE_CLOSED');
    const row=getScoped(scope);
    return row?Object.freeze({state:row.state}):null;
  }
  function readResult(data){
    const scope=identity(data);
    if(closed)deny('MARKETPLACE_AI_STORE_CLOSED');
    const row=getScoped(scope);
    if(!row)return null;
    if(row.state!=='COMMITTED')
      return Object.freeze({state:row.state,restorable:false,
        reason:'NO_VERIFIED_SKILLS_YET'});
    if(typeof row.skills_json!=='string')
      return Object.freeze({state:'COMMITTED',restorable:false,
        reason:'LEGACY_RESULT_UNAVAILABLE'});
    const hash=createHash('sha256').update(JSON.stringify([
      scope.actorId,scope.merchantId,scope.hash,row.skills_json])).digest('hex');
    if(typeof row.result_hash!=='string'||row.result_hash!==hash)
      return Object.freeze({state:'COMMITTED',restorable:false,
        reason:'STORED_RESULT_HASH_MISMATCH'});
    let skills;
    try{
      const parsed=JSON.parse(row.skills_json);
      skills=validateMarketplaceSkills({skills:parsed});
      if(JSON.stringify(skills)!==row.skills_json)
        deny('RESULT_NOT_CANONICAL');
    }catch{
      return Object.freeze({state:'COMMITTED',restorable:false,
        reason:'STORED_SKILLS_INVALID'});
    }
    return Object.freeze({state:'COMMITTED',restorable:true,
      source:'GEMINI_API',skills:Object.freeze(skills)});
  }
  function close(){if(!closed){closed=true;db.close();}}
  return Object.freeze({claim,commit,markUnknown,status,readResult,close,
    mode:'DURABLE_ONE_SHOT_NO_IMPLICIT_NETWORK'});
}
