import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createA2ABudgetStore} from '../src/gemini_a2a_budget_store.mjs';
import {createDurableGeminiA2ARoles} from '../src/gemini_a2a_durable_roles.mjs';
import {runBoundedA2A} from '../src/agentic_a2a_protocol.mjs';

const paths=[];
const make=(opts={})=>{
 const dir=mkdtempSync(join(tmpdir(),'gemini-a2a-ledger-'));
 const filename=join(dir,'quota.sqlite');
 const store=createA2ABudgetStore({filename,...opts});
 paths.push({dir,store});
 return {store,filename};
};
after(()=>{for(const o of paths){o.store.close();rmSync(o.dir,{recursive:true,force:true});}});
const fake=(action='OFFER',amountMinor=29000,tokens=40)=>new Response(JSON.stringify({
 candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({action,amountMinor})}]}}],
 usageMetadata:{totalTokenCount:tokens}
}),{status:200});
const scope=(job='trial')=>({actor:'test-buyer',merchant:'test-seller',job});
const adapter=(store,budgetScope,fetchImpl)=>
 createDurableGeminiA2ARoles({budgetStore:store,budgetScope,fetchImpl,
  apiKey:'NON_REAL_MOCK_ONLY_KEY',ownerAuthorized:true,freeTierConfirmed:true});
const sellerView={role:'seller',turn:1,ownLimitMinor:27000,history:[],lastOffer:null};

test('quota store is compulsory, independent of private provider permission',()=>{
 let calls=0;
 assert.throws(()=>createDurableGeminiA2ARoles({fetchImpl:()=>{calls++}}),
  /A2A_PRIVATE_DURABLE_QUOTA_REQUIRED/);
 const {store}=make();
 assert.throws(()=>createDurableGeminiA2ARoles({budgetStore:store,budgetScope:scope(),
  fetchImpl:()=>{calls++},ownerAuthorized:false,freeTierConfirmed:true,
  apiKey:'NON_REAL_MOCK_ONLY_KEY'}),/GEMINI_A2A_OWNER_APPROVAL/);
 assert.equal(calls,0);
});
test('two roles get separate durable claims and hash-only provenance',async()=>{
 const {store,filename}=make();
 let requests=0;
 const roles=adapter(store,scope('agreement'),async()=>{
  requests++;return fake(requests===1?'OFFER':'ACCEPT');
 });
 const result=await runBoundedA2A({...roles,buyerMaxMinor:30000,
  sellerMinMinor:27000,maxTurns:4,turnTimeoutMs:2000});
 assert.equal(result.status,'AGREED_OFFLINE_CONTRACT');
 assert.equal(result.paymentAuthorized,false);
 assert.equal(requests,2);
 assert.deepEqual(roles.status().durableBudget.records.map(x=>x.state),['DONE','DONE']);
 assert.equal(roles.status().durableBudget.measuredTokens,80);
 assert.equal(roles.status().durableBudget.reservedTokens,5120);
 assert.equal(roles.status().providerVerified,false);
 assert.equal(roles.status().source,'PRIVATE_INJECTED_TRANSPORT_UNVERIFIED');
 assert.match(roles.status().durableBudget.records[0].promptHash,/^[a-f0-9]{64}$/);
 assert.equal(JSON.stringify(roles.status()).includes('NON_REAL_MOCK_ONLY_KEY'),false);
 const second=createA2ABudgetStore({filename});
 try{
  assert.equal(second.status(scope('agreement')).requestsClaimed,2);
  assert.throws(()=>second.claim({...scope('agreement'),role:'seller',turn:1,
   promptHash:'a'.repeat(64)}),e=>e.code==='A2A_LEDGER_REPLAY_BLOCKED');
 }finally{second.close();}
});
test('UNKNOWN transport after claim stays blocked after process reopen',async()=>{
 const {store,filename}=make();
 let requests=0;
 const roles=adapter(store,scope('network'),async()=>{requests++;throw new Error('raw fake credential');});
 await assert.rejects(()=>roles.sellerAgent(sellerView),e=>
  e.code==='GEMINI_A2A_TRANSPORT_UNKNOWN'&&!e.message.includes('credential'));
 assert.equal(roles.status().durableBudget.records[0].state,'UNKNOWN');
 const second=createA2ABudgetStore({filename});
 try{
  assert.throws(()=>second.claim({...scope('network'),role:'seller',turn:1,
   promptHash:'a'.repeat(64)}),e=>e.code==='A2A_LEDGER_REPLAY_BLOCKED');
  assert.throws(()=>second.claim({...scope('network'),role:'buyer',turn:2,
   promptHash:'b'.repeat(64)}),e=>e.code==='A2A_LEDGER_PRIOR_UNKNOWN');
 }finally{second.close();}
 assert.equal(requests,1);
});
test('two SQLite connections cannot double claim same live turn',async()=>{
 const {store,filename}=make();
 const other=createA2ABudgetStore({filename});
 let release,started;
 const gate=new Promise(ok=>{release=ok});
 const entered=new Promise(ok=>{started=ok});
 let calls=0;
 const first=adapter(store,scope('race'),async()=>{calls++;started();await gate;return fake();});
 const second=adapter(other,scope('race'),async()=>{calls++;return fake();});
 try{
  const running=first.sellerAgent(sellerView);
  await entered;
  await assert.rejects(()=>second.sellerAgent(sellerView),e=>e.code==='A2A_LEDGER_REPLAY_BLOCKED');
  release();
  assert.equal((await running).amountMinor,29000);
  assert.equal(calls,1);
  assert.equal(other.status(scope('race')).records.length,1);
 }finally{release?.();other.close();}
});
test('daily budget shared across independent jobs, merchant isolated',async()=>{
 const {store}=make({dayLimit:1,attemptLimit:1,dayTokens:2560});
 let calls=0;
 const transport=async()=>{calls++;return fake();};
 assert.equal((await adapter(store,scope('first'),transport).sellerAgent(sellerView)).amountMinor,29000);
 await assert.rejects(()=>adapter(store,scope('second'),transport).sellerAgent(sellerView),
  e=>e.code==='A2A_LEDGER_QUOTA_EXHAUSTED');
 const other=adapter(store,{actor:'test-buyer',merchant:'different-seller',job:'third'},transport);
 assert.equal((await other.sellerAgent(sellerView)).amountMinor,29000);
 assert.equal(calls,2);
});
test('over-reservation provider token report becomes UNKNOWN with no retry',async()=>{
 const {store}=make();
 let calls=0;
 const roles=adapter(store,scope('overage'),async()=>{calls++;return fake('OFFER',29000,2600);});
 await assert.rejects(()=>roles.sellerAgent(sellerView),e=>e.code==='A2A_LEDGER_TOKEN_OVERAGE');
 assert.equal(roles.status().durableBudget.records[0].state,'UNKNOWN');
 await assert.rejects(()=>roles.sellerAgent(sellerView),e=>e.code==='A2A_DURABLE_CIRCUIT_OPEN');
 assert.equal(calls,1);
});
test('GET-like status cannot create claims; invalid scope rejected',()=>{
 const {store}=make();
 assert.equal(store.status(scope('unused')).requestsClaimed,0);
 assert.equal(store.status(scope('unused')).requestsClaimed,0);
 assert.throws(()=>store.status({actor:'../unsafe',merchant:'x',job:'y'}),
  /A2A_LEDGER_SCOPE_INVALID/);
 assert.equal(store.status(scope('unused')).requestsClaimed,0);
});
