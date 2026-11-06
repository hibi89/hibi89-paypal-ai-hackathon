import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkerSandboxOrderGetTransport} from '../src/worker_sandbox_get_transport.mjs';

const ORDER='SYNTHETIC_ORDER_1';
const options={clientId:'synthetic-client',clientSecret:'synthetic-secret',
 networkApproved:true,timeoutMs:1000};

test('Worker Sandbox OAuth ignored abort cannot hang forever or send Orders GET',async()=>{
 let calls=0;
 const transport=createWorkerSandboxOrderGetTransport({...options,
  fetchImpl:async()=>{calls++;return new Promise(()=>{});}
 });
 const start=Date.now();
 await assert.rejects(transport.getOrder(ORDER),e=>e.code==='SANDBOX_PROVIDER_TIMEOUT_NO_RETRY');
 assert.equal(calls,1);
 assert.ok(Date.now()-start<2200);
 assert.equal(transport.paymentPostsEnabled,false);
});

test('Worker Sandbox stalled Orders GET body and stalled cancel both obey a hard deadline',async()=>{
 let calls=0,cancels=0;
 const stuck=new ReadableStream({
  pull(){return new Promise(()=>{})},
  cancel(){cancels++;return new Promise(()=>{})}
 });
 const transport=createWorkerSandboxOrderGetTransport({...options,
  fetchImpl:async()=>{
   calls++;
   if(calls===1)return Response.json({token_type:'Bearer',access_token:'synthetic-token1234'});
   return new Response(stuck,{status:200,headers:{'content-type':'application/json'}});
  }
 });
 const start=Date.now();
 await assert.rejects(transport.getOrder(ORDER),e=>e.code==='SANDBOX_PROVIDER_TIMEOUT_NO_RETRY');
 assert.equal(calls,2);
 assert.ok(Date.now()-start<2300);
 assert.equal(transport.paymentPostsEnabled,false);
});

test('Worker Sandbox native redirected or foreign-origin response cannot supply OAuth',async()=>{
 for(const variant of ['redirect','foreign']){
  let calls=0;
  const transport=createWorkerSandboxOrderGetTransport({...options,
   fetchImpl:async()=>{
    calls++;
    const r=Response.json({token_type:'Bearer',access_token:'synthetic-token1234'});
    if(variant==='redirect')Object.defineProperty(r,'redirected',{value:true});
    if(variant==='foreign')Object.defineProperty(r,'url',{value:'https://attacker.invalid/oauth'});
    return r;
   }
  });
  await assert.rejects(transport.getOrder(ORDER),e=>e.code==='SANDBOX_RESPONSE_REJECTED');
  assert.equal(calls,1);
 }
});
