import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMarketplaceAiBudgetStore} from '../src/marketplace_ai_budget.mjs';
import {LOCAL_GEMINI_BRIEF,parseOwnerGeminiPilotArgs,
  runOwnerGeminiLocalPilot} from '../src/owner_gemini_local_pilot.mjs';

const fixture=()=>{
  const dir=mkdtempSync(join(tmpdir(),'ppl-local-gemini-'));
  const budgetFilename=join(dir,'private','one.sqlite');
  const calls=[];
  const fetchImpl=async(url,opts)=>{
    calls.push({url,method:opts.method,body:opts.body});
    return {status:200,json:async()=>({candidates:[{
      finishReason:'STOP',content:{parts:[{text:JSON.stringify({skills:['web','payments']})}]}
    }]})};
  };
  const args={execute:true,ownerAuthorized:true,freeTierConfirmed:true,
    operatorConfirmed:true,apiKey:'DUMMY_NONSECRET',
    budgetFilename,fetchImpl,cwd:process.cwd()};
  return {dir,budgetFilename,calls,args,close(){rmSync(dir,{recursive:true,force:true});}};
};
test('owner Gemini private pilot requires exact CLI flag trio',()=>{
  assert.equal(parseOwnerGeminiPilotArgs([]).valid,false);
  assert.equal(parseOwnerGeminiPilotArgs(['--execute','--owner-authorized']).valid,false);
  assert.equal(parseOwnerGeminiPilotArgs(['--execute','--owner-authorized',
    '--free-tier-confirmed','--unknown']).valid,false);
  assert.equal(parseOwnerGeminiPilotArgs(['--execute','--owner-authorized',
    '--free-tier-confirmed']).valid,true);
});
test('default and any missing explicit permission touch neither SQLite nor Gemini',async()=>{
  const f=fixture();
  try{
    for(const key of ['execute','ownerAuthorized','freeTierConfirmed','operatorConfirmed']){
      const result=await runOwnerGeminiLocalPilot({...f.args,[key]:false});
      assert.equal(result.status,'EXPLICIT_LOCAL_OPERATOR_CONSENT_REQUIRED');
      assert.equal(result.networkRequests,0);
    }
    assert.equal(f.calls.length,0);
    assert.equal(existsSync(f.budgetFilename),false);
  }finally{f.close();}
});
test('private key and budget location required before network and file creation',async()=>{
  const f=fixture();
  try{
    for(const update of [{apiKey:''},{budgetFilename:'./unsafe.sqlite'},
      {budgetFilename:join(process.cwd(),'unsafe.sqlite')}]){
      const result=await runOwnerGeminiLocalPilot({...f.args,...update});
      assert.notEqual(result.status,'GEMINI_SKILLS_PERSISTED_LOCAL_ONLY');
      assert.equal(result.networkRequests,0);
    }
    assert.equal(f.calls.length,0);
    assert.equal(existsSync(f.budgetFilename),false);
  }finally{f.close();}
});
test('one consented synthetic Gemini skill result persists; no payment, price or auto-repeat',async()=>{
  const f=fixture();
  try{
    const result=await runOwnerGeminiLocalPilot(f.args);
    assert.equal(result.status,'GEMINI_SKILLS_PERSISTED_LOCAL_ONLY');
    assert.equal(result.productionAuthVerified,false);
    assert.equal(result.accountFreeTierVerified,false);
    assert.equal(result.paypalConnected,false);
    assert.equal(result.networkRequests,1);
    assert.deepEqual(result.requestedSkills,['web','payments']);
    assert.equal(result.priceStatus,'DATA_INSUFFICIENT');
    assert.equal(result.paymentStatus,'NOT_CONNECTED');
    assert.equal(f.calls.length,1);
    assert.equal(f.calls[0].method,'POST');
    assert.ok(f.calls[0].body.includes(LOCAL_GEMINI_BRIEF));
    const store=createMarketplaceAiBudgetStore({filename:f.budgetFilename});
    assert.equal(store.status({actorId:'local_cli_operator',
      merchantId:'fictional_merchant',brief:LOCAL_GEMINI_BRIEF}).state,'COMMITTED');
    store.close();
    const again=await runOwnerGeminiLocalPilot(f.args);
    assert.equal(again.status,'ONE_SHOT_BUDGET_ALREADY_USED_NO_RETRY');
    assert.equal(again.networkRequests,0);
    assert.equal(f.calls.length,1);
  }finally{f.close();}
});
test('failed Gemini attempt remains UNKNOWN and blocks second POST after restart',async()=>{
  const f=fixture();
  try{
    let count=0;
    const args={...f.args,fetchImpl:async()=>{count++;throw Error('PRIVATE_MODEL_ERROR');}};
    const failed=await runOwnerGeminiLocalPilot(args);
    assert.equal(failed.status,'PROVIDER_OR_RESULT_UNKNOWN_NO_RETRY');
    assert.equal(JSON.stringify(failed).includes('PRIVATE_MODEL_ERROR'),false);
    const second=await runOwnerGeminiLocalPilot(f.args);
    assert.equal(second.status,'ONE_SHOT_BUDGET_ALREADY_USED_NO_RETRY');
    assert.equal(count,1);
    assert.equal(f.calls.length,0);
  }finally{f.close();}
});
