import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createPrivateWorkerIdentityReadRouter} from '../src/worker_private_identity_read_router.mjs';

const O='https://owner.fixture.invalid',T=1793720000000;
const A='ciOwner',M='ciMerchant',S='ciSeller',R='ciReviewer';
const SUBJECT='a'.repeat(64),ISS='https://idp.fixture.invalid';
const TOKEN=Buffer.alloc(32,42).toString('base64url');
const DIGEST=createHash('sha256').update(TOKEN).digest('hex');
const ID='ea850c4b-f130-4e5f-a445-5b1d8e0e69b0';
function fixture({revokeBeforeInsert=false}={}){
 const sqlite=new DatabaseSync(':memory:');
 for(const n of ['0001_payment_claims.sql','0002_worker_private_sessions.sql',
  '0003_worker_private_oidc.sql','0004_worker_private_binding_epoch.sql']){
  sqlite.exec(readFileSync(new URL('../migrations/d1/'+n,import.meta.url),'utf8'));
 }
 for(const n of ['0005_contract_role_milestones.sql','0006_contract_role_sessions.sql']){
  sqlite.exec(readFileSync(new URL('../migrations/d1_candidate/'+n,import.meta.url),'utf8'));
 }
 sqlite.prepare('INSERT INTO worker_private_oidc_bindings(issuer,subject_hmac,actor_id,merchant_id,role) VALUES(?,?,?,?,?)')
  .run(ISS,SUBJECT,A,M,'OWNER');
 sqlite.prepare('INSERT INTO worker_private_sessions(token_sha256,actor_id,merchant_id,role,issuer,issuer_verified_at_ms,expires_at_ms,binding_subject_hmac,binding_revision) VALUES(?,?,?,?,?,?,?,?,1)')
  .run(DIGEST,A,M,'OWNER',ISS,T-60000,T+60000,SUBJECT);
 for(const [actor,role] of [[A,'BUYER'],[S,'SELLER'],[R,'REVIEWER']]){
  sqlite.prepare('INSERT INTO worker_contract_memberships(actor_id,merchant_id,role) VALUES(?,?,?)')
   .run(actor,M,role);
 }
 sqlite.prepare("INSERT INTO quotes(id,owner_id,merchant_id,version,currency,status,approval_actor,approval_version,approval_amount_minor,scope_text) VALUES('ownerQuote',?,?,1,'USD','APPROVED',?,1,250,'Signed project owner request')").run(A,M,A);
 let intercepts=0;
 const db={
  withSession(mode){
   assert.equal(mode,'first-primary');
   return {
    prepare(sql){
     return {
      bind(...args){
       return {
        async first(){return sqlite.prepare(sql).get(...args)??null},
        async all(){
         if(revokeBeforeInsert&&sql.startsWith('INSERT INTO worker_contracts')){
          intercepts++;
          sqlite.prepare('UPDATE worker_private_sessions SET revoked_at_ms=? WHERE token_sha256=?').run(T-1,DIGEST);
         }
         return {results:sqlite.prepare(sql).all(...args)};
        },
        async run(){return {meta:{changes:sqlite.prepare(sql).run(...args).changes}}}
       };
      }
     };
    }
   };
  }
 };
 const authority={revoke:async()=>{throw Error('NOT_AUTHORIZED')}};
 const pkce={start:async()=>new Response(null,{status:503}),
  callback:async()=>new Response(null,{status:503})};
 const router=createPrivateWorkerIdentityReadRouter({db,allowedOrigin:O,
  authority,pkceCoordinator:pkce,enabled:true,contractsEnabled:true,
  contractRoleSessionsEnabled:true,now:()=>T});
 const request=new Request(O+'/__private/contracts',{method:'POST',headers:{
  origin:O,'sec-fetch-site':'same-origin',
  cookie:'__Host-proofline_session='+TOKEN,
  'content-type':'application/json','x-proofline-intent':'contract-create'
 },body:JSON.stringify({
  quoteId:'ownerQuote',quoteVersion:1,sellerId:S,reviewerId:R,
  milestoneId:'deliverable1',
  milestoneTitle:'Deliver independently verified source package',
  clientRequestId:ID
 })});
 return {sqlite,router,request,getIntercepts:()=>intercepts};
}
test('owner role CREATE is allowed only while current pinned session remains active',async()=>{
 const f=fixture(),response=await f.router.fetch(f.request);
 assert.equal(response.status,201);
 const data=await response.json();
 assert.equal(data.contract.state,'PENDING');
 assert.equal(data.paymentAuthorized,false);
 assert.equal(data.providerCalls,0);
 assert.equal(f.sqlite.prepare('SELECT count(*) n FROM worker_contract_events').get().n,1);
 assert.equal(f.sqlite.prepare('SELECT count(*) n FROM payment_attempts').get().n,0);
 f.sqlite.close();
});
test('revocation precisely between session read and INSERT is fenced atomically inside D1',async()=>{
 const f=fixture({revokeBeforeInsert:true});
 const response=await f.router.fetch(f.request);
 assert.notEqual(response.status,201);
 assert.notEqual(response.status,200);
 assert.equal(f.getIntercepts(),1);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM worker_contracts').get().n,0);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM worker_contract_events').get().n,0);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM payment_attempts').get().n,0);
 f.sqlite.close();
});
