import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const client=readFileSync(new URL('../web/demo_client.js',import.meta.url),'utf8');

function mount({deferredApproval=false}={}){
  const ids=['quote-view','message','demo-main','draft-form','approve-form','reject-form','reject-reason','scope',
    'dollars','confirm','draft-submit','approve-submit','reject-submit','refresh','payment-status'];
  const elements=new Map(ids.map(id=>[id,{
    id,textContent:'',disabled:false,value:'',checked:false,attrs:{},listeners:{},
    setAttribute(k,v){this.attrs[k]=v;},
    addEventListener(type,fn){this.listeners[type]=fn;},
    fire(type){return this.listeners[type]?.({preventDefault(){}});},
  }]));
  elements.get('scope').value='Build an accessible synthetic portfolio landing page';
  elements.get('dollars').value='25.00';
  let q={id:'q1',version:1,status:'PROPOSED',scope:null,suggestionSource:null,
    aiSuggestedMinor:null,approval:null};
  let unblockApproval;
  const requests=[];
  const fetch=async(path,options={})=>{
    const method=options.method||'GET';
    requests.push({path,method,options});
    const answer=(status,data)=>({ok:status>=200&&status<300,status,
      async json(){return data;}});
    if(path==='/demo/session')return answer(200,{
      mode:'OFFLINE_MOCK',quoteId:'q1',csrfToken:'mocktoken'});
    if(path==='/api/quotes/q1'&&method==='GET')return answer(200,{quote:{...q}});
    if(path==='/api/quotes/q1/payment'&&method==='GET')
      return answer(503,{error:'PERSISTENT_PAYMENT_LEDGER_NOT_READY'});
    if(path==='/api/quotes/q1/draft'&&method==='POST'){
      const body=JSON.parse(options.body);
      if(body.expectedVersion!==q.version)return answer(409,{error:'STALE_QUOTE_VERSION'});
      q={...q,version:q.version+1,status:'PROPOSED',scope:body.scope,
        suggestionSource:'OFFLINE_MOCK',aiSuggestedMinor:5500,approval:null,rejection:null};
      return answer(200,{quote:{...q},warning:'Not a live AI model'});
    }
    if(path==='/api/quotes/q1/approve'&&method==='POST'){
      if(deferredApproval)await new Promise(resolve=>{unblockApproval=resolve;});
      const body=JSON.parse(options.body);
      if(body.expectedVersion!==q.version || q.status!=='PROPOSED')
        return answer(409,{error:'STALE_QUOTE_VERSION'});
      q={...q,status:'APPROVED',approval:{amountMinor:body.amountMinor}};
      return answer(200,{quote:{...q}});
    }
    if(path==='/api/quotes/q1/reject'&&method==='POST'){
      const body=JSON.parse(options.body);
      if(body.expectedVersion!==q.version||q.status!=='PROPOSED'||q.rejection)
        return answer(409,{error:'QUOTE_NOT_REJECTABLE'});
      q={...q,rejection:{decision:'REJECTED',reason:body.reason,quoteVersion:q.version}};
      return answer(200,{quote:{...q}});
    }
    throw Error('UNEXPECTED_REQUEST '+method+' '+path);
  };
  const context={document:{getElementById:id=>elements.get(id)},fetch,
    Error,Number,String};
  runInNewContext(client,context,{filename:'web/demo_client.js'});
  // VM async bootstrap crosses contexts; yield an event-loop tick rather than
  // assuming N Promise microtasks are enough in Node 22 GitHub Actions.
  const ready=async()=>{for(let i=0;i<3;i++)await new Promise(setImmediate);};
  const el=id=>elements.get(id);
  return {el,requests,ready,quote:()=>q,release:()=>{if(unblockApproval)unblockApproval();}};
}
test('bootstrap only GETs and controls initially become enabled',async()=>{
  const dom=mount();await dom.ready();
  assert.equal(dom.el('demo-main').attrs['aria-busy'],'false');
  assert.equal(dom.el('approve-submit').disabled,false);
  assert.equal(dom.requests.some(x=>x.method==='POST'),false);
  assert.match(dom.el('message').textContent,/No AI or PayPal/);
});
test('click refresh repeatedly has zero POST side effects',async()=>{
  const dom=mount();await dom.ready();
  await dom.el('refresh').fire('click');
  await dom.el('refresh').fire('click');
  assert.equal(dom.requests.filter(x=>x.method==='POST').length,0);
  assert.equal(dom.quote().version,1);
});
test('double-submit approve while promise pending sends one POST',async()=>{
  const dom=mount({deferredApproval:true});await dom.ready();
  dom.el('confirm').checked=true;
  dom.el('dollars').value='17.55';
  const first=dom.el('approve-form').fire('submit');
  assert.equal(dom.el('approve-submit').disabled,true);
  const second=dom.el('approve-form').fire('submit');
  await dom.ready();
  assert.equal(dom.requests.filter(x=>x.method==='POST').length,1);
  dom.release();await first;await second;
  assert.equal(dom.quote().approval.amountMinor,1755);
  assert.equal(dom.el('approve-submit').disabled,true); // already approved
  assert.equal(dom.el('demo-main').attrs['aria-busy'],'false');
});
test('draft after approval returns PROPOSED and requires new human confirmation',async()=>{
  const dom=mount();await dom.ready();
  dom.el('confirm').checked=true;
  await dom.el('approve-form').fire('submit');
  assert.equal(dom.quote().status,'APPROVED');
  await dom.el('draft-form').fire('submit');
  assert.equal(dom.quote().version,2);
  assert.equal(dom.quote().status,'PROPOSED');
  assert.equal(dom.el('approve-submit').disabled,false);
  assert.equal(dom.el('confirm').checked,false);
});
test('reject is a single human decision, visible after refresh, draft opens a new version',async()=>{
  const dom=mount();await dom.ready();
  dom.el('reject-reason').value='Scope needs clarification';
  await dom.el('reject-form').fire('submit');
  assert.match(dom.el('quote-view').textContent,/REJECTED/);
  assert.equal(dom.el('reject-submit').disabled,true);
  assert.equal(dom.quote().approval,null);
  await dom.el('draft-form').fire('submit');
  assert.equal(dom.quote().version,2);
  assert.equal(dom.quote().rejection,null);
  assert.equal(dom.el('reject-submit').disabled,false);
});
test('invalid price never causes a POST',async()=>{
  const dom=mount();await dom.ready();
  dom.el('confirm').checked=true;
  dom.el('dollars').value='1e7';
  await dom.el('approve-form').fire('submit');
  assert.equal(dom.requests.filter(x=>x.method==='POST').length,0);
  assert.match(dom.el('message').textContent,/INVALID_AMOUNT/);
});
test('payment status button sends only GET even on provider failure',async()=>{
  const dom=mount();await dom.ready();
  await dom.el('payment-status').fire('click');
  assert.equal(dom.requests.filter(x=>x.method==='POST').length,0);
  assert.match(dom.el('message').textContent,/No payment action executed/);
});

