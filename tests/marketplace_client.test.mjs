import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const client=readFileSync(new URL('../web/marketplace_client.js',import.meta.url),'utf8');

function mount({reviewer=false,matchNone=false}={}){
  const elements=new Map();
  function element(id=''){
    const e={id,type:'',textContent:'',value:'',disabled:false,children:[],listeners:{},
      append(...children){this.children.push(...children)},
      replaceChildren(...children){this.children=[...children]},
      addEventListener(name,fn){this.listeners[name]=fn},
      fire(name){return this.listeners[name]?.({preventDefault(){}})}
    };
    if(id)elements.set(id,e);
    return e;
  }
  for(const id of ['marketplace-form','marketplace-brief','marketplace-submit',
    'marketplace-results','marketplace-selection-status','scope'])element(id);
  elements.get('marketplace-brief').value='Build ecommerce website with PayPal checkout';
  elements.get('scope').value='Previous untouched scope';
  const requests=[];
  const fetch=async(path,opts={})=>{
    requests.push({path,method:opts.method||'GET'});
    const result=value=>({ok:true,async json(){return value}});
    if(path==='/demo/session')return result({
      mode:'OFFLINE_MOCK',role:reviewer?'reviewer':'owner',csrfToken:'test'
    });
    if(path==='/api/demo/marketplace')return result(matchNone?{
      requestedSkills:[],profiles:[{id:'synthetic-web',displayName:'Demo Web Specialist',
        eligible:false,matchedSkills:[],missingSkills:[]}],
    }:{
      requestedSkills:['web','payments'],profiles:[
        {id:'synthetic-web',displayName:'Demo Web Specialist',eligible:true,
          matchedSkills:['web','payments'],missingSkills:[]},
        {id:'synthetic-data',displayName:'Demo Data Analyst',eligible:false,
          matchedSkills:[],missingSkills:['web','payments']}
      ]
    });
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
  return {elements,requests,choose,fire:()=>elements.get('marketplace-form').fire('submit')};
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
