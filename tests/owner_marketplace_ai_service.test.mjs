import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMarketplaceAiBudgetStore} from '../src/marketplace_ai_budget.mjs';
import {createOwnerMarketplaceAiService} from '../src/owner_marketplace_ai_service.mjs';
import {createGeminiMarketplaceSkillProvider} from '../src/gemini_marketplace_provider.mjs';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';

const brief='Build ecommerce website with PayPal checkout';
const identity={verified:true,actorId:'owner',merchantId:'synthetic-merchant'};
const body={actorId:identity.actorId,merchantId:identity.merchantId,brief};
function fixture({result={skills:['web','payments']},failure=false,authorized=true}={}){
 const folder=mkdtempSync(join(tmpdir(),'paypal-gemini-marketplace-'));
 const filename=join(folder,'budget.sqlite');
 let store=createMarketplaceAiBudgetStore({filename});
 const calls=[],actions=[];
 const provider=createGeminiMarketplaceSkillProvider({
  apiKey:'FAKE_ONLY',ownerAuthorized:true,freeTierConfirmed:true,
  fetchImpl:async(url,opts)=>{
   calls.push({url,opts});
   if(failure)throw Error('INJECTED_UNKNOWN_TRANSPORT');
   return {status:200,json:async()=>({candidates:[{finishReason:'STOP',
    content:{parts:[{text:JSON.stringify(result)}]}}]})};
  }});
 const service=()=>createOwnerMarketplaceAiService({
  store,provider,
  resolveTrustedActor:async handle=>handle==='trusted'?identity:null,
  authorizeRequest:async action=>{actions.push(action);return authorized;}
 });
 return {folder,calls,actions,provider,service,store:()=>store,filename,
  reopen(){store.close();store=createMarketplaceAiBudgetStore({filename});},
  close(){store.close();rmSync(folder,{recursive:true,force:true})}};
}
const withFixture=(opts,fn)=>async()=>{
 const f=fixture(opts);
 try{await fn(f);}finally{f.close();}
};
test('internal Gemini market requires verified identity and separate explicit owner consent',withFixture({},async f=>{
 const svc=f.service();
 assert.equal(svc.publicHttpEnabled,false);
 assert.equal(svc.defaultDemoEnabled,false);
 assert.equal(svc.implicitNetworkEnabled,false);
 await assert.rejects(svc.classify({sessionHandle:'forged',brief}),
  {code:'VERIFIED_MARKETPLACE_OWNER_REQUIRED'});
 await assert.rejects(svc.classify({sessionHandle:'trusted',brief:'bad'}),
  {code:'INVALID_MARKETPLACE_AI_BRIEF'});
 assert.equal(f.calls.length,0);
 assert.equal(f.store().status(body),null);
}));
test('one consented provider classification matches only synthetic, without dollar or payment claim',withFixture({},async f=>{
 const x=await f.service().classify({sessionHandle:'trusted',brief});
 assert.equal(f.calls.length,1);
 assert.equal(f.actions.length,1);
 assert.equal(f.actions[0].action,'GEMINI_SKILL_CLASSIFICATION_ONCE');
 assert.ok(/^[0-9a-f]{64}$/.test(f.actions[0].briefHash));
 assert.equal(JSON.stringify(f.actions[0]).includes(brief),false);
 assert.equal(x.mode,'GEMINI_ASSISTED_SYNTHETIC_PROFILES');
 assert.equal(x.profiles[0].id,'synthetic-web');
 assert.equal(x.profiles[0].eligible,true);
 assert.equal(x.ai.paymentAuthority,false);
 assert.equal(x.ai.pricePredictionAllowed,false);
 assert.equal(x.price.amountMinor,null);
 assert.equal(x.paypal.status,'NOT_CONNECTED');
 assert.equal(f.store().status(body).state,'COMMITTED');
 await assert.rejects(f.service().classify({sessionHandle:'trusted',brief}),
  {code:'MARKETPLACE_AI_BUDGET_USED'});
 assert.equal(f.calls.length,1);
 f.reopen();
 assert.equal(f.store().status(body).state,'COMMITTED');
 await assert.rejects(f.service().classify({sessionHandle:'trusted',brief}),
  {code:'MARKETPLACE_AI_BUDGET_USED'});
 assert.equal(f.calls.length,1);
}));
test('network failure becomes permanently UNKNOWN and never silently repeats provider POST',withFixture({failure:true},async f=>{
 await assert.rejects(f.service().classify({sessionHandle:'trusted',brief}),
  {code:'MARKETPLACE_AI_RESULT_UNKNOWN_NO_AUTO_RETRY'});
 assert.equal(f.calls.length,1);
 assert.equal(f.store().status(body).state,'UNKNOWN');
 f.reopen();
 await assert.rejects(f.service().classify({sessionHandle:'trusted',brief}),
  {code:'MARKETPLACE_AI_BUDGET_USED'});
 assert.equal(f.calls.length,1);
}));
test('invalid model output consumes reservation and never changes candidate eligibility',withFixture({result:{skills:['web'],payNow:true}},async f=>{
 await assert.rejects(f.service().classify({sessionHandle:'trusted',brief}),
  {code:'MARKETPLACE_AI_RESULT_UNKNOWN_NO_AUTO_RETRY'});
 assert.equal(f.calls.length,1);
 assert.equal(f.store().status(body).state,'UNKNOWN');
}));
test('two concurrent permissioned calls race; one provider POST only',withFixture({},async f=>{
 const svc=f.service();
 const result=await Promise.allSettled([
  svc.classify({sessionHandle:'trusted',brief}),
  svc.classify({sessionHandle:'trusted',brief})
 ]);
 assert.equal(result.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(result.filter(x=>x.status==='rejected').length,1);
 assert.equal(f.calls.length,1);
}));
test('permanently scoped budget cannot be reused by a different actor or project',withFixture({},async f=>{
 await f.service().classify({sessionHandle:'trusted',brief});
 assert.equal(f.store().status({actorId:'foreign',merchantId:'other',brief}),null);
 assert.equal(f.store().status({...body,brief:'Another synthetic project website'}),null);
 assert.equal(f.store().status(body).state,'COMMITTED');
 assert.throws(()=>f.store().claim({...body,brief:'Another synthetic project website'}),
  {code:'MARKETPLACE_AI_BUDGET_USED'});
 assert.equal(f.calls.length,1);
}));
test('invalid/absent durable SQLite budget path rejects before provider access',()=>{
 for(const filename of [undefined,'',':memory:','file::memory:?cache=shared'])
  assert.throws(()=>createMarketplaceAiBudgetStore({filename}),
   {code:'DURABLE_MARKETPLACE_AI_FILE_REQUIRED'});
 assert.throws(()=>createOwnerMarketplaceAiService({}),
   {code:'TRUSTED_MARKETPLACE_AI_DEPENDENCIES_REQUIRED'});
});
test('offline local demo remains AI-disabled and PayPal write-disabled',async()=>{
 const app=await startOfflineDemo();
 try{
  const session=await (await fetch(app.url+'/demo/session')).json();
  const res=await fetch(app.url+'/api/demo/marketplace',{
   method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrfToken},
   body:JSON.stringify({brief})
  });
  assert.equal(res.status,200);
  const body=await res.json();
  assert.equal(body.mode,'OFFLINE_SYNTHETIC_NO_AI');
  assert.equal(body.skillSource,'OFFLINE_REGEX');
  assert.equal(body.paypal.status,'NOT_CONNECTED');
  assert.equal((await fetch(app.url+'/api/quotes/sample-project/payment')).status,200);
  assert.equal((await fetch(app.url+'/api/demo/marketplace/ai')).status,404);
 }finally{await app.close();}
});

test('consented skill result restores after SQLite restart with no extra provider request',withFixture({},async f=>{
 const svc=f.service();
 assert.equal((await svc.readSaved({sessionHandle:'trusted',brief})).status,'NOT_STARTED');
 await svc.classify({sessionHandle:'trusted',brief});
 const original=await svc.readSaved({sessionHandle:'trusted',brief});
 assert.equal(original.status,'RESTORED');
 assert.equal(original.providerPostPerformed,false);
 assert.deepEqual(original.result.requestedSkills,['web','payments']);
 assert.equal(original.result.ai.paymentAuthority,false);
 assert.equal(f.calls.length,1);
 assert.equal(f.actions.length,1);
 f.reopen();
 const again=await f.service().readSaved({sessionHandle:'trusted',brief});
 assert.equal(again.status,'RESTORED');
 assert.deepEqual(again.result.requestedSkills,original.result.requestedSkills);
 assert.equal(f.calls.length,1);
 assert.equal(f.actions.length,1);
}));
test('stored skill read rejects invalid identity and different project scope',withFixture({},async f=>{
 await f.service().classify({sessionHandle:'trusted',brief});
 assert.equal((await f.service().readSaved({sessionHandle:'trusted',
  brief:'Another dashboard request for analytics'})).status,'NOT_STARTED');
 await assert.rejects(f.service().readSaved({sessionHandle:'not-trusted',brief}),
  {code:'VERIFIED_MARKETPLACE_OWNER_REQUIRED'});
 assert.equal(f.calls.length,1);
}));
test('remote failure remains un-restorable UNKNOWN after process restart',withFixture({failure:true},async f=>{
 await assert.rejects(f.service().classify({sessionHandle:'trusted',brief}),
  {code:'MARKETPLACE_AI_RESULT_UNKNOWN_NO_AUTO_RETRY'});
 let view=await f.service().readSaved({sessionHandle:'trusted',brief});
 assert.equal(view.status,'UNAVAILABLE');
 assert.equal(view.reservationState,'UNKNOWN');
 assert.equal(view.autoRetry,false);
 f.reopen();
 view=await f.service().readSaved({sessionHandle:'trusted',brief});
 assert.equal(view.status,'UNAVAILABLE');
 assert.equal(f.calls.length,1);
}));

test('persist rejects unexpected skill and does not transition RESERVED',withFixture({},async f=>{
 const claim=f.store().claim(body);
 assert.equal(claim.state,'RESERVED');
 assert.throws(()=>f.store().commit({...body,skills:['unsupported-skill']}),
  {code:'AI_MARKETPLACE_SCHEMA_INVALID'});
 assert.equal(f.store().status(body).state,'RESERVED');
 assert.throws(()=>f.store().commit({...body,actorId:'other',skills:['web']}),
  {code:'MARKETPLACE_AI_CLAIM_NOT_FOUND'});
 assert.equal(f.store().commit({...body,skills:['payments','web']}).state,'COMMITTED');
 assert.deepEqual(f.store().readResult(body).skills,['web','payments']);
 assert.throws(()=>f.store().commit({...body,skills:['qa']}),
  {code:'MARKETPLACE_AI_RESULT_ALREADY_FINAL'});
 assert.equal(f.store().markUnknown(body).state,'COMMITTED');
 assert.equal(f.calls.length,0);
}));
test('pending reservation read never returns a cached AI classification',withFixture({},async f=>{
 f.store().claim(body);
 const before=await f.service().readSaved({sessionHandle:'trusted',brief});
 assert.equal(before.status,'UNAVAILABLE');
 assert.equal(before.reservationState,'RESERVED');
 assert.equal(before.autoRetry,false);
 assert.equal(Object.hasOwn(before,'result'),false);
 f.reopen();
 const after=await f.service().readSaved({sessionHandle:'trusted',brief});
 assert.equal(after.status,'UNAVAILABLE');
 assert.equal(after.autoRetry,false);
 assert.equal(f.calls.length,0);
}));
test('legacy committed reservation migrates without fabricating classification',async()=>{
 const {DatabaseSync}=await import('node:sqlite');
 const {createHash}=await import('node:crypto');
 const folder=mkdtempSync(join(tmpdir(),'paypal-legacy-ai-cache-'));
 const filename=join(folder,'legacy.sqlite');
 let store;
 try{
  const original=new DatabaseSync(filename);
  original.exec("CREATE TABLE marketplace_ai_attempts (id INTEGER PRIMARY KEY CHECK(id=1),"+
    "actor_id TEXT NOT NULL,merchant_id TEXT NOT NULL,brief_hash TEXT NOT NULL,"+
    "state TEXT NOT NULL CHECK(state IN ('RESERVED','UNKNOWN','COMMITTED')),"+
    "created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  original.prepare("INSERT INTO marketplace_ai_attempts "+
    "(id,actor_id,merchant_id,brief_hash,state) VALUES(1,?,?,?,'COMMITTED')").run(
    body.actorId,body.merchantId,createHash('sha256').update(brief).digest('hex'));
  original.close();
  store=createMarketplaceAiBudgetStore({filename});
  const x=store.readResult(body);
  assert.equal(x.state,'COMMITTED');
  assert.equal(x.restorable,false);
  assert.equal(x.reason,'LEGACY_RESULT_UNAVAILABLE');
  assert.throws(()=>store.claim(body),{code:'MARKETPLACE_AI_BUDGET_USED'});
 }finally{store?.close();rmSync(folder,{recursive:true,force:true});}
});

test('AI authorization rejects revoked session or switched merchant before quota claim',withFixture({},async f=>{
 let current=identity;
 let transition=()=>{current=null;};
 const svc=()=>createOwnerMarketplaceAiService({
  store:f.store(),provider:f.provider,
  resolveTrustedActor:async()=>current,
  authorizeRequest:async()=>{transition();return true;}
 });
 await assert.rejects(svc().classify({sessionHandle:'trusted',brief}),
  {code:'VERIFIED_MARKETPLACE_OWNER_REQUIRED'});
 assert.equal(f.store().status(body),null);
 assert.equal(f.calls.length,0);
 current=identity;
 transition=()=>{current={...identity,merchantId:'other-merchant'};};
 await assert.rejects(svc().classify({sessionHandle:'trusted',brief}),
  {code:'MARKETPLACE_AI_SCOPE_CHANGED_DURING_CONSENT'});
 assert.equal(f.store().status(body),null);
 assert.equal(f.calls.length,0);
}));
