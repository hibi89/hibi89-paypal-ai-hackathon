import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createPrivateWorkerRecentAttemptsHandler} from '../src/worker_private_recent_attempts.mjs';
import {createPrivateWorkerIdentityReadRouter} from '../src/worker_private_identity_read_router.mjs';
const ORIGIN='https://proofline.example.test',NOW=1_800_000_000_000;
const TOKEN='a'.repeat(43);
const SQL=['0001_payment_claims.sql','0002_worker_private_sessions.sql',
 '0003_worker_private_oidc.sql','0004_worker_private_binding_epoch.sql']
 .map(x=>readFileSync(new URL('../migrations/d1/'+x,import.meta.url),'utf8'));
const URL=ORIGIN+'/__private/attempts';

function fixture(){
 const sql=new DatabaseSync(':memory:');
 for(const m of SQL)sql.exec(m);
 const binding='b'.repeat(64);
 sql.prepare('INSERT INTO worker_private_oidc_bindings (issuer,subject_hmac,actor_id,merchant_id,role,active) VALUES(?,?,?,?,?,?)')
  .run('fixture-only',binding,'owner','merchant','OWNER',1);
 sql.prepare('INSERT INTO worker_private_sessions (token_sha256,actor_id,merchant_id,role,issuer,issuer_verified_at_ms,expires_at_ms,binding_subject_hmac,binding_revision) VALUES(?,?,?,?,?,?,?,?,?)')
  .run(createHash('sha256').update(TOKEN).digest('hex'),'owner','merchant','OWNER',
   'fixture-only',NOW-3000,NOW+60000,binding,1);
 const add=(id,owner,merchant,req)=>{
  sql.prepare('INSERT INTO quotes (id,owner_id,merchant_id,version,currency,status,approval_actor,approval_version,approval_amount_minor) VALUES(?,?,?,?,?,?,?,?,?)')
   .run(id,owner,merchant,1,'USD','APPROVED',owner,1,1500);
  sql.prepare('INSERT INTO payment_attempts (request_id,quote_id,quote_version,merchant_id,operation,state,amount_minor,currency) VALUES(?,?,?,?,?,?,?,?)')
   .run(req,id,1,merchant,'create','IN_FLIGHT',1500,'USD');
 };
 add('qOwned','owner','merchant','reqOwned');
 add('qOtherOwner','other','merchant','reqOtherOwner');
 add('qOtherMerchant','owner','other','reqOtherMerchant');
 let reads=0,writes=0;
 const db={withSession(mode){
  assert.equal(mode,'first-primary');
  return {prepare(query){
   return {bind(...args){
    return {async first(){reads++;return sql.prepare(query).get(...args)??null;},
     async all(){reads++;return {success:true,results:sql.prepare(query).all(...args)};},
     async run(){writes++;return sql.prepare(query).run(...args);}};
   }};
  }};
 }};
 const handler=createPrivateWorkerRecentAttemptsHandler({db,allowedOrigin:ORIGIN,now:()=>NOW});
 const req=(path=URL,init={})=>new Request(path,{
  ...init,headers:{cookie:'__Host-proofline_session='+TOKEN,
   'sec-fetch-site':'same-origin',...init.headers}});
 return {sql,handler,db,req,stats:()=>({reads,writes}),close:()=>sql.close()};
}
const withDb=fn=>async()=>{const f=fixture();try{await fn(f);}finally{f.close();}};
test('private recent attempts returns only matching owner AND merchant, never remote payment evidence',
 withDb(async f=>{
  const response=await f.handler.fetch(f.req());
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.count,1);
  assert.equal(data.attempts[0].requestId,'reqOwned');
  assert.equal(data.attempts[0].quoteId,'qOwned');
  assert.equal(data.attempts[0].localState,'IN_FLIGHT');
  assert.equal(data.source,'D1_LOCAL_METADATA_ONLY');
  assert.equal(data.verifiedPayPalGet,false);
  assert.equal(data.paymentAuthorized,false);assert.equal(data.providerCalls,0);
  assert.equal('remoteId' in data.attempts[0],false);
  assert.equal(JSON.stringify(data).includes('reqOther'),false);
  assert.equal(response.headers.get('cache-control'),'no-store, max-age=0');
  assert.equal(response.headers.get('access-control-allow-origin'),null);
  assert.equal(f.stats().writes,0);
 }));
test('strict query and HTTP method validation happens before D1',
 withDb(async f=>{
  const before=f.stats().reads;
  for(const path of [URL+'?limit=0',URL+'?limit=21',URL+'?limit=01',
   URL+'?limit=2&limit=2',URL+'?ownerId=owner',URL+'?limit=999999'])
   assert.equal((await f.handler.fetch(f.req(path))).status,400);
  assert.equal((await f.handler.fetch(f.req(URL,{method:'POST'}))).status,405);
  assert.equal((await f.handler.fetch(f.req(URL,{headers:{'sec-fetch-site':'cross-site'}}))).status,403);
  assert.equal((await f.handler.fetch(f.req(URL,{headers:{origin:'https://evil.test'}}))).status,403);
  assert.equal((await f.handler.fetch(f.req('https://evil.test/__private/attempts'))).status,403);
  assert.equal(f.stats().reads,before);
  assert.equal(f.stats().writes,0);
 }));
test('limit bounded to 20, default 10 and no payment writes',
 withDb(async f=>{
  for(const path of [URL,URL+'?limit=1',URL+'?limit=20']){
   const res=await f.handler.fetch(f.req(path));
   assert.equal(res.status,200);
   assert.equal((await res.json()).count,1);
  }
  assert.equal(f.stats().writes,0);
 }));
test('missing, expired or revoked session cannot list even if quote belongs to owner',
 withDb(async f=>{
  assert.equal((await f.handler.fetch(f.req(URL,{headers:{cookie:''}}))).status,401);
  f.sql.exec('UPDATE worker_private_oidc_bindings SET active=0');
  assert.equal((await f.handler.fetch(f.req())).status,401);
  assert.equal(f.stats().writes,0);
 }));
test('D1 errors are generic and never leak SQL/server details',async()=>{
 const db={withSession(){throw Error('SECRET_SQLITE_TABLE')}};
 const list=createPrivateWorkerRecentAttemptsHandler({db,allowedOrigin:ORIGIN,now:()=>NOW});
 const res=await list.fetch(new Request(URL,{headers:{
  cookie:'__Host-proofline_session='+TOKEN
 }}));
 assert.equal(res.status,503);
 assert.deepEqual(await res.json(),{error:'DEPENDENCY_UNAVAILABLE'});
});
test('private OIDC router integrates the read-only list but leaves payment routes hidden',
 withDb(async f=>{
  const router=createPrivateWorkerIdentityReadRouter({
   db:f.db,allowedOrigin:ORIGIN,enabled:true,now:()=>NOW,
   authority:{revoke:async()=>({revoked:false})},
   pkceCoordinator:{start:async()=>new Response('start'),
    callback:async()=>new Response('callback')}
  });
  const res=await router.fetch(f.req(URL+'?limit=5'));
  assert.equal(res.status,200);
  assert.equal((await res.json()).attempts[0].requestId,'reqOwned');
  assert.equal((await router.fetch(f.req(ORIGIN+'/api/paypal/capture',
   {method:'POST'}))).status,404);
  assert.equal(f.stats().writes,0);
 }));
