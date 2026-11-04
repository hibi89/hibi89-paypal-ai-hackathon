import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {claimD1OperationOnce} from '../src/d1_claim.mjs';
import {createD1RecoveryBoundary} from '../src/d1_recovery.mjs';
const sql=readFileSync(new URL('../migrations/d1/0001_payment_claims.sql',import.meta.url),'utf8');
const ids={quoteId:'q1',quoteVersion:2,operation:'create',requestId:'create-key'};
const principal={verified:true,actorId:'owner',merchantId:'merchant'};
function setup(){
  const folder=mkdtempSync(join(tmpdir(),'d1-recover-'));
  const path=join(folder,'d1.sqlite');
  const root=new DatabaseSync(path);
  root.exec('PRAGMA foreign_keys=ON;');root.exec(sql);
  root.exec("INSERT INTO quotes(id,owner_id,merchant_id,version,currency,status,approval_actor,approval_version,approval_amount_minor) VALUES('q1','owner','merchant',2,'USD','APPROVED','owner',2,1500)");
  root.close();
  const handles=[];
  function open(){
    const raw=new DatabaseSync(path);
    raw.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=2000');
    handles.push(raw);
    const db={prepare(query){return {bind(...a){return {
      async first(){return raw.prepare(query).get(...a)??null;},
      async run(){const result=raw.prepare(query).run(...a);
        return {success:true,meta:{changes:Number(result.changes)}};
      }
    }}}}};
    return {raw,db};
  }
  return {open,close(){for(const x of handles)x.close();rmSync(folder,{recursive:true,force:true});}};
}
const using=fn=>async()=>{
  const env=setup();try{await fn(env);}finally{env.close();}
};
async function claimed(env){
 const x=env.open();
 await claimD1OperationOnce({db:x.db,...ids,actorId:'owner',merchantId:'merchant'});
 return x;
}
const reader=(db,resolveSession=async()=>principal,authorizeRecovery)=>
 createD1RecoveryBoundary({db,resolveSession,authorizeRecovery});

test('inspect SELECT reports provider GET required without state or token mutation',using(async env=>{
 const x=await claimed(env);
 const count=x.raw.prepare('SELECT COUNT(*) AS n FROM payment_attempts').get().n;
 const before=x.raw.prepare('SELECT state,observed_at FROM payment_attempts').get();
 const result=await reader(x.db).inspect({request:{},...ids});
 assert.equal(result.action,'RECONCILE_GET_FIRST');
 assert.equal(result.mode,'LOCAL_DB_METADATA_NOT_REMOTE_PROVIDER_PROOF');
 assert.equal(result.verifiedPayPalGet,false);
 assert.equal(result.allowProviderPost,false);
 assert.equal(result.remoteIdPresent,false);
 assert.equal(result.merchantId,undefined);
 assert.equal(result.requestId,undefined);
 assert.equal(x.raw.prepare('SELECT COUNT(*) AS n FROM payment_attempts').get().n,count);
 assert.deepEqual(x.raw.prepare('SELECT state,observed_at FROM payment_attempts').get(),before);
}));
test('refresh five times remains read-only',using(async env=>{
 const x=await claimed(env),b=reader(x.db);
 for(let i=0;i<5;i++)assert.equal((await b.inspect({...ids,request:{}})).state,'IN_FLIGHT');
 assert.equal(x.raw.prepare('SELECT state FROM payment_attempts').get().state,'IN_FLIGHT');
}));
test('resolver is mandatory; forged role flags do not authenticate',using(async env=>{
 const x=await claimed(env);
 assert.throws(()=>createD1RecoveryBoundary({db:x.db}),{code:'TRUSTED_SESSION_RESOLVER_REQUIRED'});
 for(const identity of [null,{verified:false,actorId:'owner',merchantId:'merchant'},
   {verified:true,actorId:'?',merchantId:'merchant'}]) {
   await assert.rejects(reader(x.db,async()=>identity)
     .inspect({...ids,request:{verified:true,actorId:'owner'}}),
     {code:'UNAUTHENTICATED'});
 }
 const denied=reader(x.db,async()=>{throw Error('DO_NOT_ECHO_PRIVATE')});
 await assert.rejects(denied.inspect({...ids,request:{}}),{code:'UNAUTHENTICATED'});
}));
test('foreign owner/merchant cannot discover requestId or status',using(async env=>{
 const x=await claimed(env);
 for(const fake of [
 {verified:true,actorId:'intruder',merchantId:'merchant'},
 {verified:true,actorId:'owner',merchantId:'other'}]) {
   await assert.rejects(reader(x.db,async()=>fake).inspect({...ids,request:{}}),
     {code:'ATTEMPT_NOT_FOUND'});
 }
 await assert.rejects(reader(x.db).inspect({...ids,request:{},requestId:'missing'}),
   {code:'ATTEMPT_NOT_FOUND'});
}));
test('invalid quote, operation and request key rejected before any resolver',using(async env=>{
 const x=await claimed(env);
 const a=reader(x.db,async()=>{throw Error('UNEXPECTED_RESOLVER')});
 for(const patch of [{quoteVersion:0},{quoteId:'?x'},{operation:'delete'},{requestId:''}])
 await assert.rejects(a.inspect({...ids,...patch,request:{}}),{code:'INVALID_D1_RECOVERY_INPUT'});
}));
test('recovery disabled without independently injected internal permission',using(async env=>{
 const x=await claimed(env);
 await assert.rejects(reader(x.db).recoverStale({...ids,request:{}}),
   {code:'INTERNAL_RECOVERY_AUTHORIZATION_REQUIRED'});
 for(const grant of [async()=>false,async()=>{throw Error('No permissions')}]) {
   await assert.rejects(reader(x.db,async()=>principal,grant)
     .recoverStale({...ids,request:{}}),
     {code:'INTERNAL_RECOVERY_AUTHORIZATION_REQUIRED'});
 }
 assert.equal(x.raw.prepare('SELECT state FROM payment_attempts').get().state,'IN_FLIGHT');
}));
test('fresh IN_FLIGHT cannot be marked UNKNOWN even with internal permission',using(async env=>{
 const x=await claimed(env),boundary=reader(x.db,async()=>principal,async()=>true);
 const r=await boundary.recoverStale({...ids,request:{}});
 assert.equal(r.transitioned,false);
 assert.equal(r.state,'IN_FLIGHT');
}));
test('stale IN_FLIGHT becomes UNKNOWN exactly once and persists across reconnect',using(async env=>{
 const x=await claimed(env);
 x.raw.exec("UPDATE payment_attempts SET created_at='2020-01-01 00:00:00'");
 const a=reader(x.db,async()=>principal,async()=>true);
 const changed=await a.recoverStale({...ids,request:{}});
 assert.equal(changed.transitioned,true);
 assert.equal(changed.state,'UNKNOWN');
 const again=await reader(env.open().db,async()=>principal,async()=>true)
    .recoverStale({...ids,request:{}});
 assert.equal(again.transitioned,false);
 assert.equal(again.action,'RECONCILE_GET_FIRST');
 const duplicate=await claimD1OperationOnce({db:env.open().db,...ids,actorId:'owner',merchantId:'merchant'});
 assert.equal(duplicate.action,'RECONCILE_GET_FIRST');
}));
test('APPROVED and PAID are never downgraded by recovery',using(async env=>{
 const x=await claimed(env);
 x.raw.exec("UPDATE payment_attempts SET created_at='2020-01-01 00:00:00',state='APPROVED',remote_id='test-order'");
 const boundary=reader(x.db,async()=>principal,async()=>true);
 const approved=await boundary.recoverStale({...ids,request:{}});
 assert.equal(approved.transitioned,false);
 assert.equal(approved.state,'APPROVED');
 assert.equal(approved.remoteIdPresent,true);
 assert.equal(approved.verifiedPayPalGet,false);
 x.raw.exec("UPDATE payment_attempts SET state='PAID'");
 const paid=await boundary.recoverStale({...ids,request:{}});
 assert.equal(paid.transitioned,false);
 assert.equal(paid.state,'PAID');
 assert.equal(paid.allowProviderPost,false);
}));
test('other-tenant internal recovery is denied before SQL mutation',using(async env=>{
 const x=await claimed(env);
 x.raw.exec("UPDATE payment_attempts SET created_at='2020-01-01 00:00:00'");
 const intruder=reader(x.db,async()=>({...principal,actorId:'stranger'}),async()=>true);
 await assert.rejects(intruder.recoverStale({...ids,request:{}}),{code:'ATTEMPT_NOT_FOUND'});
 assert.equal(x.raw.prepare('SELECT state FROM payment_attempts').get().state,'IN_FLIGHT');
}));
test('malformed D1 update metadata rejects success rather than guessing',using(async env=>{
 const x=await claimed(env);
 const bad={prepare(sql){const prepared=x.db.prepare(sql);return {
   bind(...args){const inner=prepared.bind(...args);
     return {first:()=>inner.first(),run:async()=>({success:false,meta:{changes:1}})};
   }
 }}};
 await assert.rejects(reader(bad,async()=>principal,async()=>true)
   .recoverStale({...ids,request:{}}),{code:'D1_RECOVERY_WRITE_UNVERIFIED'});
}));
