import {DatabaseSync} from 'node:sqlite';
export function createAgentBudgetStore(filename){
 if(typeof filename!=='string'||!filename||filename===':memory:')throw Error('DISK_REQUIRED');
 const db=new DatabaseSync(filename);
 db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON");
 db.exec("CREATE TABLE IF NOT EXISTS agent_limits(owner TEXT NOT NULL,merchant TEXT NOT NULL,cap INTEGER NOT NULL CHECK(cap>=100),PRIMARY KEY(owner,merchant))");
 db.exec("CREATE TABLE IF NOT EXISTS agent_reservations(owner TEXT NOT NULL,merchant TEXT NOT NULL,quote TEXT NOT NULL,version INTEGER NOT NULL,amount INTEGER NOT NULL CHECK(amount>=100),PRIMARY KEY(owner,merchant,quote,version),FOREIGN KEY(owner,merchant) REFERENCES agent_limits(owner,merchant))");
 const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}};
 const valid=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(s);
 function configure(owner,merchant,cap){
  if(!valid(owner)||!valid(merchant)||!Number.isSafeInteger(cap)||cap<100||cap>100000000)throw Error('INVALID_LIMIT');
  return tx(()=>{
   const used=db.prepare('SELECT COALESCE(SUM(amount),0) AS total FROM agent_reservations WHERE owner=? AND merchant=?').get(owner,merchant).total;
   if(used>cap)return {ok:false,reason:'BELOW_RESERVED'};
   db.prepare('INSERT INTO agent_limits(owner,merchant,cap) VALUES(?,?,?) ON CONFLICT(owner,merchant) DO UPDATE SET cap=excluded.cap').run(owner,merchant,cap);
   return {ok:true};
  });
 }
 function reserve({owner,merchant,quote,version,amount}){
  if(!valid(owner)||!valid(merchant)||!valid(quote)||!Number.isSafeInteger(version)||version<1||!Number.isSafeInteger(amount)||amount<100||amount>100000000)throw Error('INVALID_RESERVATION');
  return tx(()=>{
   const old=db.prepare('SELECT amount FROM agent_reservations WHERE owner=? AND merchant=? AND quote=? AND version=?').get(owner,merchant,quote,version);
   if(old)return {ok:old.amount===amount,reason:'ALREADY_RESERVED'};
   const limit=db.prepare('SELECT cap FROM agent_limits WHERE owner=? AND merchant=?').get(owner,merchant);
   if(!limit)return {ok:false,reason:'NO_LIMIT'};
   const used=db.prepare('SELECT COALESCE(SUM(amount),0) AS total FROM agent_reservations WHERE owner=? AND merchant=?').get(owner,merchant).total;
   if(amount>limit.cap-used)return {ok:false,reason:'BUDGET_EXCEEDED'};
   db.prepare('INSERT INTO agent_reservations(owner,merchant,quote,version,amount) VALUES(?,?,?,?,?)').run(owner,merchant,quote,version,amount);
   return {ok:true,remainingMinor:limit.cap-used-amount};
  });
 }
 function existing(owner,merchant,quote,version){
  if(!valid(owner)||!valid(merchant)||!valid(quote)||!Number.isSafeInteger(version)||version<1)throw Error('INVALID_RESERVATION');
  return db.prepare('SELECT amount FROM agent_reservations WHERE owner=? AND merchant=? AND quote=? AND version=?').get(owner,merchant,quote,version)?.amount??null;
 }
 function history(owner,merchant){
  if(!valid(owner)||!valid(merchant))throw Error('INVALID_OWNER');
  return db.prepare('SELECT quote,version,amount FROM agent_reservations WHERE owner=? AND merchant=? ORDER BY rowid DESC LIMIT 100').all(owner,merchant).map(x=>({quoteId:x.quote,quoteVersion:x.version,amountMinor:x.amount}));
 }
 function status(owner,merchant){
  if(!valid(owner)||!valid(merchant))throw Error('INVALID_OWNER');
  const limit=db.prepare('SELECT cap FROM agent_limits WHERE owner=? AND merchant=?').get(owner,merchant);
  const used=db.prepare('SELECT COALESCE(SUM(amount),0) AS total FROM agent_reservations WHERE owner=? AND merchant=?').get(owner,merchant).total;
  return {configured:!!limit,limitMinor:limit?.cap??null,reservedMinor:used};
 }
 return {configure,reserve,existing,status,history,close:()=>db.close()};
}


// Explicit opt-in adapter, same SQLite as quote and persisted membership.
export function createLedgerAgentBudgetStore(ledger){
 const methods=['configureLocalBudget','reserveLocalBudget','getLocalBudgetStatus',
   'getLocalBudgetReservation','listLocalBudgetHistory'];
 if(!ledger||methods.some(k=>typeof ledger[k]!=='function'))
   throw new TypeError('SAME_LEDGER_BUDGET_REQUIRED');
 return Object.freeze({
  atomicRoleRevisionReservation:true,
  configure:(owner,merchant,cap,expectedMembershipRevision)=>
    ledger.configureLocalBudget({owner,merchant,cap,expectedMembershipRevision}),
  reserve:({owner,merchant,quote,version,amount,expectedMembershipRevision})=>
    ledger.reserveLocalBudget({owner,merchant,quote,version,amount,expectedMembershipRevision}),
  status:(owner,merchant)=>ledger.getLocalBudgetStatus(owner,merchant),
  existing:(owner,merchant,quote,version)=>ledger.getLocalBudgetReservation(owner,merchant,quote,version),
  history:(owner,merchant)=>ledger.listLocalBudgetHistory(owner,merchant),
  close:()=>{}
 });
}
