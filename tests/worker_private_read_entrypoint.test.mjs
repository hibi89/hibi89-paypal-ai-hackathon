import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomBytes} from 'node:crypto';
import {createPrivateWorkerReadHandler} from '../src/worker_private_read_entrypoint.mjs';

const origin='https://proofline.example.test';
const schema=readFileSync(new URL('../migrations/d1/0001_payment_claims.sql',import.meta.url),'utf8');
const sessions=readFileSync(new URL('../migrations/d1/0002_worker_private_sessions.sql',import.meta.url),'utf8');
const token=randomBytes(32).toString('base64url');
const hash=createHash('sha256').update(token).digest('hex');
const clock=1_800_000_000_000;
const url=origin+'/__private/attempt/status?quoteId=q1&quoteVersion=2&operation=create&requestId=req1';

function fixture(){
 const root=mkdtempSync(join(tmpdir(),'paypal-worker-private-'));
 const filename=join(root,'db.sqlite');
 const seed=new DatabaseSync(filename);
 seed.exec(schema);seed.exec(sessions);
 seed.prepare(`INSERT INTO quotes(id,owner_id,merchant_id,version,currency,status,
 approval_actor,approval_version,approval_amount_minor)
 VALUES(?,?,?,?,?,?,?,?,?)`).run('q1','owner','merchant',2,'USD','APPROVED','owner',2,1500);
 seed.prepare(`INSERT INTO payment_attempts(request_id,quote_id,quote_version,merchant_id,
 operation,state,amount_minor,currency) VALUES(?,?,?,?,?,?,?,?)`)
 .run('req1','q1',2,'merchant','create','IN_FLIGHT',1500,'USD');
 seed.prepare(`INSERT INTO worker_private_sessions(token_sha256,actor_id,merchant_id,
 role,issuer,issuer_verified_at_ms,expires_at_ms) VALUES(?,?,?,?,?,?,?)`)
 .run(hash,'owner','merchant','OWNER','fixture-idp-not-real',clock-3000,clock+60000);
 const handles=[];const calls={sessions:[],reads:0,writes:0};
 const db={withSession(mode){
   calls.sessions.push(mode);
   const connection=new DatabaseSync(filename);handles.push(connection);
   return {prepare(query){return {bind(...params){return {
     async first(){calls.reads++;return connection.prepare(query).get(...params)??null;},
     async run(){calls.writes++;const res=connection.prepare(query).run(...params);
      return {success:true,meta:{changes:Number(res.changes)}};}
   };}};}};
 }};
 const app=createPrivateWorkerReadHandler({db,allowedOrigin:origin,now:()=>clock});
 const req=(path=url,init={})=>new Request(path,{...init,headers:{
   'cookie':'__Host-proofline_session='+token,'sec-fetch-site':'same-origin',
   ...init.headers}});
 const send=(path=url,init)=>app.fetch(req(path,init));
 function cleanup(){for(const conn of handles)conn.close();seed.close();rmSync(root,{recursive:true,force:true});}
 return {seed,db,app,calls,req,send,cleanup};
}
async function withDb(fn){const f=fixture();try{await fn(f);}finally{f.cleanup();}}
const json=r=>r.json();

test('authorized HTTPS GET returns owned D1 metadata only, without payment side effects',
 async()=>withDb(async f=>{
   const r=await f.send();const b=await json(r);
   assert.equal(r.status,200);
   assert.equal(b.state,'IN_FLIGHT');assert.equal(b.allowProviderPost,false);
   assert.equal(b.verifiedPayPalGet,false);assert.equal(b.paymentAuthorized,false);
   assert.equal(b.providerCalls,0);
   assert.equal('token_sha256' in b,false);
   assert.equal(r.headers.get('cache-control'),'no-store, max-age=0');
   assert.equal(r.headers.get('access-control-allow-origin'),null);
   assert.ok(f.calls.sessions.every(x=>x==='first-primary'));
   assert.equal(f.calls.writes,0);
 }));

test('missing/forged/multiple cookies cannot grant session',async()=>withDb(async f=>{
 for(const cookie of ['', '__Host-proofline_session=forged',
  '__Host-proofline_session='+token+'; __Host-proofline_session='+token,
  '__Host-proofline_session='+token+'X']){
  const r=await f.send(url,{headers:{cookie}});
  assert.equal(r.status,401);
 }
 assert.equal(f.calls.writes,0);
}));

test('expired, revoked and wrong role sessions are refused',async()=>withDb(async f=>{
 for(const statement of [
   "UPDATE worker_private_sessions SET expires_at_ms=1800000000000",
   "UPDATE worker_private_sessions SET expires_at_ms=1800000060000,revoked_at_ms=1799999999000",
   "UPDATE worker_private_sessions SET revoked_at_ms=NULL,role='OWNER',actor_id='outsider'",
   "UPDATE worker_private_sessions SET actor_id='owner',merchant_id='another'"
 ]){
  f.seed.exec(statement);
  assert.equal((await f.send()).status,statement.includes('outsider')||statement.includes('another')?404:401);
 }
 assert.equal(f.calls.writes,0);
}));

test('cross-origin/cross-site, HTTP, other paths and methods fail before database',async()=>withDb(async f=>{
 const before=f.calls.sessions.length;
 for(const [path,init,expected] of [
  ['http://proofline.example.test/__private/attempt/status',{},403],
  ['https://foreign.example.test/__private/attempt/status',{},403],
  [origin+'/demo/innovation',{},404],
  [url,{method:'POST',body:'{}'},405],
  [url,{method:'DELETE'},405],
  [url,{headers:{'sec-fetch-site':'cross-site'}},403],
  [url,{headers:{origin:'https://evil.example.test'}},403],
 ]){
  const r=await f.send(path,init);assert.equal(r.status,expected);
  if(expected===405)assert.equal(r.headers.get('allow'),'GET');
 }
 assert.equal(f.calls.sessions.length,before);
 assert.equal(f.calls.writes,0);
}));

test('query validation rejects duplicates, extra keys and malformed fields',async()=>withDb(async f=>{
 for(const path of [url+'&requestId=req1',url+'&actorId=owner',
   url.replace('quoteVersion=2','quoteVersion=2e0'),
   url.replace('operation=create','operation=pay'),
   url.replace('quoteId=q1','quoteId=q%2F1'),
   origin+'/__private/attempt/status']){
  assert.equal((await f.send(path)).status,400);
 }
 assert.equal(f.calls.sessions.length,0);
}));

test('revocation read from shared durable DB survives separate handler instances',async()=>withDb(async f=>{
 assert.equal((await f.send()).status,200);
 f.seed.exec('UPDATE worker_private_sessions SET revoked_at_ms=1799999999000');
 const another=createPrivateWorkerReadHandler({db:f.db,allowedOrigin:origin,now:()=>clock});
 assert.equal((await another.fetch(f.req())).status,401);
 assert.equal(f.calls.writes,0);
}));

test('D1 session outage produces closed 503 without fallback to browser fields',async()=>withDb(async f=>{
 const bad=createPrivateWorkerReadHandler({
   db:{withSession(){throw Error('private details must not leak');}},
   allowedOrigin:origin,now:()=>clock});
 const r=await bad.fetch(f.req());const body=await json(r);
 assert.equal(r.status,503);assert.deepEqual(body,{error:'DEPENDENCY_UNAVAILABLE'});
 assert.equal(JSON.stringify(body).includes('private details'),false);
}));

test('unknown payment attempt is 404, with no hidden creation',async()=>withDb(async f=>{
 const response=await f.send(url.replace('requestId=req1','requestId=unknown'));
 assert.equal(response.status,404);assert.equal(f.calls.writes,0);
}));

test('server requires fixed, configured HTTPS origin and D1 binding',()=>{
 for(const allowedOrigin of [undefined,'http://proofline.example.test','https://proofline.example.test/path'])
  assert.throws(()=>createPrivateWorkerReadHandler({allowedOrigin,db:{withSession(){}}}),
   /UNCONFIGURED_PRIVATE_WORKER_READ/);
 assert.throws(()=>createPrivateWorkerReadHandler({allowedOrigin:origin}),
  /UNCONFIGURED_PRIVATE_WORKER_READ/);
});
