import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';

test('served browser assets compile as JavaScript without running provider calls',async()=>{
 const app=await startOfflineDemo();
 try{
  const html=await (await fetch(app.url+'/demo')).text();
  const assets=['/demo/agent-budget.js','/demo/github-delivery.js','/demo/marketplace.js'];
  for(const path of assets){
   assert.ok(html.includes(path),'HTML must reference '+path);
   const response=await fetch(app.url+path);
   assert.equal(response.status,200,path);
   const script=await response.text();
   assert.ok(script.length>100,path);
   assert.doesNotThrow(()=>new Script(script,{filename:path}),path+' must parse');
  }
 }finally{await app.close()}
});
