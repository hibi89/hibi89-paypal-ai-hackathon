import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Execute the ACTUAL browser client, not a reimplementation of its renderer.
// Synthetic loopback session only; no PayPal / AI calls or real database.
const script=readFileSync(new URL('../web/contract_client.js',import.meta.url),'utf8');
function element(id=''){
  return {id,textContent:'',hidden:false,disabled:false,value:'',children:[],
    listeners:{},attrs:{},
    setAttribute(k,v){this.attrs[k]=v;},
    addEventListener(n,fn){this.listeners[n]=fn;},
    replaceChildren(...items){this.children=[...items];},
    append(...items){this.children.push(...items);},
    fire(n){return this.listeners[n]?.({preventDefault(){}});}
  };
}
test('actual contract browser client renders versioned audit by GET and escapes event details',async()=>{
  const nodes=new Map();
  const get=id=>{if(!nodes.has(id))nodes.set(id,element(id));return nodes.get(id);};
  const document={
    getElementById:get,
    createElement:()=>element()
  };
  const calls=[];
  const session={mode:'OFFLINE_MOCK',role:'owner',contractId:'demo-contract',
    quoteId:'q1',milestoneId:'m1',csrfToken:'synthetic-token'};
  const contract={id:'demo-contract',quoteVersion:2,amountMinor:1500,version:4,
    paymentState:'NOT_CAPTURED',
    milestones:[{id:'m1',state:'ACCEPTED',deliveryNote:'revised'}]};
  const malicious='<img src=x onerror=alert(1)>';
  const events=[
    {seq:1,eventType:'CREATED',actorId:'owner',contractVersion:1},
    {seq:2,eventType:'SUBMITTED',actorId:'owner',contractVersion:2},
    {seq:3,eventType:'REJECTED',actorId:'reviewer',contractVersion:3,
      detail:malicious,fromState:'SUBMITTED',toState:'REJECTED'},
    {seq:4,eventType:'ACCEPTED',actorId:'reviewer',contractVersion:4}
  ];
  const fetch=async (path,opts={})=>{
    calls.push({path,method:opts.method||'GET'});
    const data=path==='/demo/session'?session:
      path==='/api/contracts/demo-contract'?{contract}:
      path==='/api/contracts/demo-contract/events'?{events}:null;
    return {status:data?200:404,ok:Boolean(data),
      async json(){return data||{error:'NOT_FOUND'};}};
  };
  runInNewContext(script,{document,fetch,crypto:{randomUUID:()=> 'synthetic-event'}});
  for(let i=0;i<20;i++)await Promise.resolve();
  const rendered=get('contract-events').children.map(item=>item.textContent);
  assert.equal(rendered.length,4,'all events should appear in order');
  assert.match(rendered[0],/CREATED/);
  assert.match(rendered[2],/REJECTED.*SUBMITTED.*REJECTED/);
  assert.ok(rendered[2].includes(malicious),'untrusted detail must be literal text, not DOM HTML');
  assert.match(rendered[3],/ACCEPTED/);
  assert.equal(get('contract-payment').textContent,'NOT_CAPTURED');
  assert.equal(get('contract-fulfillment').textContent,'ACCEPTED');
  assert.deepEqual(calls.map(x=>x.method),['GET','GET','GET']);
  assert.equal(calls[2].path,'/api/contracts/demo-contract/events');
});
