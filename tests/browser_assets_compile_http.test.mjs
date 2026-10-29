import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';

test('served browser assets compile as JavaScript without running provider calls',async()=>{
 const app=await startOfflineDemo();
 try{
  const html=await (await fetch(app.url+'/demo')).text();
  const assets=[...html.matchAll(/<script\s+src="(\/demo\/[a-z-]+\.js)"/g)].map(match=>match[1]);
  assert.ok(assets.length>=7,'All demo browser modules should be loaded');
  assert.equal(new Set(assets).size,assets.length,'No duplicate script tags');
  for(const path of assets){
   assert.ok(html.includes(path),'HTML must reference '+path);
   const response=await fetch(app.url+path);
   assert.equal(response.status,200,path);
   const script=await response.text();
   assert.ok(script.length>100,path);
   assert.doesNotThrow(()=>new Script(script,{filename:path}),path+' must parse');
   if(path==='/demo/agent-budget.js'){
    assert.equal(script.split("form?.addEventListener('submit'").length-1,1,'One negotiation handler only');
    assert.equal(script.split("budgetForm?.addEventListener('submit'").length-1,1,'One budget handler only');
    assert.ok(script.includes("Limit: $"),'Budget amount must render');
   }
  }
 }finally{await app.close()}
});
