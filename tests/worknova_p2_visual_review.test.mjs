import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../web/innovation_dashboard.html',import.meta.url),'utf8');
const css=source.split('/* WORKNOVA_P2_VISUAL_REFINEMENT_20261109:')[1]?.split('</style>')[0]??'';
test('premium visual layer is CSS-only and responsive',()=>{
 assert.ok(css.length>2000);
 for(const part of ['.hero{','.hero h1{','.card{','header nav a[aria-current="page"]','@media(max-width:680px)','prefers-reduced-motion','focus-visible'])
   assert.ok(css.includes(part),part);
 assert.ok(!css.includes('@import')&&!css.includes('url('));
});
test('synthetic and payment boundaries remain explicit in page',()=>{
 for(const phrase of ['OFFLINE SYNTHETIC DEMO — NOT REAL AI OR PAYPAL.','No PayPal Checkout/Capture','not a PayPal spending credential'])
   assert.ok(source.includes(phrase),phrase);
 for(const id of ['delegate','a2a','revoke-mandate','crosspart-compare','gift-catalog-status','a2a-transcript'])
   assert.ok(source.includes('id="'+id+'"'),id);
});
test('visual override does not add scripts, markup, buttons or routes',()=>{
 assert.equal(source.match(/<script\b/g)?.length??0,1);
 assert.equal(source.match(/<\/style>/g)?.length??0,1);
 assert.ok(!css.includes('<script')&&!css.includes('fetch(')&&!css.includes('POST'));
});
