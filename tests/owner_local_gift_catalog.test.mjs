import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createInnovationLab} from '../src/innovation_lab.mjs';
import {validateOwnerGiftCatalog} from '../src/owner_local_gift_catalog.mjs';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';

const actor='synthetic-owner',merchant='synthetic-merchant';
const items=[
 {id:'my-light-a',category:'lighting',style:'PREMIUM',priceMinor:3500},
 {id:'my-light-b',category:'lighting',style:'PRACTICAL',priceMinor:2900}
];
test('owner-supplied catalog rejects PII fields, duplicate IDs, bad categories and prices',()=>{
 for(const invalid of [[],[items[0]],items.concat(items[0]),
  [{...items[0],customerEmail:'private@example.test'},items[1]],
  [{...items[0],priceMinor:0},items[1]],
  [{...items[0],id:'space in id'},items[1]],
  [{...items[0],category:'crypto'},items[1]],
  Array(9).fill(0).map((_,i)=>({...items[0],id:'more-'+i}))])
  assert.throws(()=>validateOwnerGiftCatalog(invalid),/INVALID_OWNER_LOCAL_GIFT_CATALOG/);
});
test('owner catalog revision, replay, restart and single-use gift budget are persisted',()=>{
 const dir=mkdtempSync(join(tmpdir(),'owner-catalog-'));let store;
 try{
  const filename=join(dir,'lab.sqlite');
  store=createInnovationLab({filename});
  assert.equal(store.catalog({actor,merchant}).revision,0);
  const receipt=store.importCatalog({actor,merchant,key:'load-1',expectedRevision:0,items});
  assert.equal(receipt.status,'OWNER_LOCAL_CATALOG_IMPORTED');
  assert.equal(receipt.revision,1);
  assert.equal(receipt.paymentAuthorized,false);
  assert.equal(receipt.providerCalls,0);
  assert.equal(store.importCatalog({actor,merchant,key:'load-1',expectedRevision:0,items}).replayed,true);
  assert.throws(()=>store.importCatalog({actor,merchant,key:'load-1',expectedRevision:0,
   items:[{...items[0],priceMinor:3400},items[1]]}),e=>e.code==='REPLAY_CONFLICT');
  assert.throws(()=>store.importCatalog({actor,merchant,key:'load-2',expectedRevision:0,items}),
   e=>e.code==='OWNER_CATALOG_VERSION_CONFLICT');
  const grant=store.delegate({actor,merchant,key:'mandate-1',category:'gifts',
   maxMinor:3400,expiresInMinutes:30});
  const preferences={category:'lighting',style:'PREMIUM',priority:'MATCH_STYLE',maxPriceMinor:3400};
  const answer=store.trade({actor,merchant,key:'gift-1',kind:'gift',consentId:grant.consentId,
   giftPreferences:preferences});
  assert.equal(answer.selected.id,'my-light-b');
  assert.equal(answer.catalogRevision,1);
  assert.equal(answer.catalogSource,'OWNER_SUPPLIED_LOCAL_NOT_VENDOR_VERIFIED');
  assert.equal(answer.reservedMinor,2900);
  assert.equal(answer.providerInventoryVerified,false);
  assert.equal(answer.checkout,'DISABLED');
  assert.equal(answer.paymentAuthorized,false);
  assert.equal(store.trade({actor,merchant,key:'gift-1',kind:'gift',
   consentId:grant.consentId,giftPreferences:preferences}).replayed,true);
  assert.throws(()=>store.trade({actor,merchant,key:'gift-2',kind:'gift',
   consentId:grant.consentId,giftPreferences:preferences}),e=>e.code==='DELEGATION_ALREADY_SPENT');
  store.close();store=createInnovationLab({filename});
  assert.equal(store.catalog({actor,merchant}).revision,1);
  const second=store.importCatalog({actor,merchant,key:'load-3',expectedRevision:1,
   items:[{...items[0],priceMinor:3200},items[1]]});
  assert.equal(second.revision,2);
  const grant2=store.delegate({actor,merchant,key:'mandate-2',category:'gifts',
   maxMinor:3400,expiresInMinutes:30});
  assert.equal(store.trade({actor,merchant,key:'gift-3',kind:'gift',
   consentId:grant2.consentId,giftPreferences:preferences}).selected.id,'my-light-a');
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
test('real loopback HTTP import is explicitly owned, CSRF protected, version-bound and payment-free',async()=>{
 const app=await startOfflineDemo({testReviewSessions:true});const root=app.url+'/api/demo/innovation/';
 try{
  const session=await(await fetch(app.url+'/demo/session')).json();
  const send=(route,body,extra={})=>fetch(root+route,{method:'POST',
   headers:{origin:app.url,'x-csrf-token':session.csrfToken,
    'content-type':'application/json',...extra},body:JSON.stringify(body)});
  const value={idempotencyKey:'catalog-1',expectedRevision:0,items};
  assert.equal((await fetch(root+'catalog',{headers:{cookie:app.testReviewerCookie}})).status,403);
  assert.equal((await send('catalog',value,{'x-csrf-token':'bad'})).status,403);
  assert.equal((await send('catalog',{...value,items:[{...items[0],buyerEmail:'bad'},items[1]]})).status,400);
  assert.equal((await send('catalog',value)).status,201);
  const saved=await(await fetch(root+'catalog')).json();
  assert.equal(saved.available,true);
  assert.equal(saved.revision,1);
  assert.equal(saved.items.length,2);
  assert.equal(saved.providerInventoryVerified,false);
  const state=await(await fetch(root+'state')).json();
  assert.equal(state.catalog.revision,1);
  assert.equal(state.realPayPal,false);
  assert.equal((await send('catalog',{...value,idempotencyKey:'fresh'})).status,409);
  const grant=(await(await send('delegate',{idempotencyKey:'gift-delegation',
   category:'gifts',maxMinor:4000,expiresInMinutes:30})).json()).consentId;
  const trade=await(await send('gift',{idempotencyKey:'pick-1',consentId:grant,
   category:'lighting',style:'PREMIUM',priority:'MATCH_STYLE',maxPriceMinor:4000})).json();
  assert.equal(trade.selected.id,'my-light-a');
  assert.equal(trade.paymentAuthorized,false);
  assert.equal(trade.checkout,'DISABLED');
  assert.equal(trade.providerInventoryVerified,false);
 }finally{await app.close();}
});
