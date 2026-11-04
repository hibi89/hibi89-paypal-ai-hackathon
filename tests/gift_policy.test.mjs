import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {selectSyntheticGift} from '../src/gift_policy.mjs';
import {createInnovationLab} from '../src/innovation_lab.mjs';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';
const actor='synthetic-owner',merchant='synthetic-merchant';
const pref={category:'lighting',style:'PRACTICAL',priority:'LOWEST_PRICE',maxPriceMinor:3900};
const grant=(store,key,cap)=>store.delegate({
 actor,merchant,key,category:'gifts',maxMinor:cap,expiresInMinutes:30
});
test('fictional cheapest-match sorting is deterministic and payment-free',()=>{
 const r=selectSyntheticGift(pref);
 assert.equal(r.status,'SYNTHETIC_ITEM_SELECTED');
 assert.equal(r.selected.id,'desk-light-b');
 assert.equal(r.selected.priceMinor,3800);
 assert.equal(r.comparedCatalogItems,2);
 assert.equal(r.eligibleItems,1);
 assert.equal(r.selectionOnly,true);
 assert.equal(r.paypalOrderCreated,false);
 assert.equal(r.providerInventoryVerified,false);
 assert.equal(r.checkout,'DISABLED');
 assert.equal(r.paymentState,'NOT_PAID');
});
test('style-first ranking changes the selected product at same budget; cheap ranking wins otherwise',()=>{
 const premium={...pref,style:'PREMIUM',priority:'MATCH_STYLE',maxPriceMinor:5000};
 const ranked=selectSyntheticGift(premium);
 assert.deepEqual(ranked.ranked.map(p=>p.id),['desk-light-a','desk-light-b']);
 assert.equal(ranked.selected.matchScore,100);
 const lowest=selectSyntheticGift({...premium,priority:'LOWEST_PRICE'});
 assert.equal(lowest.selected.id,'desk-light-b');
 assert.equal(selectSyntheticGift({...premium,maxPriceMinor:3900}).selected.id,'desk-light-b');
 assert.equal(selectSyntheticGift({...pref,category:'stationery',maxPriceMinor:2400}).selected.id,'notebook-d');
});
test('ineligible price yields no selection or implicit purchase',()=>{
 const r=selectSyntheticGift({...pref,category:'mug',maxPriceMinor:1500});
 assert.equal(r.status,'NO_ELIGIBLE_GIFT');
 assert.equal(r.selected,null);
 assert.equal(r.accepted,false);
 assert.equal(r.ranked.length,0);
 assert.equal(r.checkout,'DISABLED');
});
test('strict typed preferences reject extra provider fields, invalid budget and category',()=>{
 for(const input of [null,[],{}, {...pref,category:'gift-card'},
  {...pref,style:'GOLD'}, {...pref,priority:'PAYPAL_BUY'},
  {...pref,maxPriceMinor:3999.5},{...pref,maxPriceMinor:0},
  {...pref,maxPriceMinor:1000001},{...pref,paypalAuthorization:true},
  {...pref,customerEmail:'someone@somewhere.test'}]){
  assert.throws(()=>selectSyntheticGift(input),e=>e.code==='INVALID_SYNTHETIC_GIFT_PREFERENCES');
 }
});
test('typed gift mandate cap/one-use replay and no eligible gift semantics persist',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ppl-gift-policy-'));
 const file=join(dir,'lab.sqlite');let store;
 try{
  store=createInnovationLab({filename:file});
  const low=grant(store,'grant-low',3900);
  assert.throws(()=>store.trade({actor,merchant,key:'over',
   consentId:low.consentId,kind:'gift',
   giftPreferences:{...pref,maxPriceMinor:4300}}),e=>e.code==='DELEGATION_CAP_DENIED');
  const picked=store.trade({actor,merchant,key:'gift-1',kind:'gift',
   consentId:low.consentId,giftPreferences:pref});
  assert.equal(picked.selected.id,'desk-light-b');
  assert.equal(picked.reservedMinor,3800);
  assert.equal(picked.paymentAuthorized,false);
  assert.equal(picked.paypalOrderCreated,false);
  const replay=store.trade({actor,merchant,key:'gift-1',kind:'gift',
   consentId:low.consentId,giftPreferences:pref});
  assert.equal(replay.replayed,true);
  assert.throws(()=>store.trade({actor,merchant,key:'gift-1',kind:'gift',
   consentId:low.consentId,giftPreferences:{...pref,priority:'MATCH_STYLE'}}),
   e=>e.code==='REPLAY_CONFLICT');
  assert.throws(()=>store.trade({actor,merchant,key:'gift-2',kind:'gift',
   consentId:low.consentId,giftPreferences:pref}),e=>e.code==='DELEGATION_ALREADY_SPENT');
  const tooLow=grant(store,'grant-empty',1500);
  const noItem=store.trade({actor,merchant,key:'gift-empty',kind:'gift',
   consentId:tooLow.consentId,giftPreferences:{...pref,category:'mug',maxPriceMinor:1500}});
  assert.equal(noItem.status,'NO_ELIGIBLE_GIFT');
  assert.equal(noItem.reservedMinor,0);
  assert.equal(store.state({actor,merchant}).consents.find(c=>c.id===tooLow.consentId).usedMinor,0);
  store.close();store=createInnovationLab({filename:file});
  assert.equal(store.trade({actor,merchant,key:'gift-1',kind:'gift',
   consentId:low.consentId,giftPreferences:pref}).replayed,true);
  assert.equal(store.state({actor,merchant}).events.filter(x=>x.kind==='gift').length,2);
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
test('actual gift HTTP route validates CSRF, reviewer role, body shape and immutable replay',async()=>{
 const app=await startOfflineDemo({testReviewSessions:true});
 try{
  const session=await(await fetch(app.url+'/demo/session')).json();
  const url=app.url+'/api/demo/innovation/';
  const post=(route,data,headers={})=>fetch(url+route,{method:'POST',
   headers:{origin:app.url,'content-type':'application/json',
    'x-csrf-token':session.csrfToken,...headers},
   body:JSON.stringify(data)});
  const req={idempotencyKey:'grant1',category:'gifts',maxMinor:5000,expiresInMinutes:30};
  const granted=await post('delegate',req);
  assert.equal(granted.status,201);
  const {consentId}=await granted.json();
  const payload={idempotencyKey:'gift1',consentId,
   ...{...pref,maxPriceMinor:5000,style:'PREMIUM',priority:'MATCH_STYLE'}};
  assert.equal((await post('gift',payload,{'x-csrf-token':'INVALID'})).status,403);
  assert.equal((await post('gift',payload,{cookie:app.testReviewerCookie})).status,403);
  assert.equal((await post('gift',{...payload,checkout:true})).status,400);
  const result=await post('gift',payload);
  assert.equal(result.status,200);
  assert.equal((await result.json()).selected.id,'desk-light-a');
  const replay=await post('gift',payload);
  assert.equal((await replay.json()).replayed,true);
  assert.equal((await post('gift',{...payload,priority:'LOWEST_PRICE'})).status,409);
  const state=await(await fetch(url+'state')).json();
  assert.equal(state.providerCalls,0);
  assert.equal(state.realPayPal,false);
  assert.deepEqual(await(await fetch(url+'state')).json(),state);
  const granted2=await post('delegate',{...req,idempotencyKey:'grant2',maxMinor:2000});
  const id2=(await granted2.json()).consentId;
  assert.equal((await post('gift',{idempotencyKey:'over1',consentId:id2,
   ...{...pref,maxPriceMinor:5000}})).status,403);
 }finally{await app.close();}
});
