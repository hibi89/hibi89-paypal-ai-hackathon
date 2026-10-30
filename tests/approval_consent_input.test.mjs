import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../web/demo_client.js',import.meta.url),'utf8');

async function browserFixture(){
  const elements=new Map();
  let quoteVersion=1;
  let postCount=0;
  const element=id=>{
    if(!elements.has(id))elements.set(id,{
      value:'50.00',checked:false,hidden:true,disabled:false,textContent:'',
      listeners:new Map(),setAttribute(){},
      addEventListener(type,callback){this.listeners.set(type,callback);},
      emit(type,event={preventDefault(){}}){
        const callback=this.listeners.get(type);
        assert.equal(typeof callback,'function','listener must exist: '+id+'/'+type);
        return callback(event);
      }
    });
    return elements.get(id);
  };
  const fetch=async(url,options={})=>{
    if(options.method==='POST'){
      postCount++;
      throw new Error('UNEXPECTED_POST_FROM_CONSENT_REGRESSION');
    }
    if(url==='/demo/session')return {ok:true,json:async()=>({
      mode:'OFFLINE_MOCK',csrfToken:'test-csrf-token',
      quoteId:'sample-project',role:'owner',syntheticReviewerEnabled:false
    })};
    if(url==='/api/quotes/sample-project')return {ok:true,json:async()=>({quote:{
      id:'sample-project',version:quoteVersion,status:'PROPOSED',
      rejection:null,approval:null,scope:'Synthetic project',
      aiSuggestedMinor:null,suggestionSource:'OFFLINE_MOCK'
    }})};
    throw new Error('UNEXPECTED_FETCH '+url);
  };
  runInNewContext(source,{
    document:{getElementById:element},fetch,window:{location:{reload(){}}},
    console
  },{filename:'web/demo_client.js',timeout:3000});
  await new Promise(resolve=>setImmediate(resolve));
  return {element,setQuoteVersion:value=>{quoteVersion=value;},getPostCount:()=>postCount};
}

test('changing the approved amount clears earlier checkbox consent and blocks submit',async()=>{
  const ui=await browserFixture();
  const confirm=ui.element('confirm');
  const dollars=ui.element('dollars');
  confirm.checked=true;
  dollars.value='75.00';
  dollars.emit('input');
  assert.equal(confirm.checked,false);
  await ui.element('approve-form').emit('submit');
  assert.equal(ui.getPostCount(),0,'unconfirmed changed amount must not POST');
  assert.match(ui.element('message').textContent,/EXPLICIT_CONFIRMATION_REQUIRED/);
  confirm.checked=true;
  dollars.value='80.00';
  dollars.emit('change');
  assert.equal(confirm.checked,false);
});

test('refreshing a newly revised quote invalidates previously checked version consent',async()=>{
  const ui=await browserFixture();
  const confirm=ui.element('confirm');
  confirm.checked=true;
  ui.setQuoteVersion(2);
  await ui.element('refresh').emit('click');
  assert.equal(confirm.checked,false);
  assert.match(ui.element('quote-view').textContent,/Version 2/);
  assert.equal(ui.getPostCount(),0,'GET-based refresh cannot submit approval');
});
