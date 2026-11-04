import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createOwnerPrivateGeminiInnovationLab} from '../src/owner_private_gemini_innovation_lab.mjs';

const secret='FAKE_TEST_KEY_NEVER_USE_IN_PRODUCTION';
const scope={actor:'owner_private',merchant:'fictional_merchant',job:'synthetic_service'};
const root=()=>mkdtempSync(join(tmpdir(),'ppl-private-a2a-'));
const options=(dir,fetchImpl)=>({
 filename:join(dir,'part2.sqlite'),budgetFilename:join(dir,'quota.sqlite'),
 scope,apiKey:secret,fetchImpl,
 ownerAuthorized:true,freeTierConfirmed:true,operatorConfirmed:true
});
const reply=(action,amountMinor)=>new Response(JSON.stringify({
 candidates:[{finishReason:'STOP',
  content:{parts:[{text:JSON.stringify({action,amountMinor})}]}}],
 usageMetadata:{totalTokenCount:40}
}),{status:200,headers:{'content-type':'application/json'}});

test('private adapter refuses setup before disk or Gemini calls without 3 approvals',()=>{
 const dir=root();let calls=0;
 try{
  const fake=async()=>{calls++;return reply('OFFER',29000);};
  for(const remove of ['ownerAuthorized','freeTierConfirmed','operatorConfirmed']){
   const args=options(dir,fake);args[remove]=false;
   assert.throws(()=>createOwnerPrivateGeminiInnovationLab(args),
    /OWNER_PRIVATE_GEMINI_A2A_APPROVAL_REQUIRED/);
  }
  assert.equal(calls,0);
  assert.equal(existsSync(join(dir,'part2.sqlite')),false);
  assert.equal(existsSync(join(dir,'quota.sqlite')),false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('private A2A runs injected two-agent transport and stores NON-ATTESTED evidence, replay and restore',async()=>{
 const dir=root();let fetches=0;
 const fake=async(_url,opts)=>{
  fetches++;
  assert.equal(opts.method,'POST');
  assert.equal(opts.redirect,'error');
  assert.equal(opts.headers['x-goog-api-key'],secret);
  return fetches===1?reply('OFFER',29000):reply('ACCEPT',29000);
 };
 let app;
 try{
  app=createOwnerPrivateGeminiInnovationLab(options(dir,fake));
  assert.equal(app.defaultDemoEnabled,false);
  assert.equal(app.publicHttpEnabled,false);
  const grant=app.delegate({key:'mandate_1',maxMinor:30000,expiresInMinutes:30});
  const result=await app.negotiate({key:'deal_1',consentId:grant.consentId});
  assert.equal(result.status,'SYNTHETIC_AGREEMENT');
  assert.equal(result.accepted,true);
  assert.equal(result.agreedMinor,29000);
  assert.equal(result.mode,'PRIVATE_INJECTED_AGENT_NOT_ATTESTED');
  assert.equal(result.providerCalls,'NOT_ATTESTED');
  assert.equal(result.realGemini,false);
  assert.equal(result.paymentAuthorized,false);
  assert.equal(result.paypalCapturePerformed,false);
  assert.equal(result.paymentState,'NOT_PAID');
  assert.equal(fetches,2);
  assert.deepEqual(app.quotaStatus().records.map(x=>x.state),['DONE','DONE']);
  const again=await app.negotiate({key:'deal_1',consentId:grant.consentId});
  assert.equal(again.replayed,true);
  assert.equal(fetches,2);
  const state=app.state();
  assert.equal(state.mode,'PRIVATE_INJECTED_AGENT_NOT_ATTESTED');
  assert.equal(state.providerCalls,'NOT_ATTESTED');
  assert.equal(state.realGemini,false);
  assert.equal(state.events.find(x=>x.kind==='a2a').result.providerCalls,'NOT_ATTESTED');
  app.close();app=null;
  app=createOwnerPrivateGeminiInnovationLab(options(dir,fake));
  assert.equal(app.state().events.find(x=>x.kind==='a2a').result.accepted,true);
  assert.equal((await app.negotiate({key:'deal_1',consentId:grant.consentId})).replayed,true);
  assert.equal(app.quotaStatus().requestsClaimed,2);
  assert.equal(fetches,2);
 }finally{app?.close();rmSync(dir,{recursive:true,force:true});}
});
test('provider quota failure is durable UNKNOWN and cannot repeat Gemini request',async()=>{
 const dir=root();let fetches=0;let app;
 try{
  const fake=async()=>{fetches++;return new Response('mock 429',{status:429});};
  app=createOwnerPrivateGeminiInnovationLab(options(dir,fake));
  const grant=app.delegate({key:'mandate_f',maxMinor:30000,expiresInMinutes:30});
  const result=await app.negotiate({key:'deal_f',consentId:grant.consentId});
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.accepted,false);
  assert.equal(result.paymentAuthorized,false);
  assert.equal(fetches,1);
  assert.deepEqual(app.quotaStatus().records.map(x=>x.state),['UNKNOWN']);
  app.close();app=null;
  app=createOwnerPrivateGeminiInnovationLab(options(dir,fake));
  assert.equal((await app.negotiate({key:'deal_f',consentId:grant.consentId})).replayed,true);
  assert.equal(fetches,1);
 }finally{app?.close();rmSync(dir,{recursive:true,force:true});}
});
