import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const pages=[
  ['web/offline_demo.html','WORKNOVA marketplace home'],
  ['web/innovation_dashboard.html','worknova-brand'],
  ['web/private_host_marketplace.html','WORKNOVA | Verified Marketplace Workspace'],
];
function read(relative){
  return readFileSync(new URL('../'+relative,import.meta.url),'utf8');
}
test('WORKNOVA identity is consistent on three real product HTML surfaces',()=>{
  for(const [path,visible] of pages){
    const html=read(path);
    assert.match(html,/<title>WORKNOVA/,'page title: '+path);
    assert.ok(html.includes(visible),'visible identity: '+path);
    assert.doesNotMatch(html,/\\bProofline\\b|\\bproofline\\b/,'legacy visible brand: '+path);
  }
});
test('Part 1 browser hooks and offline-only disclosures survive branding',()=>{
  const html=read('web/offline_demo.html');
  for(const id of ['marketplace-form','marketplace-vertical','marketplace-brief','marketplace-submit','approve-form','approve-submit','payment-status','demo-role-toggle','contract-events']){
    assert.ok(html.includes('id="'+id+'"'),'missing browser hook '+id);
  }
  assert.ok(html.includes('OFFLINE DEMONSTRATION') || html.includes('Offline demonstration'));
  assert.match(html,/does not call Gemini or PayPal/);
  assert.match(html,/href="\/demo\/innovation"/);
});
test('Part 2 keeps all five functional HTML controls and non-payment notice',()=>{
  const html=read('web/innovation_dashboard.html');
  for(const id of ['delegate','a2a','gift','churn','invoice']){
    assert.ok(html.includes('id="'+id+'"'),'missing functional hook '+id);
  }
  assert.match(html,/NOT REAL AI OR PAYPAL/);
  assert.match(html,/not a live model/);
  assert.match(html,/href="\/demo"/);
});
test('Private host keeps sign-in and protected workflow controls',()=>{
  const html=read('web/private_host_marketplace.html');
  for(const id of ['sign-in','sign-out','read-quote','read-contract','submit','accept','reject']){
    assert.ok(html.includes('id="'+id+'"'),'missing private host hook '+id);
  }
  assert.match(html,/PAYMENT: NOT AUTHORIZED/);
  assert.match(html,/exact origin and a one-time CSRF/);
  assert.match(html,/src="\/private\/marketplace\/app.js"/);
});
