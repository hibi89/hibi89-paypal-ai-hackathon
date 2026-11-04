import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createWorkerD1ContractFlow} from '../src/worker_d1_contract_flow.mjs';
import {createPrivateWorkerIdentityReadRouter} from '../src/worker_private_identity_read_router.mjs';

const O='https://operator.example.invalid', M='merchant-ci', A='owner-ci', S='seller-ci', R='reviewer-ci';
const TIME=1793720000000,ISSUER='https://idp.fixture.invalid';
const REQUEST_ID='ea850c4b-f130-4e5f-a445-5b1d8e0e69b0';
const EVENTS=[
 '38f96011-8010-4fe3-9e14-d7452ae724aa',
 '38f96011-8010-4fe3-9e14-d7452ae724ab',
 '38f96011-8010-4fe3-9e14-d7452ae724ac',
 '38f96011-8010-4fe3-9e14-d7452ae724ad'
];
const hash=value=>createHash('sha256').update(value).digest('hex');
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 for(const name of ['0001_payment_claims.sql','0002_worker_private_sessions.sql',
  '0003_worker_private_oidc.sql','0004_worker_private_binding_epoch.sql'])
  sqlite.exec(readFileSync(new URL('../migrations/d1/'+name,import.meta.url),'utf8'));
 for(const name of ['0005_contract_role_milestones.sql','0006_contract_role_sessions.sql'])
  sqlite.exec(readFileSync(new URL('../migrations/d1_candidate/'+name,import.meta.url),'utf8'));
 sqlite.prepare("INSERT INTO quotes(id,owner_id,merchant_id,version,currency,status,approval_actor,approval_version,approval_amount_minor,scope_text) VALUES('quoteCi',?,?,1,'USD','APPROVED',?,1,12750,'Signed freelance delivery')").run(A,M,A);
 for(const [actor,role] of [[A,'BUYER'],[S,'SELLER'],[R,'REVIEWER']])
  sqlite.prepare('INSERT INTO worker_contract_memberships(actor_id,merchant_id,role) VALUES(?,?,?)').run(actor,M,role);
 const tokens={};
 for(const [actor,role,byte,sub] of [[S,'SELLER',13,'a'],[R,'REVIEWER',14,'b']]){
  const subject=sub.repeat(64),cookie=Buffer.alloc(32,byte).toString('base64url');
  tokens[role]=cookie;
  sqlite.prepare('INSERT INTO worker_contract_role_bindings(issuer,subject_hmac,actor_id,merchant_id,role) VALUES(?,?,?,?,?)')
   .run(ISSUER,subject,actor,M,role);
  sqlite.prepare('INSERT INTO worker_contract_role_sessions(token_sha256,issuer,subject_hmac,actor_id,merchant_id,role,binding_revision,membership_revision,assertion_sha256,issued_at_ms,expires_at_ms) VALUES(?,?,?,?,?,?,1,1,?,?,?)')
   .run(hash(cookie),ISSUER,subject,actor,M,role,sub==='a'?'c'.repeat(64):'d'.repeat(64),TIME-2000,TIME+60000);
 }
 const db={withSession(mode){
  assert.equal(mode,'first-primary');
  return {prepare(sql){return {bind(...args){return {
   async first(){return sqlite.prepare(sql).get(...args)},
   async all(){return {results:sqlite.prepare(sql).all(...args)}},
   async run(){return {meta:{changes:sqlite.prepare(sql).run(...args).changes}}}
  }}}}};
 }};
 const fake={revoke:async()=>{throw Error('NO_OWNER');}};
 const pkce={start:async()=>new Response(null,{status:503}),
  callback:async()=>new Response(null,{status:503})};
 const router=createPrivateWorkerIdentityReadRouter({
  db,allowedOrigin:O,authority:fake,pkceCoordinator:pkce,enabled:true,
  contractsEnabled:true,contractRoleSessionsEnabled:true,now:()=>TIME
 });
 const buyer=createWorkerD1ContractFlow({
  db,allowedOrigin:O,now:()=>TIME,
  resolveVerifiedPrincipal:async r=>{
   if(r.headers.get('x-ci-only-actor')!==A)throw Error('NOT_BUYER');
   return {verified:true,actorId:A,merchantId:M};
  }
 });
 return {sqlite,router,buyer,tokens};
}
function request(path,method='GET',role='',body,extra={}){
 const cookie=role?{cookie:'__Host-proofline_contract_role='+role}:{};
 const headers={origin:O,'sec-fetch-site':'same-origin',...cookie,
  ...(method==='POST'?{'content-type':'application/json',
  'x-proofline-intent':path==='/__private/contracts'?'contract-create':
    'contract-'+path.split('/').at(-1)}:{}),...extra};
 return new Request(O+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
}
async function create(f){
 const payload={quoteId:'quoteCi',quoteVersion:1,sellerId:S,reviewerId:R,
  milestoneId:'deliver1',milestoneTitle:'Deliver signed audit and source archive',
  clientRequestId:REQUEST_ID};
 const r=await f.buyer.fetch(request('/__private/contracts','POST','',payload,{'x-ci-only-actor':A}));
 assert.equal(r.status,201);
 const j=await r.json();
 assert.equal(j.paymentAuthorized,false);
 return j.contract.contractId;
}
const route=(id,action)=>'/__private/contracts/'+id+'/milestones/deliver1/'+action;
test('seller/reviewer role cookies flow through non-default router with persistent D1 audit only',async()=>{
 const f=fixture(),id=await create(f);
 const p=await f.router.fetch(request('/__private/contracts','GET',f.tokens.SELLER));
 assert.equal(p.status,200);
 assert.equal((await p.json()).contracts.length,1);
 const submit=await f.router.fetch(request(route(id,'submit'),'POST',f.tokens.SELLER,{
  expectedVersion:1,eventId:EVENTS[0],detail:'Signed source delivered'
 }));
 assert.equal(submit.status,200);assert.equal((await submit.json()).contract.state,'SUBMITTED');
 const reject=await f.router.fetch(request(route(id,'reject'),'POST',f.tokens.REVIEWER,{
  expectedVersion:2,eventId:EVENTS[1],detail:'Delivery checklist incomplete'
 }));
 assert.equal(reject.status,200);
 const resubmit=await f.router.fetch(request(route(id,'submit'),'POST',f.tokens.SELLER,{
  expectedVersion:3,eventId:EVENTS[2],detail:'Checklist and evidence added'
 }));
 assert.equal(resubmit.status,200);
 const accept=await f.router.fetch(request(route(id,'accept'),'POST',f.tokens.REVIEWER,{
  expectedVersion:4,eventId:EVENTS[3],detail:'Verified deliverables'
 }));
 assert.equal(accept.status,200);
 const accepted=await accept.json();
 assert.equal(accepted.contract.state,'ACCEPTED');
 assert.equal(accepted.paymentAuthorized,false);
 assert.equal(accepted.providerCalls,0);
 assert.deepEqual(f.sqlite.prepare('SELECT action FROM worker_contract_events ORDER BY version').all().map(x=>x.action),
  ['CREATE','SUBMIT','REJECT','SUBMIT','ACCEPT']);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM payment_attempts').get().n,0);
 f.sqlite.close();
});
test('missing, forged, ambiguous or revoked role cookies never change contracts',async()=>{
 const f=fixture(),id=await create(f),action=route(id,'submit');
 const payload={expectedVersion:1,eventId:EVENTS[0],detail:'No permission'};
 for(const token of ['',Buffer.alloc(32,31).toString('base64url')]){
  assert.equal((await f.router.fetch(request(action,'POST',token,payload))).status,401);
 }
 const mixed=request(action,'POST',f.tokens.SELLER,payload,{cookie:
  '__Host-proofline_contract_role='+f.tokens.SELLER+
  '; __Host-proofline_session='+Buffer.alloc(32,9).toString('base64url')});
 assert.equal((await f.router.fetch(mixed)).status,401);
 const forgedRole=await f.router.fetch(request(route(id,'accept'),'POST',f.tokens.SELLER,{
  expectedVersion:1,eventId:EVENTS[1],detail:'Seller cannot review'
 }));
 assert.equal(forgedRole.status,403);
 f.sqlite.prepare("UPDATE worker_contract_role_bindings SET active=0,revision=2 WHERE role='SELLER'").run();
 assert.equal((await f.router.fetch(request(action,'POST',f.tokens.SELLER,payload))).status,401);
 f.sqlite.prepare("UPDATE worker_contract_role_bindings SET active=1,revision=3 WHERE role='SELLER'").run();
 assert.equal((await f.router.fetch(request(action,'POST',f.tokens.SELLER,payload))).status,401);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM worker_contract_events').get().n,1);
 f.sqlite.close();
});
test('role cookie cannot access owner quote or private payment history endpoints',async()=>{
 const f=fixture();
 for(const route of ['/__private/quotes','/__private/quotes/view','/__private/attempts']){
  const r=await f.router.fetch(request(route,'GET',f.tokens.SELLER));
  assert.equal(r.status,401);
 }
 assert.equal((await f.router.fetch(request('/api/paypal/capture','POST',f.tokens.REVIEWER,{}))).status,404);
 f.sqlite.close();
});
