import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createWorkerPrivatePaymentClaimRoute} from '../src/worker_private_payment_claim_route.mjs';
import {createPrivateWorkerIdentityReadRouter} from '../src/worker_private_identity_read_router.mjs';
const ORIGIN='https://proofline-fixture.invalid';
const MERCHANT='PAYPALMERCH13', OWNER='ciOwner', ISSUER='https://issuer.invalid';
const SUBJECT='a'.repeat(64),T=1800000000000;
const TOKEN=Buffer.alloc(32,7).toString('base64url');
const HASH=createHash('sha256').update(TOKEN).digest('hex');
function fixture({afterClaim}={}){
 const sql=new DatabaseSync(':memory:');
 for(const name of ['0001_payment_claims.sql','0002_worker_private_sessions.sql',
  '0003_worker_private_oidc.sql','0004_worker_private_binding_epoch.sql'])
  sql.exec(readFileSync(new URL('../migrations/d1/'+name,import.meta.url),'utf8'));
 sql.prepare('INSERT INTO worker_private_oidc_bindings(issuer,subject_hmac,actor_id,merchant_id,role) VALUES(?,?,?,?,?)')
  .run(ISSUER,SUBJECT,OWNER,MERCHANT,'OWNER');
 sql.prepare('INSERT INTO worker_private_sessions(token_sha256,actor_id,merchant_id,role,issuer,issuer_verified_at_ms,expires_at_ms,binding_subject_hmac,binding_revision) VALUES(?,?,?,?,?,?,?,?,1)')
  .run(HASH,OWNER,MERCHANT,'OWNER',ISSUER,T-1000,T+60000,SUBJECT);
 sql.prepare('INSERT INTO quotes(id,owner_id,merchant_id,version,currency,status,approval_actor,approval_version,approval_amount_minor) VALUES(?,?,?,?,?,?,?,?,?)')
  .run('ciQuote',OWNER,MERCHANT,1,'USD','APPROVED',OWNER,1,150);
 const db={withSession(mode){
  assert.equal(mode,'first-primary');
  return {prepare(query){return {bind(...args){return {
   async first(){return sql.prepare(query).get(...args)??null;},
   async run(){const result=sql.prepare(query).run(...args);
    if(afterClaim&&query.startsWith('INSERT INTO payment_attempts'))afterClaim(sql);
    return {meta:{changes:result.changes}};}
  }}}}};
 }};
 return {sql,db,handler:createWorkerPrivatePaymentClaimRoute({
  db,allowedOrigin:ORIGIN,enabled:true,now:()=>T})};
}
function req({path='/__private/paypal/create-claim',body,
 method='POST',headers={}}={}){
 const intent=path.endsWith('claim-recovery')?'inspect-recovery-only':'first-claim-no-provider';
 return new Request(ORIGIN+path,{method,
  headers:{origin:ORIGIN,'sec-fetch-site':'same-origin',
   'x-proofline-intent':intent,'content-type':'application/json',
   cookie:'__Host-proofline_session='+TOKEN,...headers},
  ...(method==='POST'?{body:JSON.stringify(body??{
   requestId:'req1',quoteId:'ciQuote',quoteVersion:1})}:{})});
}
test('authenticated OIDC owner can claim once; retry is rejected and recovery is inspect-only',async()=>{
 const f=fixture();
 const first=await f.handler.fetch(req());
 assert.equal(first.status,201);
 assert.deepEqual(await first.json(),{
  status:'IN_FLIGHT',claimed:true,remoteOrderCreated:false,
  paymentAuthorized:false,providerCalls:0,captureAuthorized:false});
 const repeated=await f.handler.fetch(req());
 assert.equal(repeated.status,409);
 assert.equal((await repeated.json()).claimed,false);
 const recovery=await f.handler.fetch(req({path:'/__private/paypal/claim-recovery'}));
 assert.equal(recovery.status,200);
 const detail=await recovery.json();
 assert.equal(detail.next,'IN_FLIGHT_DO_NOT_RETRY');
 assert.equal(detail.paymentAuthorized,false);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM payment_attempts').get().n,1);
 f.sql.close();
});
test('missing, revoked, inactive or reassigned OIDC session cannot write D1 claims',async()=>{
 for(const mutation of [
  sql=>sql.prepare('DELETE FROM worker_private_sessions WHERE token_sha256=?').run(HASH),
  sql=>sql.prepare('UPDATE worker_private_sessions SET revoked_at_ms=? WHERE token_sha256=?').run(T-1,HASH),
  sql=>sql.prepare('UPDATE worker_private_oidc_bindings SET active=0 WHERE issuer=?').run(ISSUER),
  sql=>sql.prepare('UPDATE worker_private_oidc_bindings SET actor_id=? WHERE issuer=?').run('changed',ISSUER)
 ]){
  const f=fixture();mutation(f.sql);
  const res=await f.handler.fetch(req());
  assert.equal(res.status,401);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM payment_attempts').get().n,0);
  f.sql.close();
 }
});
test('client-supplied owner, merchant, remote order and unknown keys fail schema before D1',async()=>{
 const f=fixture();
 for(const field of [
  {ownerId:'attacker'},{merchantId:MERCHANT},{remoteId:'FAKE'},
  {amountMinor:999},{paymentAuthorized:true}
 ]){
  const bad=await f.handler.fetch(req({body:{
   requestId:'req1',quoteId:'ciQuote',quoteVersion:1,...field}}));
  assert.equal(bad.status,400);
 }
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM payment_attempts').get().n,0);
 f.sql.close();
});
test('cross-origin, wrong intent, method, malformed JSON, excess body fail closed',async()=>{
 const f=fixture();
 for(const request of [
  req({headers:{origin:'https://attacker.invalid'}}),
  req({headers:{'sec-fetch-site':'cross-site'}}),
  req({headers:{'x-proofline-intent':'capture'}}),
  req({method:'GET'}),
  req({body:{requestId:'r',quoteId:'q',quoteVersion:0}}),
  req({body:{requestId:'req1',quoteId:'ciQuote',quoteVersion:1,
   padding:'x'.repeat(800)}}),
  req({path:'/__private/paypal/other'})
 ]){
  const response=await f.handler.fetch(request);
  assert.notEqual(response.status,201);
 }
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM payment_attempts').get().n,0);
 f.sql.close();
});
test('OIDC revocation during D1 claim causes 401 even after first-winner write; no provider calls',async()=>{
 const f=fixture({afterClaim:sql=>sql.prepare(
  'UPDATE worker_private_sessions SET revoked_at_ms=? WHERE token_sha256=?').run(T-1,HASH)});
 const response=await f.handler.fetch(req());
 assert.equal(response.status,401);
 const body=await response.json();
 assert.equal(body.paymentAuthorized,false);
 assert.equal(body.providerCalls,0);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM payment_attempts').get().n,1);
 f.sql.close();
});
test('private identity router is dark by default and routes only when explicit opt-in',async()=>{
 const f=fixture();
 const authority={revoke:async()=>{throw Error('UNUSED')}};
 const pkceCoordinator={start:async()=>new Response(null,{status:503}),
  callback:async()=>new Response(null,{status:503})};
 const dark=createPrivateWorkerIdentityReadRouter({
  db:f.db,allowedOrigin:ORIGIN,authority,pkceCoordinator,enabled:true,now:()=>T});
 assert.equal((await dark.fetch(req())).status,404);
 const enabled=createPrivateWorkerIdentityReadRouter({
  db:f.db,allowedOrigin:ORIGIN,authority,pkceCoordinator,enabled:true,
  paymentClaimEnabled:true,now:()=>T});
 assert.equal((await enabled.fetch(req())).status,201);
 assert.equal((await enabled.fetch(req({
  path:'/__private/paypal/claim-recovery'}))).status,200);
 f.sql.close();
});
