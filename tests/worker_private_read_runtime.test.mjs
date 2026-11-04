import test from 'node:test';
import assert from 'node:assert/strict';
import runtime,{createPrivateReadOnlyRuntime} from '../src/worker_private_read_runtime.mjs';
const origin='https://proofline.example.test';
const path=origin+'/__private/attempt/status?quoteId=q1&quoteVersion=1&operation=create&requestId=r1';
const request=()=>new Request(path);
const db={withSession(){throw Error('READ_NOT_AUTHORIZED')}};
test('Worker is unavailable by default with no side effects or CORS',async()=>{
 const r=await runtime.fetch(request(),undefined);
 assert.equal(r.status,503);
 assert.deepEqual(await r.json(),{error:'READ_ONLY_WORKER_UNAVAILABLE'});
 assert.equal(r.headers.get('cache-control'),'no-store, max-age=0');
 assert.equal(r.headers.get('access-control-allow-origin'),null);
});
test('Worker requires exact opt-in, configured HTTPS origin and D1 binding',async()=>{
 for(const env of [{},
  {PRIVATE_READ_ONLY_OPT_IN:'true',PRIVATE_READ_ORIGIN:origin,DB:db},
  {PRIVATE_READ_ONLY_OPT_IN:'OWNER_READ_ONLY_D1_VERIFIED',DB:db},
  {PRIVATE_READ_ONLY_OPT_IN:'OWNER_READ_ONLY_D1_VERIFIED',PRIVATE_READ_ORIGIN:origin},
  {PRIVATE_READ_ONLY_OPT_IN:'OWNER_READ_ONLY_D1_VERIFIED',PRIVATE_READ_ORIGIN:'http://example.test',DB:db}
 ]) {
  const r=await runtime.fetch(request(),env);
  assert.equal(r.status,503);
  assert.deepEqual(await r.json(),{error:'READ_ONLY_WORKER_UNAVAILABLE'});
 }
});
test('enabled Worker allows only the route and GET, with cookie authentication',async()=>{
 let primaryCalls=0;
 const binding={withSession(mode){primaryCalls++;assert.equal(mode,'first-primary');
  return {prepare(){throw Error('NO_SESSION')}}
 }};
 const env={PRIVATE_READ_ONLY_OPT_IN:'OWNER_READ_ONLY_D1_VERIFIED',
  PRIVATE_READ_ORIGIN:origin,DB:binding};
 const handler=createPrivateReadOnlyRuntime();
 assert.equal((await handler.fetch(new Request(origin+'/other'),env)).status,404);
 assert.equal((await handler.fetch(new Request(path,{method:'POST'}),env)).status,405);
 assert.equal((await handler.fetch(request(),env)).status,401);
 assert.equal(primaryCalls,0);
});
test('D1 errors never reveal private details or allow cross-origin',async()=>{
 const binding={withSession(){throw Error('SECRET_DB_DETAIL')}};
 const r=await runtime.fetch(new Request(path,{headers:{
  cookie:'__Host-proofline_session='+('a'.repeat(43))
 }}),{PRIVATE_READ_ONLY_OPT_IN:'OWNER_READ_ONLY_D1_VERIFIED',
  PRIVATE_READ_ORIGIN:origin,DB:binding});
 assert.equal(r.status,503);
 const body=await r.text();
 assert.equal(body.includes('SECRET_DB_DETAIL'),false);
 assert.equal(r.headers.get('access-control-allow-origin'),null);
});
