import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
const deny=c=>{const e=new Error(c);e.code=c;throw e};
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(x);
const digest=x=>createHash('sha256').update(x).digest('hex');
const branded=new WeakSet();
export const isBudgetStore=x=>branded.has(x);
export const hashEvidence=digest;
export function createA2ABudgetStore({filename,now=Date.now,dayLimit=12,
  attemptLimit=6,reservedPerCall=2560,dayTokens=30720}={}){
 if(typeof filename!=='string'||!filename||filename===':memory:'||
    typeof now!=='function'||!Number.isInteger(dayLimit)||dayLimit<1||dayLimit>100||
    !Number.isInteger(attemptLimit)||attemptLimit<1||attemptLimit>dayLimit||
    !Number.isInteger(reservedPerCall)||reservedPerCall<256||reservedPerCall>4096||
    !Number.isInteger(dayTokens)||dayTokens<reservedPerCall||dayTokens>100000)
  deny('A2A_LEDGER_CONFIG_INVALID');
 const db=new DatabaseSync(filename);
 db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000");
 db.exec("CREATE TABLE IF NOT EXISTS a2a_api_claims ("+
  "actor TEXT NOT NULL,merchant TEXT NOT NULL,job TEXT NOT NULL,"+
  "turn INTEGER NOT NULL,role TEXT NOT NULL,day TEXT NOT NULL,"+
  "prompt_hash TEXT NOT NULL,tokens_reserved INTEGER NOT NULL,"+
  "state TEXT NOT NULL,used_tokens INTEGER,output_hash TEXT,"+
  "PRIMARY KEY(actor,merchant,job,turn))");
 const q=s=>db.prepare(s);
 const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const x=fn();db.exec('COMMIT');return x}
  catch(e){db.exec('ROLLBACK');throw e}};
 const check=({actor,merchant,job})=>{
  if(!id(actor)||!id(merchant)||!id(job))deny('A2A_LEDGER_SCOPE_INVALID');
 };
 function claim({actor,merchant,job,turn,role,promptHash}={}){
  check({actor,merchant,job});
  if(!Number.isInteger(turn)||turn<1||turn>12||
     role!==(turn%2?'seller':'buyer')||
     !/^[a-f0-9]{64}$/.test(promptHash||''))
   deny('A2A_LEDGER_CLAIM_INVALID');
  return tx(()=>{
   const clock=now();
   if(!Number.isSafeInteger(clock)||clock<0)deny('A2A_LEDGER_CLOCK_INVALID');
   const day=new Date(clock).toISOString().slice(0,10);
   const prior=q("SELECT turn,state FROM a2a_api_claims WHERE actor=? AND merchant=? AND job=? ORDER BY turn DESC LIMIT 1").get(actor,merchant,job);
   if(prior && prior.turn>=turn)deny('A2A_LEDGER_REPLAY_BLOCKED');
   if(prior ? prior.turn!==turn-1||prior.state!=='DONE' : turn!==1)
    deny('A2A_LEDGER_PRIOR_UNKNOWN');
   const daily=q("SELECT COUNT(*) n,COALESCE(SUM(tokens_reserved),0) t FROM a2a_api_claims WHERE actor=? AND merchant=? AND day=?").get(actor,merchant,day);
   const own=q("SELECT COUNT(*) n FROM a2a_api_claims WHERE actor=? AND merchant=? AND job=?").get(actor,merchant,job);
   if(daily.n>=dayLimit||daily.t+reservedPerCall>dayTokens||own.n>=attemptLimit)
    deny('A2A_LEDGER_QUOTA_EXHAUSTED');
   q("INSERT INTO a2a_api_claims(actor,merchant,job,turn,role,day,prompt_hash,tokens_reserved,state) VALUES(?,?,?,?,?,?,?,?,?)").run(actor,merchant,job,turn,role,day,promptHash,reservedPerCall,'PENDING');
   return Object.freeze({actor,merchant,job,turn,role});
  });
 }
 function finish(record,{usedTokens,outputHash}={}){
  check(record);
  if(!Number.isInteger(record.turn)||record.turn<1||record.turn>12||
     !Number.isInteger(usedTokens)||usedTokens<1||usedTokens>100000||
     !/^[a-f0-9]{64}$/.test(outputHash||''))deny('A2A_LEDGER_RESULT_INVALID');
  return tx(()=>{
   const row=q("SELECT state,tokens_reserved FROM a2a_api_claims WHERE actor=? AND merchant=? AND job=? AND turn=?").get(record.actor,record.merchant,record.job,record.turn);
   if(!row||row.state!=='PENDING')deny('A2A_LEDGER_NOT_PENDING');
   if(usedTokens>row.tokens_reserved)deny('A2A_LEDGER_TOKEN_OVERAGE');
   q("UPDATE a2a_api_claims SET state='DONE',used_tokens=?,output_hash=? WHERE actor=? AND merchant=? AND job=? AND turn=?").run(usedTokens,outputHash,record.actor,record.merchant,record.job,record.turn);
   return Object.freeze({state:'DONE',providerVerified:false});
  });
 }
 function uncertain(record){
  if(!record)return;
  check(record);
  return tx(()=>q("UPDATE a2a_api_claims SET state='UNKNOWN' WHERE actor=? AND merchant=? AND job=? AND turn=? AND state='PENDING'").run(record.actor,record.merchant,record.job,record.turn).changes===1);
 }
 function status({actor,merchant,job}={}){
  check({actor,merchant,job});
  const rows=q("SELECT turn,role,day,tokens_reserved AS reservedTokens,state,used_tokens AS usedTokens,prompt_hash AS promptHash,output_hash AS outputHash FROM a2a_api_claims WHERE actor=? AND merchant=? AND job=? ORDER BY turn").all(actor,merchant,job);
  return {source:'INJECTED_TRANSPORT_NOT_ATTESTED',providerVerified:false,
   requestsClaimed:rows.length,reservedTokens:rows.reduce((a,x)=>a+x.reservedTokens,0),
   measuredTokens:rows.reduce((a,x)=>a+(x.usedTokens||0),0),records:rows};
 }
 const store=Object.freeze({claim,finish,uncertain,status,close:()=>db.close()});
 branded.add(store);
 return store;
}