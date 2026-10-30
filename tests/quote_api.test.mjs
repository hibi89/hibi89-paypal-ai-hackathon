import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryQuoteRepository, createQuoteApi } from '../src/quote_api.mjs';
import { approvedAmount } from '../src/payment_contract.mjs';

const base = 'https://demo.example';
const quote = (p = {}) => ({ id: 'q1', ownerId: 'buyer-a', version: 2,
  status: 'PROPOSED', currency: 'USD', aiSuggestedMinor: 9900, approval: null, ...p });
const approved = { expectedVersion: 2, confirmed: true, amountMinor: 1500 };
function setup(actor = 'buyer-a', rows = [quote()]) {
  const repository = createMemoryQuoteRepository(rows);
  const counts = { read: 0, write: 0 };
  const proxy = {
    async get(id) { counts.read++; return repository.get(id); },
    async approve(value) { counts.write++; return repository.approve(value); },
    async reject(value) { counts.write++; return repository.reject(value); },
  };
  const handle = createQuoteApi({ repository: proxy, async resolveSession() {
    return actor ? { verified: true, actorId: actor, csrfToken: 'secret-csrf' } : null;
  } });
  return { handle, repository, counts };
}
const req = (method, path, body = approved, over = {}) => new Request(base + path, {
  method, ...(method === 'POST' ? {
    headers: { 'content-type': 'application/json',
      'x-csrf-token': 'secret-csrf', origin: base, ...over },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  } : { headers: over }),
});
const get = '/api/quotes/q1';
const post = '/api/quotes/q1/approve';
const rejection = '/api/quotes/q1/reject';
const json = async r => r.json();
test('API cannot be created without trusted resolver + repository', () => {
  assert.throws(() => createQuoteApi({}), TypeError);
  assert.throws(() => createQuoteApi({ repository: createMemoryQuoteRepository() }), TypeError);
});
test('GET returns own quote with no-store, no write', async () => {
  const { handle, counts } = setup();
  const r = await handle(req('GET', get));
  assert.equal(r.status, 200);
  assert.equal((await json(r)).quote.status, 'PROPOSED');
  assert.equal(r.headers.get('cache-control'), 'private, no-store');
  assert.equal(counts.write, 0);
});
test('GET refresh 5 times never approves', async () => {
  const { handle, counts } = setup();
  for (let i = 0; i < 5; i++) assert.equal((await handle(req('GET', get))).status, 200);
  assert.equal(counts.write, 0);
});
test('GET payment fails closed before persistent ledger', async () => {
  const { handle, counts } = setup();
  const r = await handle(req('GET', get + '/payment'));
  assert.equal(r.status, 503);
  assert.equal((await json(r)).error, 'PERSISTENT_PAYMENT_LEDGER_NOT_READY');
  assert.equal(counts.write, 0);
});
test('unverified user cannot read or approve', async () => {
  const { handle, counts } = setup(null);
  assert.equal((await handle(req('GET', get))).status, 401);
  assert.equal((await handle(req('POST', post))).status, 401);
  assert.equal(counts.write, 0);
});
test('foreign user gets indistinguishable 404 on read/write', async () => {
  const { handle, counts } = setup('buyer-b');
  assert.equal((await handle(req('GET', get))).status, 404);
  assert.equal((await handle(req('POST', post))).status, 404);
  assert.equal(counts.write, 0);
});
test('CSRF header mismatch blocks approval', async () => {
  const { handle, counts } = setup();
  const r = await handle(req('POST', post, approved, { 'x-csrf-token': 'forged' }));
  assert.equal(r.status, 403);
  assert.equal((await json(r)).error, 'CSRF_REQUIRED');
  assert.equal(counts.write, 0);
});
test('cross-site Origin is rejected', async () => {
  const { handle, counts } = setup();
  assert.equal((await handle(req('POST', post, approved,
    { origin: 'https://evil.example' }))).status, 403);
  assert.equal(counts.write, 0);
});
test('explicit human approval locks 15.00 USD, not AI 99.00 USD', async () => {
  const { handle, repository } = setup();
  const r = await handle(req('POST', post));
  assert.equal(r.status, 200);
  const record = (await json(r)).quote;
  assert.equal(approvedAmount(record), 1500);
  assert.equal(record.aiSuggestedMinor, 9900);
  assert.equal(record.approval.actorId, 'buyer-a');
  assert.equal((await repository.get('q1')).status, 'APPROVED');
});
test('human rejection records reason and prevents approval at same version', async()=>{
  const {handle,repository}=setup();
  const r=await handle(req('POST',rejection,{expectedVersion:2,reason:'Scope is too broad'}));
  assert.equal(r.status,200);
  assert.deepEqual((await json(r)).quote.rejection,{decision:'REJECTED',actorId:'buyer-a',
    quoteVersion:2,reason:'Scope is too broad'});
  const approveResult=await handle(req('POST',post));
  assert.equal(approveResult.status,409);
  assert.equal((await json(approveResult)).error,'QUOTE_REJECTED');
  assert.equal((await repository.get('q1')).status,'PROPOSED');
});
test('rejection validates reason, version, and owner',async()=>{
  const {handle}=setup();
  assert.equal((await handle(req('POST',rejection,{expectedVersion:1,reason:'Need update'}))).status,409);
  assert.equal((await handle(req('POST',rejection,{expectedVersion:2,reason:' '}))).status,400);
  assert.equal((await handle(req('POST',rejection,{expectedVersion:2,reason:'x'.repeat(501)}))).status,400);
  assert.equal((await handle(req('POST',rejection,{expectedVersion:2,reason:'bad\u0000reason'}))).status,400);
  assert.equal((await handle(req('POST',rejection,{expectedVersion:2}))).status,400);
  assert.equal((await setup('buyer-b').handle(req('POST',rejection,
    {expectedVersion:2,reason:'Not suitable'}))).status,404);
});
test('rejection enforces the same CSRF and origin boundary as approval',async()=>{
  const {handle,counts}=setup();
  assert.equal((await handle(req('POST',rejection,{expectedVersion:2,reason:'Not suitable'},
    {'x-csrf-token':'forged'}))).status,403);
  assert.equal((await handle(req('POST',rejection,{expectedVersion:2,reason:'Not suitable'},
    {origin:'https://evil.example'}))).status,403);
  assert.equal(counts.write,0);
});
test('duplicate rejection conflicts and concurrent decisions are exclusive',async()=>{
  const {handle}=setup();
  assert.equal((await handle(req('POST',rejection,{expectedVersion:2,reason:'Needs revision'}))).status,200);
  assert.equal((await handle(req('POST',rejection,{expectedVersion:2,reason:'Changed mind'}))).status,409);
  const second=setup();
  const results=await Promise.all([second.handle(req('POST',post)),
    second.handle(req('POST',rejection,{expectedVersion:2,reason:'Not approved'}))]);
  assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
});
test('no confirmed:true cannot approve', async () => {
  const { handle, counts } = setup();
  const r = await handle(req('POST', post, { ...approved, confirmed: false }));
  assert.equal(r.status, 400);
  assert.equal((await json(r)).error, 'EXPLICIT_CONFIRMATION_REQUIRED');
  assert.equal(counts.write, 0);
});
test('quote version mismatch cannot approve', async () => {
  const { handle } = setup();
  const r = await handle(req('POST', post, { ...approved, expectedVersion: 1 }));
  assert.equal(r.status, 409);
  assert.equal((await json(r)).error, 'STALE_QUOTE_VERSION');
});
test('invalid amounts never reach repository', async () => {
  const { handle, counts } = setup();
  for (const amountMinor of [1.5, 0, -1, 1000001, null]) {
    assert.equal((await handle(req('POST', post,
      { ...approved, amountMinor }))).status, 400);
  }
  assert.equal(counts.write, 0);
});
test('replayed POST returns conflict, amount unchanged', async () => {
  const { handle, repository } = setup();
  assert.equal((await handle(req('POST', post))).status, 200);
  const r = await handle(req('POST', post, { ...approved, amountMinor: 1700 }));
  assert.equal(r.status, 409);
  assert.equal((await json(r)).error, 'QUOTE_ALREADY_APPROVED');
  assert.equal((await repository.get('q1')).approval.amountMinor, 1500);
});
test('single-process concurrent approval accepts exactly one', async () => {
  const { handle } = setup();
  const rr = await Promise.all([
    handle(req('POST', post)),
    handle(req('POST', post)),
  ]);
  assert.deepEqual(rr.map(r => r.status).sort(), [200, 409]);
});
test('payment order POST blocked before approval', async () => {
  const { handle, counts } = setup();
  const r = await handle(req('POST', get + '/orders'));
  assert.equal(r.status, 409);
  assert.equal((await json(r)).error, 'HUMAN_APPROVAL_REQUIRED');
  assert.equal(counts.write, 0);
});
test('payment order POST blocked even after valid approval', async () => {
  const { handle } = setup();
  assert.equal((await handle(req('POST', post))).status, 200);
  const r = await handle(req('POST', get + '/orders'));
  assert.equal(r.status, 503);
  assert.equal((await json(r)).error, 'PAYMENT_GATE_NOT_READY');
});
test('GET approval endpoint cannot mutate: method 405', async () => {
  const { handle, counts } = setup();
  const r = await handle(req('GET', post));
  assert.equal(r.status, 405);
  assert.equal(r.headers.get('allow'), 'POST');
  assert.equal(counts.write, 0);
});
test('health is explicitly offline-only', async () => {
  const { handle } = setup();
  assert.deepEqual(await json(await handle(req('GET', '/api/health'))),
    { status: 'OFFLINE_ONLY', payment: 'NOT_CONFIGURED' });
});
test('invalid JSON and non-object fail closed', async () => {
  const { handle } = setup();
  for (const value of ['broken!', '[]']) {
    assert.equal((await handle(req('POST', post, value))).status, 400);
  }
  assert.equal((await handle(req('POST', post, JSON.stringify(approved),
    { 'content-type': 'text/plain' }))).status, 415);
});
test('body >4096 bytes rejected', async () => {
  const { handle, counts } = setup();
  const r = await handle(req('POST', post, { ...approved, huge: 'X'.repeat(5000) }));
  assert.equal(r.status, 413);
  assert.equal((await json(r)).error, 'BODY_TOO_LARGE');
  assert.equal(counts.write, 0);
});
test('unknown and malformed route 404', async () => {
  const { handle } = setup();
  for (const path of [get + '/capture', post + '/again', '/v2/checkout/orders']) {
    assert.equal((await handle(req('GET', path))).status, 404);
  }
});
test('repository prevents pre-approved invalid quote and duplicate IDs', () => {
  assert.throws(() => createMemoryQuoteRepository([
    quote({ status: 'APPROVED' }),
  ]), { code: 'INVALID_APPROVAL' });
  assert.throws(() => createMemoryQuoteRepository([quote(), quote()]),
    { code: 'DUPLICATE_QUOTE_ID' });
  assert.throws(() => createMemoryQuoteRepository([
    quote({ currency: 'EUR' }),
  ]), { code: 'UNSUPPORTED_CURRENCY' });
});
test('in-memory repository returns defensive copies', async () => {
  const repository = createMemoryQuoteRepository([quote()]);
  const q = await repository.get('q1');
  q.status = 'APPROVED';
  assert.equal((await repository.get('q1')).status, 'PROPOSED');
});

