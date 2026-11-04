import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const client=readFileSync(new URL('../web/marketplace_client.js',import.meta.url),'utf8');

function mount({reviewer=false,matchNone=false}={}){
  const elements=new Map();
  function element(id=''){
    const e={id,type:'',textContent:'',value:'',disabled:false,children:[],listeners:{},attributes:{},
      setAttribute(key,value){this.attributes[key]=String(value)},
      append(...children){this.children.push(...children)},
      replaceChildren(...children){this.children=[...children]},
      addEventListener(name,fn){this.listeners[name]=fn},
      fire(name){return this.listeners[name]?.({preventDefault(){}})}
    };
    if(id)elements.set(id,e);
    return e;
  }
  for(const id of ['marketplace-form','marketplace-brief','marketplace-submit',
    'marketplace-results','marketplace-selection-status','marketplace-vertical','scope'])element(id);
  elements.get('marketplace-brief').value='Build ecommerce website with PayPal checkout';
  elements.get('marketplace-vertical').value='ai_work';
  elements.get('scope').value='Previous untouched scope';
  const requests=[];
  const quote={id:'q1',version:1,status:'PROPOSED',scope:null};
  let bound=null;
  const fetch=async(path,opts={})=>{
    requests.push({path,method:opts.method||'GET',body:opts.body});
    const result=(value,status=200)=>({ok:status>=200&&status<300,status,
      async json(){return value}});
    if(path==='/demo/session')return result({
      mode:'OFFLINE_MOCK',role:reviewer?'reviewer':'owner',csrfToken:'test',quoteId:'q1'
    });
    if(path==='/api/quotes/q1' && !opts.method)return result({quote:{...quote}});
    if(path==='/api/demo/marketplace/selection'&&opts.method==='POST'){
      const body=JSON.parse(opts.body);
      if(quote.scope==null)return result({error:'QUOTE_SCOPE_CANDIDATE_MISMATCH'},409);
      bound={profileId:body.profileId,quoteVersion:body.expectedQuoteVersion,status:'BOUND'};
      return result({...bound,paymentAuthorized:false,approvalAuthorized:false},201);
    }
    if(path==='/api/demo/marketplace/selection?quoteId=q1')return result({...bound});
    // The actual API includes an opaque session and previous-set history.
    const state=body=>({...body,sessionId:'fixture-session',round:1,
      maxRounds:3,remainingRefreshes:2,
      history:[{round:1,profiles:body.profiles}]});
    if(path==='/api/demo/marketplace' && JSON.parse(opts.body).vertical==='general_services')return result(state({
      vertical:'general_services',requestedSkills:['design','branding'],profiles:[
        {id:'synthetic-creative',displayName:'Demo Creative Designer',eligible:true,
          matchedSkills:['design','branding'],missingSkills:[],skills:['design','branding']},
        {id:'synthetic-marketer',displayName:'Demo Marketing Specialist',eligible:false,
          matchedSkills:[],missingSkills:['design','branding'],skills:['marketing','writing']},
        {id:'synthetic-translator',displayName:'Demo Translation Writer',eligible:false,
          matchedSkills:[],missingSkills:['design','branding'],skills:['translation','writing']}
      ]
    }));
    if(path==='/api/demo/marketplace')return result(state(matchNone?{
      requestedSkills:[],profiles:[{id:'synthetic-web',displayName:'Demo Web Specialist',
        eligible:false,matchedSkills:[],missingSkills:[]}],
    }:{
      requestedSkills:['web','payments'],profiles:[
        {id:'synthetic-web',displayName:'Demo Web Specialist',eligible:true,
          matchedSkills:['web','payments'],missingSkills:[]},
        {id:'synthetic-data',displayName:'Demo Data Analyst',eligible:false,
          matchedSkills:[],missingSkills:['web','payments']},
        {id:'synthetic-automation',displayName:'Demo Workflow Builder',eligible:false,
          matchedSkills:['web'],missingSkills:['payments']}
      ]
    }));
    throw Error('UNEXPECTED_PATH');
  };
  const doc={getElementById:id=>elements.get(id),createElement:()=>element()};
  runInNewContext(client,{document:doc,fetch,Error,String,Array});
  const choose=()=>{
    const find=el=>{
      if(el.id==='marketplace-choose-synthetic-web')return el;
      for(const child of el.children){const x=find(child);if(x)return x;}
      return null;
    };
    return find(elements.get('marketplace-results'));
  };
  const confirm=()=>{
    const find=el=>{
      if(el.id==='marketplace-confirm-synthetic-web')return el;
      for(const child of el.children){const x=find(child);if(x)return x;}
      return null;
    };
    return find(elements.get('marketplace-selection-status'));
  };
  return {elements,requests,choose,confirm,quote,bound:()=>bound,
    fire:()=>elements.get('marketplace-form').fire('submit')};
}

test('explicit match and separate candidate choice only prepare local quote scope',async()=>{
 const dom=mount();
 await dom.fire();
 assert.equal(dom.requests.filter(r=>r.method==='POST').length,1);
 const b=dom.choose();assert.ok(b);assert.equal(b.type,'button');
 assert.equal(dom.elements.get('scope').value,'Previous untouched scope');
 b.fire('click');
 assert.match(dom.elements.get('scope').value,/Synthetic candidate: synthetic-web/);
 assert.match(dom.elements.get('marketplace-selection-status').textContent,/No quote submitted/);
 assert.equal(dom.requests.filter(r=>r.method==='POST').length,1);
});
test('match result cannot prepare stale changed scope without another match',async()=>{
 const dom=mount();await dom.fire();
 dom.elements.get('marketplace-brief').value='Completely different request';
 dom.choose().fire('click');
 assert.equal(dom.elements.get('scope').value,'Previous untouched scope');
 assert.match(dom.elements.get('marketplace-selection-status').textContent,/Match again/);
});
test('unknown skill profile never gets a candidate select control',async()=>{
 const dom=mount({matchNone:true});await dom.fire();
 assert.equal(dom.choose(),null);
 assert.match(dom.elements.get('marketplace-selection-status').textContent,/No fully eligible/);
 assert.equal(dom.elements.get('scope').value,'Previous untouched scope');
});
test('reviewer cannot submit marketplace selection through local-only UI',async()=>{
 const dom=mount({reviewer:true});await dom.fire();
 assert.equal(dom.requests.filter(r=>r.method==='POST').length,0);
 assert.equal(dom.choose(),null);
 assert.match(dom.elements.get('marketplace-results').textContent,/OWNER_SESSION_REQUIRED/);
});
test('prepared quote never exceeds backend 500-char length bound',async()=>{
 const dom=mount();
 dom.elements.get('marketplace-brief').value='Web '.repeat(125);
 await dom.fire();
 dom.choose().fire('click');
 assert.equal(dom.elements.get('scope').value,'Previous untouched scope');
 assert.match(dom.elements.get('marketplace-selection-status').textContent,/too long/);
});

test('category switch uses the same API and returns distinct general-service specialist cards',async()=>{
 const dom=mount();
 const category=dom.elements.get('marketplace-vertical');
 category.value='general_services';
 category.fire('change');
 assert.match(dom.elements.get('marketplace-brief').value,/logo/);
 await dom.fire();
 const api=dom.requests.find(request=>request.path==='/api/demo/marketplace');
 assert.equal(JSON.parse(api.body).vertical,'general_services');
 const result=dom.elements.get('marketplace-results');
 const find=node=>{
   if(node.id==='marketplace-choose-synthetic-creative')return node;
   for(const child of node.children){const value=find(child);if(value)return value;}
   return null;
 };
 const button=find(result);
 assert.ok(button);
 button.fire('click');
 assert.match(dom.elements.get('scope').value,/Synthetic candidate: synthetic-creative/);
 assert.equal(dom.requests.filter(r=>r.method==='POST').length,1);
});

test('switching service category invalidates previously rendered candidate selection',async()=>{
 const dom=mount();
 await dom.fire();
 const stale=dom.choose();assert.ok(stale);
 const category=dom.elements.get('marketplace-vertical');
 category.value='general_services';
 category.fire('change');
 stale.fire('click');
 assert.equal(dom.elements.get('scope').value,'Previous untouched scope');
 assert.match(dom.elements.get('marketplace-selection-status').textContent,/Match again/);
});

test('explicit candidate confirmation requires drafted quote and persists verified server selection',async()=>{
  const dom=mount();await dom.fire();
  dom.choose().fire('click');
  const confirm=dom.confirm();assert.ok(confirm);
  await confirm.fire('click');
  assert.match(dom.elements.get('marketplace-selection-status').textContent,/GENERATE_MATCHING_DRAFT_FIRST/);
  assert.equal(dom.requests.filter(r=>r.method==='POST').length,1);
  dom.quote.version=2;dom.quote.scope=dom.elements.get('scope').value;
  await confirm.fire('click');
  assert.equal(dom.bound().profileId,'synthetic-web');
  assert.equal(dom.bound().quoteVersion,2);
  assert.match(dom.elements.get('marketplace-selection-status').textContent,/Saved on server/);
  assert.equal(dom.requests.filter(r=>r.method==='POST').length,2);
  assert.equal(dom.requests.filter(r=>r.path.includes('/selection?')).every(r=>r.method==='GET'),true);
});
