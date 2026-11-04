import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {claimD1OperationOnce} from '../src/d1_claim.mjs';

const sql=readFileSync(new URL('../migrations/d1/0001_payment_claims.sql',import.meta.url),'utf8');
const base={quoteId:'q1',actorId:'owner',merchantId:'merchant',
 quoteVersion:2,operation:'create',requestId:'create-key'};
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'d1-offline-')),path=join(dir,'test.sqlite');
 const seed=new DatabaseSync(path);
 seed.exec('PRAGMA foreign_keys=ON');seed.exec(sql);
 seed.exec("INSERT INTO quotes(id,owner_id,merchant_id,version,currency,status,approval_actor,approval_version,approval_amount_minor) VALUES('q1','owner','merchant',2,'USD','APPROVED','owner',2,1500)");
 seed.close();
 const handles=[];
 function open(){
  const raw=new DatabaseSync(path);
  raw.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=1000');
  handles.push(raw);
  return {raw,prepare(statement){return {bind(...args){return {
   async run(){const r=raw.prepare(statement).run(...args);
    return {success:true,meta:{changes:Number(r.changes)}}},
   async first(){return raw.prepare(statement).get(...args)??null}
  }}}}};
 }
 return {open,close(){for(const h of handles)h.close();rmSync(dir,{recursive:true,force:true})}};
}
const use=fn=>async()=>{const f=fixture();try{await fn(f)}finally{f.close()}};
test('first create is unique; duplicate must reconcile, not POST',use(async f=>{
 const db=f.open();
 assert.equal((await claimD1OperationOnce({db,...base})).action,
   'FIRST_CLAIM_ONLY_NO_PROVIDER_CALL');
 assert.equal((await claimD1OperationOnce({db,...base})).action,'RECONCILE_GET_FIRST');
 assert.equal(db.raw.prepare('SELECT count(*) AS n FROM payment_attempts').get().n,1);
}));
test('two connections issue exactly one first claim',use(async f=>{
 const a=f.open(),b=f.open();
 const r=await Promise.all([claimD1OperationOnce({db:a,...base}),
 claimD1OperationOnce({db:b,...base})]);
 assert.deepEqual(r.map(x=>x.action).sort(),
 ['FIRST_CLAIM_ONLY_NO_PROVIDER_CALL','RECONCILE_GET_FIRST']);
}));
test('foreign actor and merchant get neither claim nor prior attempt',use(async f=>{
 const db=f.open();await claimD1OperationOnce({db,...base});
 for(const extra of [{actorId:'stranger'},{merchantId:'stranger'}]){
  await assert.rejects(claimD1OperationOnce({db,...base,...extra}),
   {code:'D1_CLAIM_PRECONDITION_OR_CONFLICT'});
 }
}));
test('stale version and alternative request key cannot bypass unique claim',use(async f=>{
 const db=f.open();await claimD1OperationOnce({db,...base});
 for(const extra of [{quoteVersion:1},{requestId:'different'}]){
 await assert.rejects(claimD1OperationOnce({db,...base,...extra}),
 {code:'D1_CLAIM_PRECONDITION_OR_CONFLICT'});
 }
}));
test('capture requires approved order proof; synthetic fixture alone',use(async f=>{
 const db=f.open(),capture={...base,operation:'capture',requestId:'capture-key'};
 await assert.rejects(claimD1OperationOnce({db,...capture}),
 {code:'D1_CLAIM_PRECONDITION_OR_CONFLICT'});
 await claimD1OperationOnce({db,...base});
 await assert.rejects(claimD1OperationOnce({db,...capture}),
 {code:'D1_CLAIM_PRECONDITION_OR_CONFLICT'});
 db.raw.exec("UPDATE payment_attempts SET state='APPROVED',remote_id='test-order'");
 assert.equal((await claimD1OperationOnce({db,...capture})).action,
 'FIRST_CLAIM_ONLY_NO_PROVIDER_CALL');
 assert.equal((await claimD1OperationOnce({db,...capture})).action,'RECONCILE_GET_FIRST');
}));
test('UNKNOWN after restart remains occupied',use(async f=>{
 const db=f.open();await claimD1OperationOnce({db,...base});
 db.raw.exec("UPDATE payment_attempts SET state='UNKNOWN'");
 const after=f.open();
 assert.equal((await claimD1OperationOnce({db:after,...base})).action,
  'RECONCILE_GET_FIRST');
}));
test('invalid inputs fail before SQL',async()=>{
 for(const extra of [{db:null},{operation:'live'},{actorId:'?bad'},{quoteVersion:0}]){
 const db={prepare(){throw Error('DB_CALL_FORBIDDEN')}};
 await assert.rejects(claimD1OperationOnce({db,...base,...extra}),
 {code:extra.db===null?'D1_BINDING_REQUIRED':'INVALID_D1_CLAIM'});
 }
});
test('SQL guards approval, FK, immutable quote, duplicate and safe rerun',use(async f=>{
 const db=f.open();await claimD1OperationOnce({db,...base});
 assert.throws(()=>db.raw.exec("UPDATE quotes SET approval_amount_minor=9000"));
 assert.throws(()=>db.raw.exec("DELETE FROM quotes WHERE id='q1'"));
 assert.throws(()=>db.raw.exec("INSERT INTO payment_attempts(request_id,quote_id,quote_version,merchant_id,operation,state,amount_minor,currency) VALUES('duplicate','q1',2,'merchant','create','IN_FLIGHT',1500,'USD')"));
 assert.throws(()=>db.raw.exec("INSERT INTO payment_attempts(request_id,quote_id,quote_version,merchant_id,operation,state,amount_minor,currency) VALUES('fk','missing',2,'merchant','capture','PAID',1500,'USD')"));
 db.raw.exec(sql);
 assert.equal(db.raw.prepare('SELECT count(*) AS n FROM payment_attempts').get().n,1);
}));
test('untrusted D1 metadata cannot produce a first claim',async()=>{
 const db={prepare(){return {bind(){return {async run(){
 return {success:false,meta:{changes:1}}}}}}}};
 await assert.rejects(claimD1OperationOnce({db,...base}),
 {code:'D1_CLAIM_RESULT_UNVERIFIED'});
});
