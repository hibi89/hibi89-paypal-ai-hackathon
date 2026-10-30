// Private, bounded recommendation-view history for the OFFLINE synthetic demo.
// No real user accounts, seller performance claims, confidential briefs or payments.
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomBytes} from 'node:crypto';

const validOwner=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(x);
const validId=x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
const failure=(code,status=400)=>Object.assign(new Error(code),{code,status});
export function createMarketplaceRecommendationStore(filename) {
  if(typeof filename!=='string'||!filename||filename===':memory:')throw failure('DISK_REQUIRED');
  const db=new DatabaseSync(filename);
  db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON');
  db.exec(`CREATE TABLE IF NOT EXISTS recommendation_sessions(
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    vertical TEXT NOT NULL CHECK(vertical IN ('ai_work','general_services')),
    brief_hash TEXT NOT NULL,
    skills_json TEXT NOT NULL,
    round INTEGER NOT NULL CHECK(round BETWEEN 0 AND 2),
    created_at INTEGER NOT NULL,
    UNIQUE(owner,vertical,brief_hash)
  )`);
  const tx=fn=>{
    db.exec('BEGIN IMMEDIATE');
    try{const result=fn();db.exec('COMMIT');return result}
    catch(e){db.exec('ROLLBACK');throw e}
  };
  const rowToPublic=row=>row&&({
    id:row.id,vertical:row.vertical,round:row.round,
    skills:JSON.parse(row.skills_json)
  });
  function start(owner,vertical,brief,skills){
    if(!validOwner(owner)||!['ai_work','general_services'].includes(vertical)||
       typeof brief!=='string'||brief.length<8||brief.length>500||
       !Array.isArray(skills)||skills.length>6||
       skills.some(s=>typeof s!=='string'||s.length>32))
      throw failure('INVALID_RECOMMENDATION_REQUEST');
    // Only a fingerprint of a synthetic brief is stored, not the original text.
    const canonical=brief.trim().replace(/\s+/g,' ').toLowerCase();
    const briefHash=createHash('sha256').update(canonical).digest('hex');
    return tx(()=>{
      let row=db.prepare('SELECT * FROM recommendation_sessions WHERE owner=? AND vertical=? AND brief_hash=?').get(owner,vertical,briefHash);
      if(!row){
        const used=db.prepare('SELECT COUNT(*) AS count FROM recommendation_sessions WHERE owner=?').get(owner).count;
        if(used>=24)throw failure('SYNTHETIC_SESSION_QUOTA_EXHAUSTED',429);
        const id=randomBytes(16).toString('hex');
        db.prepare('INSERT INTO recommendation_sessions(id,owner,vertical,brief_hash,skills_json,round,created_at) VALUES(?,?,?,?,?,0,?)')
          .run(id,owner,vertical,briefHash,JSON.stringify(skills),Date.now());
        row=db.prepare('SELECT * FROM recommendation_sessions WHERE id=?').get(id);
      }
      return rowToPublic(row);
    });
  }
  function get(owner,id){
    if(!validOwner(owner)||!validId(id))return null;
    const row=db.prepare('SELECT * FROM recommendation_sessions WHERE id=? AND owner=?').get(id,owner);
    return rowToPublic(row);
  }
  function next(owner,id,expectedRound){
    if(!validOwner(owner)||!validId(id)||!Number.isInteger(expectedRound)||
       expectedRound<1||expectedRound>3)throw failure('INVALID_RECOMMENDATION_ADVANCE');
    return tx(()=>{
      const row=db.prepare('SELECT * FROM recommendation_sessions WHERE id=? AND owner=?').get(id,owner);
      if(!row)throw failure('RECOMMENDATION_SESSION_NOT_FOUND',404);
      if(row.round>=2)throw failure('REFRESH_LIMIT_REACHED',409);
      if(row.round+1!==expectedRound)throw failure('STALE_RECOMMENDATION_ROUND',409);
      db.prepare('UPDATE recommendation_sessions SET round=round+1 WHERE id=? AND owner=?').run(id,owner);
      return get(owner,id);
    });
  }
  return {start,get,next,close:()=>db.close()};
}
