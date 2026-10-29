import test from 'node:test';
import assert from 'node:assert/strict';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';
import {matchSyntheticMarketplaceBrief,matchSyntheticGeneralServiceBrief} from '../src/marketplace_match.mjs';

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
  assert.equal(other.profiles[0].id,'synthetic-translator');
  assert.equal(other.profiles[0].eligible,true);
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
