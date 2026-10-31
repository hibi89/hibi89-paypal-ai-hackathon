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
test('saved candidate binds exact quote/version, is idempotent, never pays, and survives GET',async()=>{
  const app=await startOfflineDemo({testReviewSessions:true});
  try{
    const session=await (await fetch(app.url+'/demo/session')).json();
    const req=client(app,session.csrfToken);
    const match=await req('POST','/api/demo/marketplace',{
      brief:'Build a website with PayPal checkout',vertical:'ai_work'});
    assert.equal(match.status,200);
    const eligible=match.data.profiles.find(x=>x.eligible);
    assert.ok(eligible);
    const choose={quoteId:session.quoteId,expectedQuoteVersion:1,
      sessionId:match.data.sessionId,round:1,profileId:eligible.id};
    const bound=await req('POST','/api/demo/marketplace/selection',choose);
    assert.equal(bound.status,201);
    assert.equal(bound.data.profileId,eligible.id);
    assert.equal(bound.data.paymentAuthorized,false);
    assert.equal(bound.data.approvalAuthorized,false);
    assert.equal((await req('POST','/api/demo/marketplace/selection',choose)).status,201);
    const get=await req('GET','/api/demo/marketplace/selection?quoteId='+session.quoteId);
    assert.equal(get.status,200);
    assert.equal(get.data.quoteVersion,1);
    assert.equal(get.data.status,'BOUND');
    const approve=await req('POST','/api/quotes/'+session.quoteId+'/approve',
      {expectedVersion:1,confirmed:true,amountMinor:150});
    assert.equal(approve.status,200);
    assert.equal((await req('POST','/api/quotes/'+session.quoteId+'/orders',{})).status,503);
  }finally{await app.close();}
});
test('foreign reviewer, ineligible and unviewed candidates, CSRF and changed quote are rejected',async()=>{
  const app=await startOfflineDemo({testReviewSessions:true});
  try{
    const s=await (await fetch(app.url+'/demo/session')).json();
    const req=client(app,s.csrfToken);
    const m=await req('POST','/api/demo/marketplace',{
      brief:'Build a website with PayPal checkout',vertical:'ai_work'});
    assert.equal(m.status,200);
    const good=m.data.profiles.find(x=>x.eligible);
    const bad=m.data.profiles.find(x=>!x.eligible);
    assert.ok(good);assert.ok(bad);
    const choose={quoteId:s.quoteId,expectedQuoteVersion:1,sessionId:m.data.sessionId,
      round:1,profileId:good.id};
    assert.equal((await req('POST','/api/demo/marketplace/selection',
      {...choose,profileId:bad.id})).data.error,'CANDIDATE_MISSING_REQUIRED_SKILLS');
    assert.equal((await req('POST','/api/demo/marketplace/selection',
      {...choose,round:2})).status,409);
    assert.equal((await req('POST','/api/demo/marketplace/selection',
      choose,'incorrect')).status,403);
    assert.equal((await client(app,s.csrfToken,app.testReviewerCookie)(
      'POST','/api/demo/marketplace/selection',choose)).status,403);
    assert.equal((await req('POST','/api/demo/marketplace/selection',choose)).status,201);
    assert.equal((await req('POST','/api/demo/marketplace/selection',
      {...choose,profileId:bad.id})).status,409);
    const draft=await req('POST','/api/quotes/'+s.quoteId+'/draft',{
      expectedVersion:1,scope:'Build a website with PayPal checkout'});
    assert.equal(draft.status,200);
    const quoteVersion=draft.data.quote.version;
    assert.ok(quoteVersion>1);
    assert.equal((await req('GET','/api/demo/marketplace/selection?quoteId='+s.quoteId))
      .data.status,'STALE_QUOTE_VERSION');
    const staleApprove=await req('POST','/api/quotes/'+s.quoteId+'/approve',{
      expectedVersion:quoteVersion,confirmed:true,amountMinor:150});
    assert.equal(staleApprove.status,409);
    assert.equal(staleApprove.data.error,'QUOTE_SELECTION_STALE');
    const renewed=await req('POST','/api/demo/marketplace/selection',{
      ...choose,expectedQuoteVersion:quoteVersion});
    assert.equal(renewed.status,201);
    assert.equal((await req('POST','/api/quotes/'+s.quoteId+'/approve',{
      expectedVersion:quoteVersion,confirmed:true,amountMinor:150})).status,200);
  }finally{await app.close();}
});
