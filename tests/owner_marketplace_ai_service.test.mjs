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
 return {folder,calls,actions,service,store:()=>store,filename,
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
  assert.equal((await fetch(app.url+'/api/quotes/sample-project/payment')).status,503);
  assert.equal((await fetch(app.url+'/api/demo/marketplace/ai')).status,404);
 }finally{await app.close();}
});
