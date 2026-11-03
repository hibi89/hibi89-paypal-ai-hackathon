import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {createWorkerPrivateContractDashboard} from '../src/worker_private_contract_dashboard.mjs';

const O='https://proofline.browser-fixture.invalid';
function fixture(){
 const calls=[];
 const contracts={async fetch(request){
  calls.push({method:request.method,path:new URL(request.url).pathname,
   limit:new URL(request.url).searchParams.get('limit')});
  if(request.headers.get('cookie')!=='__Host-proofline_contract_role=VALID_FIXTURE')
   return new Response('{"error":"UNAUTHENTICATED_OR_ROLE_UNAVAILABLE"}',
    {status:401,headers:{'content-type':'application/json'}});
  return new Response(JSON.stringify({count:1,activeRole:'SELLER',contracts:[],
   paymentAuthorized:false,providerCalls:0}),{status:200,
   headers:{'content-type':'application/json'}});
 }};
 return {api:createWorkerPrivateContractDashboard({contracts,allowedOrigin:O}),calls};
}
function request(path,method='GET',extra={}){
 return new Request(O+path,{method,headers:{
  cookie:'__Host-proofline_contract_role=VALID_FIXTURE',
  'sec-fetch-site':'same-origin',...extra}});
}
test('signed role contract page renders with strict CSP and no external dependency',async()=>{
 const f=fixture();
 const res=await f.api.fetch(request('/__private/contracts/view'));
 assert.equal(res.status,200);
 assert.match(res.headers.get('content-type'),/^text\/html/);
 assert.equal(res.headers.get('cache-control'),'private, no-store, max-age=0');
 assert.match(res.headers.get('content-security-policy'),/connect-src 'self'/);
 assert.equal(res.headers.has('access-control-allow-origin'),false);
 const html=await res.text();
 for(const token of ['id="contracts"','id="contract-form"','id="buyer-panel"',
  '/__private/contracts/view.js','This does not','No payment']) assert.ok(html.includes(token),token);
 assert.deepEqual(f.calls,[{method:'GET',path:'/__private/contracts',limit:'1'}]);
});
test('client JavaScript parses and contains explicit POST role intents and safe text rendering',async()=>{
 const f=fixture();
 const css=await f.api.fetch(request('/__private/contracts/view.css'));
 const js=await f.api.fetch(request('/__private/contracts/view.js'));
 assert.equal(css.status,200);assert.match(css.headers.get('content-type'),/^text\/css/);
 assert.equal(js.status,200);assert.match(js.headers.get('content-type'),/^text\/javascript/);
 const src=await js.text();
 assert.doesNotThrow(()=>new Script(src,{filename:'contracts-view.js'}));
 for(const marker of ['contract-create','contract-submit','contract-accept',
  'crypto.randomUUID()','textContent','credentials:\'same-origin\''])
  assert.ok(src.includes(marker),marker);
 assert.equal(src.includes('innerHTML'),false);
 assert.equal(src.includes('localStorage'),false);
 assert.equal(src.includes('paypal.com'),false);
});
test('anonymous and unsafe navigations never receive private HTML/CSS/JS',async()=>{
 const f=fixture();
 for(const p of ['/__private/contracts/view','/__private/contracts/view.css',
  '/__private/contracts/view.js']){
  assert.equal((await f.api.fetch(request(p,'GET',{cookie:''}))).status,401);
  assert.equal((await f.api.fetch(request(p,'POST'))).status,405);
  assert.equal((await f.api.fetch(request(p,'GET',{'sec-fetch-site':'cross-site'}))).status,403);
  assert.equal((await f.api.fetch(request(p,'GET',{origin:'https://hostile.invalid'}))).status,403);
  assert.equal((await f.api.fetch(request(p+'?token=unsafe'))).status,404);
 }
 assert.equal((await f.api.fetch(request('/api/paypal/capture'))).status,404);
 assert.equal(f.calls.every(x=>x.method==='GET'&&x.limit==='1'),true);
});
