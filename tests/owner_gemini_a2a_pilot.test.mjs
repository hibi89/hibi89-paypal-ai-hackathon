import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {inspectGeminiA2APilotReadiness,parseGeminiA2APilotArgs,
 runOwnerGeminiA2APilot} from '../src/owner_gemini_a2a_pilot.mjs';
import {createA2ABudgetStore} from '../src/gemini_a2a_budget_store.mjs';

const dirs=[];
const fixture=()=>{
 const dir=mkdtempSync(join(tmpdir(),'ppl-owner-a2a-'));
 dirs.push(dir);
 const filename=join(dir,'quota','claims.sqlite');
 const calls=[];
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});
  return new Response(JSON.stringify({
   candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({
    action:calls.length===1?'OFFER':'ACCEPT',amountMinor:29000
   })}]}}],
   usageMetadata:{totalTokenCount:45}
  }),{status:200});
 };
 const options={
  execute:true,ownerAuthorized:true,freeTierConfirmed:true,
  operatorConfirmed:true,apiKey:'FAKE_NONREAL_INJECTED_KEY',
  fetchImpl,budgetFilename:filename,cwd:process.cwd()
 };
 return {dir,filename,calls,options};
};
after(()=>dirs.forEach(dir=>rmSync(dir,{recursive:true,force:true})));

test('offline readiness and exact flag triple cannot call a provider or load keys',()=>{
 const p=inspectGeminiA2APilotReadiness();
 assert.equal(p.networkRequests,0);
 assert.equal(p.accountFreeTierVerifiedByThisRun,false);
 assert.equal(p.realGeminiVerifiedByThisRun,false);
 assert.equal(p.providerPaymentAuthority,false);
 assert.equal(parseGeminiA2APilotArgs([]).valid,false);
 assert.equal(parseGeminiA2APilotArgs(['--execute','--owner-authorized']).valid,false);
 assert.equal(parseGeminiA2APilotArgs(['--execute','--owner-authorized',
  '--free-tier-confirmed']).valid,true);
 assert.equal(parseGeminiA2APilotArgs(['--execute','--owner-authorized',
  '--free-tier-confirmed','--verbose']).valid,false);
});

test('every missing consent gate causes zero provider calls and zero disk access',async()=>{
 const f=fixture();
 for(const field of ['execute','ownerAuthorized','freeTierConfirmed','operatorConfirmed']){
  const r=await runOwnerGeminiA2APilot({...f.options,[field]:false});
  assert.equal(r.status,'EXPLICIT_LOCAL_OPERATOR_APPROVAL_REQUIRED');
  assert.equal(r.networkRequests,0);
  assert.equal(existsSync(f.filename),false);
 }
 assert.equal(f.calls.length,0);
});

test('missing private key, transport, and absolute nonrepo budget path fail before write',async()=>{
 const f=fixture();
 for(const invalid of [{apiKey:''},{fetchImpl:undefined},
  {budgetFilename:'./relative.sqlite'},
  {budgetFilename:join(process.cwd(),'quota.sqlite')}]){
  const result=await runOwnerGeminiA2APilot({...f.options,...invalid});
  assert.equal(result.networkRequests,0);
  assert.equal(f.calls.length,0);
  assert.equal(existsSync(f.filename),false);
 }
});

test('synthetic two-role negotiation records durable request hashes; replay never sends',async()=>{
 const f=fixture();
 const one=await runOwnerGeminiA2APilot(f.options);
 assert.equal(one.status,'PRIVATE_A2A_OFFLINE_CONTRACT_ONLY');
 assert.equal(one.negotiationStatus,'AGREED_OFFLINE_CONTRACT');
 assert.equal(one.paymentState,'NOT_PAID');
 assert.equal(one.paypalConnected,false);
 assert.equal(one.realGeminiVerifiedByThisRun,false);
 assert.equal(one.accountFreeTierVerifiedByThisRun,false);
 assert.equal(one.claimedRequests,2);
 assert.equal(one.measuredTokens,90);
 assert.equal(one.reservedTokens,5120);
 assert.deepEqual(one.messages.map(m=>m.role),['seller','buyer']);
 assert.equal(one.messages.at(-1).action,'ACCEPT');
 assert.match(one.transcriptSha256,/^[0-9a-f]{64}$/);
 assert.equal(f.calls.length,2);
 assert.ok(f.calls.every(x=>x.options.method==='POST'));
 const db=createA2ABudgetStore({filename:f.filename});
 try{
  const history=db.status({actor:'owner_cli',merchant:'fictional_seller',
   job:'owner_a2a_one_shot'});
  assert.deepEqual(history.records.map(x=>x.state),['DONE','DONE']);
  assert.ok(history.records.every(x=>/^[0-9a-f]{64}$/.test(x.promptHash)));
  assert.equal(JSON.stringify(history).includes('FAKE_NONREAL_INJECTED_KEY'),false);
 }finally{db.close();}
 const repeat=await runOwnerGeminiA2APilot(f.options);
 assert.equal(repeat.status,'A2A_PREVIOUS_CLAIM_NO_AUTO_RETRY');
 assert.equal(repeat.networkRequests,0);
 assert.equal(f.calls.length,2);
});

test('unknown transport becomes durable UNKNOWN; subsequent execution fails closed',async()=>{
 const f=fixture();let called=0;
 const args={...f.options,fetchImpl:async()=>{called++;throw Error('PRIVATE_RAW_PROVIDER_FAILURE')}};
 const failed=await runOwnerGeminiA2APilot(args);
 assert.equal(failed.status,'PROVIDER_OR_RESULT_UNKNOWN_NO_RETRY');
 assert.equal(failed.claimedRequests,1);
 assert.equal(failed.auditState[0].state,'UNKNOWN');
 assert.equal(JSON.stringify(failed).includes('PRIVATE_RAW_PROVIDER_FAILURE'),false);
 const second=await runOwnerGeminiA2APilot(f.options);
 assert.equal(second.status,'A2A_PREVIOUS_CLAIM_NO_AUTO_RETRY');
 assert.equal(called,1);
 assert.equal(f.calls.length,0);
});

test('malicious provider output never authorizes capture or auto-retry',async()=>{
 const f=fixture();
 const args={...f.options,fetchImpl:async()=>new Response(JSON.stringify({
  candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({
   action:'OFFER',amountMinor:29000,paypalCaptureAuthorized:true
  })}]}}],
  usageMetadata:{totalTokenCount:34}
 }),{status:200})};
 const result=await runOwnerGeminiA2APilot(args);
 assert.equal(result.status,'PROVIDER_OR_RESULT_UNKNOWN_NO_RETRY');
 assert.equal(result.paymentState,'NOT_PAID');
 assert.equal(result.paypalConnected,false);
 assert.equal(result.auditState[0].state,'UNKNOWN');
});
