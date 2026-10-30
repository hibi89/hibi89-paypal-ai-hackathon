import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createQuoteApi} from '../src/quote_api.mjs';
import {createContractApi} from '../src/contract_api.mjs';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';

const origin='https://app.example';
const createBody=()=>({id:'ct1',quoteId:'q1',reviewerId:'reviewer',
  expectedVersion:2,eventId:'create-contract',
  milestones:[{id:'ms1',step:1,amountMinor:1000},{id:'ms2',step:2,amountMinor:500}]});
const submit=()=>({expectedVersion:1,expectedState:'PENDING',
  eventId:'submission-1',detail:'Complete deliverable archive'});
const post=(path,body={},over={})=>new Request(origin+path,{
  method:'POST',headers:{'content-type':'application/json','x-csrf-token':'csrf',
    origin,...over},body:typeof body==='string'?body:JSON.stringify(body)
});
const get=path=>new Request(origin+path);
const body=async response=>response.json();
const contract='/api/contracts/ct1';
const milestone=contract+'/milestones/ms1/';
function fixture(fn) {
  return async()=>{
    const folder=mkdtempSync(join(tmpdir(),'paypal-http-contract-'));
    const ledger=createSqliteLedger({filename:join(folder,'database.sqlite')});
    let actor='owner',merchant='merchant',verified=true,csrf='csrf';
    try{
      await ledger.insertQuote({id:'q1',ownerId:'owner',merchantId:'merchant',version:2});
      await ledger.approve({id:'q1',expectedVersion:2,actorId:'owner',amountMinor:1500});
      const resolveSession=async()=>verified?{verified,actorId:actor,merchantId:merchant,
        csrfToken:csrf}:null;
      const api=createContractApi({repository:ledger,resolveSession});
      const quoteApi=createQuoteApi({repository:ledger,resolveSession});
      const identity={actor:x=>actor=x,merchant:x=>merchant=x,verified:x=>verified=x,csrf:x=>csrf=x};
      await fn({api,ledger,quoteApi,identity});
    } finally {ledger.close();rmSync(folder,{recursive:true,force:true});}
  };
}
test('requires real trusted session resolver and full repository surface',()=>{
  assert.throws(()=>createContractApi({}),TypeError);
  assert.throws(()=>createContractApi({repository:{},resolveSession:async()=>({})}),TypeError);
});
test('create and GET snapshots, HEAD/GET cannot write; no payment attempt created',fixture(async({api,ledger})=>{
  const created=await api(post('/api/contracts',createBody()));
  assert.equal(created.status,201);
  assert.equal((await body(created)).contract.amountMinor,1500);
  for(let i=0;i<5;i++){
    const one=await api(get(contract)),two=await api(get(contract+'/events'));
    assert.equal(one.status,200);assert.equal(two.status,200);
    assert.equal((await body(two)).events.length,1);
  }
  const version=(await body(await api(get(contract)))).contract.version;
  assert.equal(version,1);
  assert.equal((await ledger.listAttempts('q1')).length,0);
  const wrongMethod=await api(get('/api/contracts'));
  assert.equal(wrongMethod.status,405);
  assert.equal(wrongMethod.headers.get('allow'),'POST');
}));
test('server-verified owner can submit, reviewer can accept; payment remains untouched',fixture(async({api,ledger,identity})=>{
  await api(post('/api/contracts',createBody()));
  let resp=await api(post(milestone+'submit',submit()));
  assert.equal(resp.status,200);
  identity.actor('reviewer');
  resp=await api(post(milestone+'accept',{expectedVersion:2,eventId:'accepted-1'}));
  assert.equal(resp.status,200);
  const c=(await body(resp)).contract;
  assert.equal(c.milestones[0].state,'ACCEPTED');
  assert.equal(c.milestones[1].state,'PENDING');
  assert.equal(c.paymentState,'NOT_CAPTURED');
  const events=await body(await api(get(contract+'/events')));
  assert.deepEqual(events.events.map(x=>x.eventType),['CREATED','SUBMITTED','ACCEPTED']);
  assert.equal((await ledger.listAttempts('q1')).length,0);
}));
test('reviewer can reject and owner resubmit with new version',fixture(async({api,identity})=>{
  await api(post('/api/contracts',createBody()));
  await api(post(milestone+'submit',submit()));
  identity.actor('reviewer');
  assert.equal((await api(post(milestone+'reject',
    {expectedVersion:2,eventId:'reject-1',detail:'Missing source files'}))).status,200);
  identity.actor('owner');
  const again=await api(post(milestone+'submit',{expectedVersion:3,expectedState:'REJECTED',
    eventId:'submit-2',detail:'Added all source files'}));
  assert.equal(again.status,200);
  assert.equal((await body(again)).contract.milestones[0].state,'SUBMITTED');
}));
test('no session, missing csrf and cross-site origin are rejected without writes',fixture(async({api,ledger,identity})=>{
  identity.verified(false);
  assert.equal((await api(get(contract))).status,401);
  assert.equal((await api(post('/api/contracts',createBody()))).status,401);
  identity.verified(true);
  assert.equal((await api(post('/api/contracts',createBody(),{'x-csrf-token':'wrong'}))).status,403);
  assert.equal((await api(post('/api/contracts',createBody(),{origin:'https://evil.example'}))).status,403);
  identity.csrf('');
  assert.equal((await api(post('/api/contracts',createBody()))).status,403);
  identity.csrf('csrf');
  assert.equal((await ledger.listContractEvents({contractId:'ct1',
    actorId:'owner',merchantId:'merchant'}).catch(e=>e.code)),'CONTRACT_NOT_FOUND');
}));
test('spoofed body actor, merchant, owner and role are invalid and ignored',fixture(async({api,identity})=>{
  for(const injected of [{actorId:'owner'},{merchantId:'merchant'},{ownerId:'owner'},
    {role:'admin'}]){
    identity.actor('intruder');
    assert.equal((await api(post('/api/contracts',{...createBody(),...injected}))).status,400);
  }
  identity.actor('intruder');
  assert.equal((await api(post('/api/contracts',createBody()))).status,404);
  identity.actor('reviewer');
  // Reviewer cannot also be the contract owner; rejected before quote lookup.
  assert.equal((await api(post('/api/contracts',createBody()))).status,400);
  identity.actor('owner');
  assert.equal((await api(post('/api/contracts',createBody()))).status,201);
  identity.actor('reviewer');
  assert.equal((await api(post(milestone+'submit',submit()))).status,403);
}));
test('merchant boundary and foreign identity give 404 on read and mutate',fixture(async({api,identity})=>{
  await api(post('/api/contracts',createBody()));
  identity.actor('stranger');
  assert.equal((await api(get(contract))).status,404);
  assert.equal((await api(get(contract+'/events'))).status,404);
  identity.actor('reviewer');identity.merchant('another-merchant');
  assert.equal((await api(get(contract))).status,404);
  assert.equal((await api(post(milestone+'accept',
    {expectedVersion:1,eventId:'faked'}))).status,404);
}));
test('version CAS, replay and illegal transition cannot append second event',fixture(async({api,ledger})=>{
  await api(post('/api/contracts',createBody()));
  assert.equal((await api(post('/api/contracts',createBody()))).status,409);
  const one=await api(post(milestone+'submit',submit()));
  assert.equal(one.status,200);
  assert.equal((await api(post(milestone+'submit',submit()))).status,409);
  assert.equal((await api(post(milestone+'accept',
    {expectedVersion:2,eventId:'owner-tries-review'}))).status,403);
  assert.equal((await api(post(milestone+'submit',
    {...submit(),expectedVersion:2,eventId:'bad-second',expectedState:'PENDING'}))).status,409);
  const events=await ledger.listContractEvents({contractId:'ct1',actorId:'owner',merchantId:'merchant'});
  assert.equal(events.length,2);
}));
test('bad version, body type, huge payload, query parameters and malformed route fail closed',fixture(async({api})=>{
  assert.equal((await api(post('/api/contracts',{...createBody(),expectedVersion:1}))).status,409);
  assert.equal((await api(post('/api/contracts',createBody(),{'content-type':'text/plain'}))).status,415);
  assert.equal((await api(post('/api/contracts','oops'))).status,400);
  assert.equal((await api(post('/api/contracts','[]'))).status,400);
  assert.equal((await api(post('/api/contracts',{...createBody(),extra:'X'.repeat(5500)}))).status,413);
  assert.equal((await api(get('/api/contracts/ct1/milestones/ms1/accept'))).status,405);
  assert.equal((await api(get('/api/contracts/ct1/garbage'))).status,404);
}));
test('real loopback HTTP can create contract, submit, read events but cannot capture payment',async()=>{
  const app=await startOfflineDemo();
  try{
    const session=await (await fetch(app.url+'/demo/session')).json();
    const route=app.url+'/api/quotes/'+session.quoteId;
    let result=await fetch(route+'/approve',{method:'POST',headers:{
      'content-type':'application/json','x-csrf-token':session.csrfToken},
      body:JSON.stringify({confirmed:true,expectedVersion:1,amountMinor:1500})});
    assert.equal(result.status,200);
    result=await fetch(app.url+'/api/contracts',{method:'POST',headers:{
      'content-type':'application/json','x-csrf-token':session.csrfToken},
      body:JSON.stringify({...createBody(),quoteId:session.quoteId,expectedVersion:1,
        reviewerId:'synthetic-reviewer'})});
    assert.equal(result.status,201);
    result=await fetch(app.url+milestone+'submit',{method:'POST',headers:{
      'content-type':'application/json','x-csrf-token':session.csrfToken},
      body:JSON.stringify(submit())});
    assert.equal(result.status,200);
    result=await fetch(app.url+contract+'/events');
    assert.equal(result.status,200);
    assert.equal((await result.json()).events.length,2);
    result=await fetch(route+'/orders',{method:'POST',headers:{
      'content-type':'application/json','x-csrf-token':session.csrfToken},body:'{}'});
    assert.equal(result.status,503);
  }finally{await app.close();}
});
test('offline demo reviewer switch is explicit, same-origin and server-cookie bound',async()=>{
  const locked=await startOfflineDemo();
  try{
    const localSession=await (await fetch(locked.url+'/demo/session')).json();
    assert.equal(localSession.syntheticReviewerEnabled,false);
    const denied=await fetch(locked.url+'/demo/synthetic-role',{method:'POST',headers:{
      'content-type':'application/json','x-csrf-token':localSession.csrfToken,
      origin:new URL(locked.url).origin}});
    assert.equal(denied.status,404);
    assert.equal(denied.headers.get('set-cookie'),null);
  }finally{await locked.close();}
  const app=await startOfflineDemo({enableSyntheticReviewer:true});
  try{
    const origin=new URL(app.url).origin;
    const session=await (await fetch(app.url+'/demo/session')).json();
    assert.equal(session.role,'owner');
    assert.equal(session.syntheticReviewerEnabled,true);
    const endpoint=app.url+'/demo/synthetic-role';
    const headers={'content-type':'application/json','x-csrf-token':session.csrfToken};
    let response=await fetch(endpoint,{method:'POST',headers:{...headers,origin:'https://attacker.example'}});
    assert.equal(response.status,403);
    assert.equal(response.headers.get('set-cookie'),null);
    response=await fetch(endpoint,{method:'POST',headers:{...headers,origin}});
    assert.equal(response.status,200);
    assert.equal((await response.json()).role,'reviewer');
    const reviewerCookie=response.headers.get('set-cookie').split(';',1)[0];
    assert.match(reviewerCookie,/^paypal_test_review=[a-f0-9]{64}$/);
    const reviewerSession=await (await fetch(app.url+'/demo/session',{
      headers:{cookie:reviewerCookie}})).json();
    assert.equal(reviewerSession.role,'reviewer');
    response=await fetch(endpoint,{method:'POST',headers:{...headers,origin,
      cookie:reviewerCookie, 'content-length':'16'},body:'{"role":"owner"}'});
    assert.equal(response.status,403);
    assert.equal((await (await fetch(app.url+'/demo/session',{
      headers:{cookie:reviewerCookie}})).json()).role,'reviewer');
    response=await fetch(endpoint,{method:'POST',headers:{...headers,origin,
      cookie:reviewerCookie}});
    assert.equal(response.status,200);
    assert.equal((await response.json()).role,'owner');
    assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
    assert.equal((await (await fetch(app.url+'/demo/session')).json()).role,'owner');
  }finally{await app.close();}
});
