import test from 'node:test';
import assert from 'node:assert/strict';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';
import {matchSyntheticMarketplaceBrief,matchSyntheticGeneralServiceBrief} from '../src/marketplace_match.mjs';
import {createMarketplaceRecommendationStore} from '../src/marketplace_recommendation_store.mjs';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';

test('deterministic three-profile marketplace never fabricates seller data, AI or payment',()=>{
  const a=matchSyntheticMarketplaceBrief('Build a responsive ecommerce website with PayPal checkout');
  assert.deepEqual(a,matchSyntheticMarketplaceBrief('Build a responsive ecommerce website with PayPal checkout'));
  assert.equal(a.profileCount,3);
  assert.equal(a.profiles.length,3);
  assert.deepEqual(a.requestedSkills,['web','payments']);
  assert.equal(a.profiles[0].id,'synthetic-web');
  assert.equal(a.profiles[0].eligible,true);
  assert.equal(a.profiles.filter(p=>p.eligible).length,1);
  assert.equal(a.price.status,'DATA_INSUFFICIENT');
  assert.equal(a.price.amountMinor,null);
  assert.equal(a.paypal.capturePerformed,false);
  assert.equal(a.mode,'OFFLINE_SYNTHETIC_NO_AI');
});
test('Global Services has category-specific fictional workers without payment',()=>{
  const result=matchSyntheticGeneralServiceBrief('Design a new logo and brand identity');
  assert.equal(result.vertical,'general_services');
  assert.equal(result.profileCount,3);
  assert.equal(result.profiles[0].id,'synthetic-creative');
  assert.equal(result.profiles[0].eligible,true);
  assert.equal(result.paypal.capturePerformed,false);
  assert.equal(result.price.status,'DATA_INSUFFICIENT');
  const other=matchSyntheticGeneralServiceBrief('Translate Korean content into English');
  assert.equal(other.profiles.find(p=>p.id==='synthetic-translator')?.eligible,true);
  assert.equal(other.profiles.find(p=>p.id==='synthetic-translator')?.eligible,true);
  assert.ok(other.profiles.every(profile=>profile.source==='SYNTHETIC_PROFILE'));
  assert.throws(()=>matchSyntheticGeneralServiceBrief('bad'),/INVALID_SYNTHETIC_BRIEF/);
});
test('unrecognized skills fail to grant fictional eligibility',()=>{
  const result=matchSyntheticMarketplaceBrief('Need an unusual task that no candidate profile can cover');
  assert.equal(result.needsClarification,true);
  assert.ok(result.profiles.every(p=>!p.eligible));
});
test('reject malformed and oversized briefs instead of generating fabricated matches',()=>{
  for(const brief of ['', 'short', 'Good\ninjection', 'x'.repeat(501), {}, null])
    assert.throws(()=>matchSyntheticMarketplaceBrief(brief),/INVALID_SYNTHETIC_BRIEF/);
});
test('local marketplace API is human-triggered, CSRF-bound, origin-checked and owner-only',async()=>{
  const app=await startOfflineDemo({testReviewSessions:true});
  try {
    const url=app.url+'/api/demo/marketplace';
    const session=await (await fetch(app.url+'/demo/session')).json();
    const send=(body,headers={})=>fetch(url,{method:'POST',headers:{
      'content-type':'application/json','x-csrf-token':session.csrfToken,...headers
    },body:JSON.stringify(body)});
    assert.equal((await fetch(url)).status,405);
    assert.equal((await send({brief:'Build a small ecommerce web storefront'},
      {'x-csrf-token':'forged'})).status,403);
    assert.equal((await send({brief:'Build a small ecommerce web storefront'},
      {origin:'https://attacker.example'})).status,403);
    assert.equal((await send({brief:'Build a small ecommerce web storefront'},
      {cookie:app.testReviewerCookie})).status,403);
    assert.equal((await send({brief:'Build a small ecommerce web storefront',merchantId:'attacker'})).status,400);
    const response=await send({brief:'Build a small ecommerce web storefront'});
    assert.equal(response.status,200);
    const output=await response.json();
    assert.equal(output.profiles.length,3);
    assert.equal(output.paypal.status,'NOT_CONNECTED');
    assert.equal(output.vertical,'ai_work');
    const general=await send({brief:'Design a new logo and brand identity',vertical:'general_services'});
    assert.equal(general.status,200);
    const generalBody=await general.json();
    assert.equal(generalBody.vertical,'general_services');
    assert.equal(generalBody.profiles[0].id,'synthetic-creative');
    assert.equal(generalBody.paypal.status,'NOT_CONNECTED');
    assert.equal((await send({brief:'Design a new logo',vertical:'unknown'})).status,400);
    assert.equal((await fetch(app.url+'/api/quotes/sample-project/payment')).status,503);
    const staticJs=await fetch(app.url+'/demo/marketplace.js');
    assert.equal(staticJs.status,200);
    assert.match(await staticJs.text(),/No innerHTML/);
    const html=await (await fetch(app.url+'/')).text();
    assert.match(html,/marketplace-form/);
  }finally{await app.close();}
});

test('3x3 opportunity tiers provide distinct candidates without invented rank or price',()=>{
  for(const fn of [matchSyntheticMarketplaceBrief,matchSyntheticGeneralServiceBrief]){
    const brief=fn===matchSyntheticMarketplaceBrief
      ? 'Build an ecommerce website with PayPal checkout'
      : 'Design a logo and brand identity';
    const rounds=[0,1,2].map(round=>fn(brief,{round}));
    const ids=new Set();
    for(const r of rounds){
      assert.equal(r.profiles.length,3);
      assert.equal(r.candidatePoolSize,9);
      assert.deepEqual(r.profiles.map(p=>p.tier),['professional','rising','newcomer']);
      for(const p of r.profiles){
        assert.equal(p.source,'SYNTHETIC_PROFILE');
        assert.equal(p.tierEvidence,'FICTIONAL_SCENARIO_NOT_VERIFIED');
        assert.equal(p.eligible,p.missingSkills.length===0&&r.requestedSkills.length>0);
        assert.ok(!('price' in p)&&!('reviews' in p)&&!('seniorityVerified' in p));
        assert.ok(!ids.has(p.id));ids.add(p.id);
      }
    }
    assert.equal(ids.size,9);
    assert.throws(()=>fn(brief,{round:3}),/INVALID_RECOMMENDATION_ROUND/);
  }
});
test('SQLite recommendation history is atomic, bounded and reopenable',()=>{
  const dir=mkdtempSync(join(tmpdir(),'paypal-match-rounds-'));
  const filename=join(dir,'sessions.sqlite');
  const owner='synthetic-owner',brief='Build an ecommerce website with PayPal checkout';
  const skills=matchSyntheticMarketplaceBrief(brief).requestedSkills;
  try{
    let db=createMarketplaceRecommendationStore(filename);
    const a=db.start(owner,'ai_work',brief,skills);
    assert.equal(a.round,0);
    const repeat=db.start(owner,'ai_work','  BUILD an ecommerce website with PayPal   checkout  ',skills);
    assert.equal(repeat.id,a.id);
    assert.equal(db.next(owner,a.id,1).round,1);
    assert.throws(()=>db.next(owner,a.id,1),/STALE_RECOMMENDATION_ROUND/);
    assert.equal(db.next(owner,a.id,2).round,2);
    assert.throws(()=>db.next(owner,a.id,3),/REFRESH_LIMIT_REACHED/);
    assert.equal(db.get(owner,a.id).round,2);
    assert.equal(db.get('synthetic-reviewer',a.id),null);
    db.close();
    db=createMarketplaceRecommendationStore(filename);
    assert.equal(db.get(owner,a.id).round,2);
    assert.equal(db.start(owner,'ai_work',brief,skills).id,a.id);
    const general=db.start(owner,'general_services','Design a logo and brand identity',['design','branding']);
    assert.notEqual(general.id,a.id);
    assert.equal(general.round,0);
    db.close();
  }finally{rmSync(dir,{recursive:true,force:true})}
});
test('owner API preserves prior three-member lists and limits two additional rounds',async()=>{
  const app=await startOfflineDemo({testReviewSessions:true});
  try{
    const session=await (await fetch(app.url+'/demo/session')).json();
    const post=(path,body,headers={})=>fetch(app.url+path,{method:'POST',headers:{
      'content-type':'application/json','x-csrf-token':session.csrfToken,...headers
    },body:JSON.stringify(body)});
    const brief='Build an ecommerce website with PayPal checkout';
    const initial=await (await post('/api/demo/marketplace',{brief})).json();
    assert.equal(initial.round,1);assert.equal(initial.remainingRefreshes,2);
    assert.equal(initial.history.length,1);
    const firstIds=initial.profiles.map(x=>x.id);
    const historyUrl=app.url+'/api/demo/marketplace/history?sessionId='+initial.sessionId;
    assert.equal((await fetch(historyUrl)).status,200);
    assert.equal((await fetch(historyUrl,{headers:{cookie:app.testReviewerCookie}})).status,403);
    assert.equal((await post('/api/demo/marketplace/next',{sessionId:initial.sessionId,expectedRound:1},
      {'x-csrf-token':'forged'})).status,403);
    const second=await (await post('/api/demo/marketplace/next',
      {sessionId:initial.sessionId,expectedRound:1})).json();
    assert.equal(second.round,2);assert.equal(second.history.length,2);
    assert.deepEqual(second.history[0].profiles.map(p=>p.id),firstIds);
    assert.equal((await post('/api/demo/marketplace/next',
      {sessionId:initial.sessionId,expectedRound:1})).status,409);
    const third=await (await post('/api/demo/marketplace/next',
      {sessionId:initial.sessionId,expectedRound:2})).json();
    assert.equal(third.remainingRefreshes,0);
    assert.equal(third.history.length,3);
    assert.equal(new Set(third.history.flatMap(h=>h.profiles.map(p=>p.id))).size,9);
    assert.equal((await post('/api/demo/marketplace/next',
      {sessionId:initial.sessionId,expectedRound:3})).status,409);
    const historical=await (await fetch(historyUrl)).json();
    assert.equal(historical.history.length,3);
    assert.equal(historical.round,3);
    assert.equal((await (await post('/api/demo/marketplace',{brief})).json()).remainingRefreshes,0);
    assert.equal((await fetch(app.url+'/api/quotes/sample-project/payment')).status,503);
  }finally{await app.close()}
});

test('UI affordances keep per-set history, three tiers and bounded refresh CTA',()=>{
 const html=readFileSync(new URL('../web/offline_demo.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../web/marketplace_client.js',import.meta.url),'utf8');
 assert.match(js,/marketplace-next-recommendations/);
 assert.match(js,/marketplace-history-round-/);
 assert.match(js,/aria-pressed/);
 assert.match(js,/function advanceRecommendations\(\)/);
 assert.match(js,/\/api\/demo\/marketplace\/next/);
 assert.match(js,/\/api\/demo\/marketplace\/history\?sessionId=/);
 assert.match(js,/Career tiers are fictional examples/);
 assert.match(html,/\.recommendation-controls/);
 assert.match(html,/\.profile-tier/);
});
