import test from 'node:test';
import assert from 'node:assert/strict';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';

function client(app,csrf,cookie){
  return async(method,path,body,token=csrf)=>{
    const headers={origin:app.url,...(cookie?{cookie}:{})};
    if(method==='POST'){headers['content-type']='application/json';headers['x-csrf-token']=token;}
    const response=await fetch(app.url+path,{
      method,headers,...(method==='POST'?{body:JSON.stringify(body)}:{})
    });
    return {status:response.status,data:await response.json()};
  };
}
async function prepare(req,s,vertical,brief){
  const match=await req('POST','/api/demo/marketplace',{brief,vertical});
  assert.equal(match.status,200);
  const good=match.data.profiles.find(x=>x.eligible);
  assert.ok(good);
  const draft=await req('POST','/api/quotes/'+s.quoteId+'/draft',
    {expectedVersion:1,scope:brief+' [Synthetic candidate: '+good.id+']'});
  assert.equal(draft.status,200);
  const version=draft.data.quote.version;
  return {match:match.data,good,version,
    choice:{quoteId:s.quoteId,expectedQuoteVersion:version,
      sessionId:match.data.sessionId,round:1,profileId:good.id}};
}
for(const [vertical,brief] of [
  ['ai_work','Build a website with PayPal checkout'],
  ['general_services','Design a logo and brand identity for a small business']
]){
  test(vertical+' HTTP end-to-end: draft, candidate bind, approval, contract; no payments',async()=>{
    const app=await startOfflineDemo({testReviewSessions:true});
    try{
      const s=await (await fetch(app.url+'/demo/session')).json();
      const req=client(app,s.csrfToken);
      const {good,version,choice}=await prepare(req,s,vertical,brief);
      const bound=await req('POST','/api/demo/marketplace/selection',choice);
      assert.equal(bound.status,201);
      assert.equal(bound.data.profileId,good.id);
      assert.equal(bound.data.paymentAuthorized,false);
      assert.equal(bound.data.approvalAuthorized,false);
      assert.equal((await req('POST','/api/demo/marketplace/selection',choice)).status,201);
      const proof=await req('GET','/api/demo/marketplace/selection?quoteId='+s.quoteId);
      assert.equal(proof.status,200);
      assert.equal(proof.data.quoteVersion,version);
      assert.equal(proof.data.status,'BOUND');
      const approval=await req('POST','/api/quotes/'+s.quoteId+'/approve',
        {expectedVersion:version,confirmed:true,amountMinor:150});
      assert.equal(approval.status,200);
      const create=await req('POST','/api/contracts',{id:s.contractId,
        quoteId:s.quoteId,reviewerId:s.reviewerId,expectedVersion:version,
        eventId:'candidate-contract',milestones:[{id:s.milestoneId,step:1,amountMinor:150}]});
      assert.equal(create.status,201);
      assert.equal(create.data.contract.paymentState,'NOT_CAPTURED');
      assert.equal((await req('GET','/api/contracts/'+s.contractId)).status,200);
      const evidence=await req('GET','/api/contracts/'+s.contractId+'/candidate');
      assert.equal(evidence.status,200);
      assert.equal(evidence.data.evidence.profileId,good.id);
      assert.equal(evidence.data.evidence.quoteVersion,version);
      assert.equal(evidence.data.evidence.source,'LOCAL_SYNTHETIC_SNAPSHOT');
      assert.equal(evidence.data.evidence.paymentAuthorized,false);
      const reviewer=await client(app,s.csrfToken,app.testReviewerCookie)(
        'GET','/api/contracts/'+s.contractId+'/candidate');
      assert.equal(reviewer.status,200);
      assert.equal(reviewer.data.evidence.profileId,good.id);
      const absent=await req('GET','/api/contracts/does-not-exist/candidate');
      assert.equal(absent.status,404);
      assert.equal((await req('POST','/api/quotes/'+s.quoteId+'/orders',{})).status,503);
    }finally{await app.close();}
  });
}
test('unviewed, missing skill, reviewer, CSRF, scope mismatch and revised quote denied',async()=>{
  const app=await startOfflineDemo({testReviewSessions:true});
  try{
    const s=await (await fetch(app.url+'/demo/session')).json();
    const req=client(app,s.csrfToken);
    const brief='Build a website with PayPal checkout';
    const m=await req('POST','/api/demo/marketplace',{brief,vertical:'ai_work'});
    const good=m.data.profiles.find(x=>x.eligible);
    const bad=m.data.profiles.find(x=>!x.eligible);
    assert.ok(good&&bad);
    const wrong=await req('POST','/api/quotes/'+s.quoteId+'/draft',{
      expectedVersion:1,scope:'Completely unrelated wrong project [Synthetic candidate: '+good.id+']'});
    assert.equal(wrong.status,200);
    const choice={quoteId:s.quoteId,expectedQuoteVersion:wrong.data.quote.version,
      sessionId:m.data.sessionId,round:1,profileId:good.id};
    const mismatch=await req('POST','/api/demo/marketplace/selection',choice);
    assert.equal(mismatch.status,409);
    assert.equal(mismatch.data.error,'QUOTE_SCOPE_CANDIDATE_MISMATCH');
    assert.equal((await req('POST','/api/demo/marketplace/selection',
      {...choice,profileId:bad.id})).data.error,'CANDIDATE_MISSING_REQUIRED_SKILLS');
    assert.equal((await req('POST','/api/demo/marketplace/selection',
      {...choice,round:2})).status,409);
    assert.equal((await req('POST','/api/demo/marketplace/selection',choice,'incorrect')).status,403);
    assert.equal((await client(app,s.csrfToken,app.testReviewerCookie)(
      'POST','/api/demo/marketplace/selection',choice)).status,403);
    const correct=await req('POST','/api/quotes/'+s.quoteId+'/draft',{
      expectedVersion:wrong.data.quote.version,scope:brief+' [Synthetic candidate: '+good.id+']'});
    assert.equal(correct.status,200);
    const selected={...choice,expectedQuoteVersion:correct.data.quote.version};
    assert.equal((await req('POST','/api/demo/marketplace/selection',selected)).status,201);
    assert.equal((await req('POST','/api/demo/marketplace/selection',
      {...selected,profileId:bad.id})).status,409);
    const revision=await req('POST','/api/quotes/'+s.quoteId+'/draft',{
      expectedVersion:correct.data.quote.version,scope:brief+' [Synthetic candidate: '+good.id+']'});
    assert.equal(revision.status,200);
    assert.equal((await req('GET','/api/demo/marketplace/selection?quoteId='+s.quoteId))
      .data.status,'STALE_QUOTE_VERSION');
    const stale=await req('POST','/api/quotes/'+s.quoteId+'/approve',{
      expectedVersion:revision.data.quote.version,confirmed:true,amountMinor:150});
    assert.equal(stale.status,409);
    assert.equal(stale.data.error,'QUOTE_SELECTION_STALE');
    assert.equal((await req('POST','/api/demo/marketplace/selection',
      {...selected,expectedQuoteVersion:revision.data.quote.version})).status,201);
    assert.equal((await req('POST','/api/quotes/'+s.quoteId+'/approve',{
      expectedVersion:revision.data.quote.version,confirmed:true,amountMinor:150})).status,200);
  }finally{await app.close();}
});
