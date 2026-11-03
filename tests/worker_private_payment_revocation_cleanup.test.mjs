import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createWorkerPrivatePaymentClaimRoute} from '../src/worker_private_payment_claim_route.mjs';

const ORIGIN='https://proofline-fixture.invalid';
const MERCHANT='PAYPALMERCH13',OWNER='owner1',ISSUER='https://idp.invalid';
const SUBJECT='a'.repeat(64),T=1800000000000;
const TOKEN=Buffer.alloc(32,8).toString('base64url');
const DIGEST=createHash('sha256').update(TOKEN).digest('hex');
function setup({afterClaim,failCleanup=false}={}){
 const sql=new DatabaseSync(':memory:');
 for(const name of ['0001_payment_claims.sql','0002_worker_private_sessions.sql',
 '0003_worker_private_oidc.sql','0004_worker_private_binding_epoch.sql'])
  sql.exec(readFileSync(new URL('../migrations/d1/'+name,import.meta.url),'utf8'));
 sql.prepare('INSERT INTO worker_private_oidc_bindings(issuer,subject_hmac,actor_id,merchant_id,role) VALUES(?,?,?,?,?)')
 .run(ISSUER,SUBJECT,OWNER,MERCHANT,'OWNER');
 sql.prepare('INSERT INTO worker_private_sessions(token_sha256,actor_id,merchant_id,role,issuer,issuer_verified_at_ms,expires_at_ms,binding_subject_hmac,binding_revision) VALUES(?,?,?,?,?,?,?,?,1)')
 .run(DIGEST,OWNER,MERCHANT,'OWNER',ISSUER,T-1000,T+60000,SUBJECT);
 sql.prepare('INSERT INTO quotes(id,owner_id,merchant_id,version,currency,status,approval_actor,approval_version,approval_amount_minor) VALUES(?,?,?,?,?,?,?,?,?)')
 .run('quote1',OWNER,MERCHANT,1,'USD','APPROVED',OWNER,1,150);
 let attempts=0,cleanups=0;
 const db={withSession(mode){assert.equal(mode,'first-primary');return {
  prepare(query){return {bind(...parameters){return {
    async first(){return sql.prepare(query).get(...parameters)??null;},
    async run(){
     if(query.startsWith("UPDATE payment_attempts SET state='UNKNOWN'")){
      cleanups++;
      if(failCleanup)throw Error('INJECTED_D1_CLEANUP_OUTAGE');
     }
     const out=sql.prepare(query).run(...parameters);
     if(query.startsWith('INSERT INTO payment_attempts')){
      attempts++;
      if(afterClaim)afterClaim(sql,attempts);
     }
     return {meta:{changes:out.changes}};
    }
  }}}}
 };}};
 return {sql,db,handler:createWorkerPrivatePaymentClaimRoute({db,allowedOrigin:ORIGIN,enabled:true,now:()=>T}),
  stats:()=>({attempts,cleanups})};
}
function request(id='req1'){
 return new Request(ORIGIN+'/__private/paypal/create-claim',{method:'POST',headers:{
   origin:ORIGIN,'sec-fetch-site':'same-origin',
   'x-proofline-intent':'first-claim-no-provider','content-type':'application/json',
   cookie:'__Host-proofline_session='+TOKEN
  },body:JSON.stringify({requestId:id,quoteId:'quote1',quoteVersion:1})});
}
const record=sql=>sql.prepare('SELECT state,remote_id FROM payment_attempts').get();
test('revocation after first claim transitions orphan IN_FLIGHT to UNKNOWN, with zero provider calls',async()=>{
 const f=setup({afterClaim:sql=>sql.prepare('UPDATE worker_private_sessions SET revoked_at_ms=? WHERE token_sha256=?').run(T-1,DIGEST)});
 const response=await f.handler.fetch(request());
 assert.equal(response.status,401);
 const data=await response.json();
 assert.equal(data.paymentAuthorized,false);assert.equal(data.providerCalls,0);
 assert.equal(record(f.sql).state,'UNKNOWN');
 assert.deepEqual(f.stats(),{attempts:1,cleanups:1});
 f.sql.close();
});
test('OIDC binding change after first claim moves orphan to UNKNOWN',async()=>{
 const f=setup({afterClaim:sql=>sql.prepare('UPDATE worker_private_oidc_bindings SET active=0 WHERE issuer=?').run(ISSUER)});
 assert.equal((await f.handler.fetch(request())).status,401);
 assert.equal(record(f.sql).state,'UNKNOWN');
 assert.equal(f.stats().cleanups,1);
 f.sql.close();
});
test('cleanup D1 failure still denies and preserves IN_FLIGHT; no unsafe replay',async()=>{
 const f=setup({afterClaim:sql=>sql.prepare('UPDATE worker_private_sessions SET revoked_at_ms=?').run(T-1),failCleanup:true});
 const response=await f.handler.fetch(request());
 assert.equal(response.status,401);
 assert.equal((await response.json()).providerCalls,0);
 assert.equal(record(f.sql).state,'IN_FLIGHT');
 assert.equal(f.stats().cleanups,1);
 f.sql.close();
});
test('duplicate owner claim cannot run orphan cleanup on a pre-existing winner',async()=>{
 const f=setup({afterClaim:(sql,attempt)=>{
  if(attempt===2)sql.prepare('UPDATE worker_private_sessions SET revoked_at_ms=?').run(T-1);
 }});
 assert.equal((await f.handler.fetch(request())).status,201);
 assert.equal((await f.handler.fetch(request('req2'))).status,401);
 assert.equal(record(f.sql).state,'IN_FLIGHT');
 assert.equal(f.stats().cleanups,0);
 f.sql.close();
});
test('cleanup retains durable remote order ID and never asserts a payment',async()=>{
 const f=setup({afterClaim:sql=>{
  sql.prepare('UPDATE payment_attempts SET remote_id=?').run('ORDER_001');
  sql.prepare('UPDATE worker_private_sessions SET revoked_at_ms=?').run(T-1);
 }});
 const response=await f.handler.fetch(request());
 assert.equal(response.status,401);
 const data=await response.json();
 assert.equal(data.captureAuthorized,false);
 assert.equal(record(f.sql).state,'UNKNOWN');
 assert.equal(record(f.sql).remote_id,'ORDER_001');
 f.sql.close();
});
