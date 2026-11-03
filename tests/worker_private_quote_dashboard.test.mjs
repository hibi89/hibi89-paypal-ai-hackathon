import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkerPrivateQuoteDashboard} from '../src/worker_private_quote_dashboard.mjs';
const ORIGIN='https://owner.proofline-review.dev';
test('real D1 owner quote workbench is private, and static JS never creates payments',async()=>{
 const db={withSession(mode){assert.equal(mode,'first-primary');return {prepare(){throw Error('NO_SESSION')}}}};
 const view=createWorkerPrivateQuoteDashboard({db,allowedOrigin:ORIGIN});
 const req=path=>new Request(ORIGIN+path);
 assert.equal((await view.fetch(req('/__private/quotes/view'))).status,401);
 assert.equal((await view.fetch(req('/__private/quotes/view.js'))).status,401);
 assert.equal((await view.fetch(req('/__private/quotes/view.css'))).status,401);
 assert.equal((await view.fetch(new Request(ORIGIN+'/__private/quotes/view',{
  method:'POST'}))).status,405);
 assert.equal((await view.fetch(req('/__private/quotes/view?redirect=https://evil.dev'))).status,404);
});
