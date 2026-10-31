// No dangerous HTML insertion or provider transport.
'use strict';
const el=id=>document.getElementById(id),state={csrf:null,consents:{services:null,gifts:null},busy:false};
const show=(id,data)=>{el(id).textContent=typeof data==='string'?data:JSON.stringify(data,null,2)};
const nonce=()=>crypto.randomUUID();
async function api(path,body){
 const r=await fetch('/api/demo/innovation/'+path,{
  method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',
  headers:body?{'content-type':'application/json','x-csrf-token':state.csrf}:{},
  ...(body?{body:JSON.stringify(body)}:{})});
 const data=await r.json();
 if(!r.ok)throw new Error(data.error||'REQUEST_FAILED');
 return data;
}
async function refresh(){
 const data=await api('state');
 show('activity',{skills:data.skills,providerCalls:data.providerCalls,
  paymentState:data.paymentState,mandates:data.consents,
  events:data.events.slice(0,10).map(x=>({kind:x.kind,status:x.result.status,createdAt:x.createdAt}))});
 for(const x of data.consents)if(x.active&&!state.consents[x.category])state.consents[x.category]=x.id;
}
async function run(name,fn){
 if(state.busy)return;state.busy=true;
 for(const b of document.querySelectorAll('button'))b.disabled=true;
 try{await fn();await refresh();show('message',name+' completed locally. No real payments or AI requests.');}
 catch(e){show('message',name+' blocked: '+(e?.message||'ERROR'));}
 finally{state.busy=false;for(const b of document.querySelectorAll('button'))b.disabled=false;}
}
el('delegate').onclick=()=>run('Consent',async()=>{
 const category=el('category').value,maxMinor=Number(el('limit').value)*100,
  expiresInMinutes=Number(el('minutes').value);
 const result=await api('delegate',{category,maxMinor,expiresInMinutes,idempotencyKey:nonce()});
 state.consents[category]=result.consentId;
 show('delegation-status',result);
});
for(const kind of ['a2a','gift'])el(kind).onclick=()=>run(kind,async()=>{
 const category=kind==='a2a'?'services':'gifts';
 if(!state.consents[category])throw new Error('CONFIGURE_'+category.toUpperCase()+'_MANDATE_FIRST');
 show(kind+'-output',await api(kind,{consentId:state.consents[category],idempotencyKey:nonce()}));
});
for(const kind of ['churn','invoice'])el(kind).onclick=()=>run(kind,async()=>{
 show(kind+'-output',await api(kind,{idempotencyKey:nonce()}));
});
el('refresh').onclick=()=>run('Read-only audit',async()=>{});
(async()=>{
 try{
  const r=await fetch('/demo/session',{credentials:'same-origin',cache:'no-store'});
  if(!r.ok)throw new Error('LOCAL_BUYER_LOGIN_REQUIRED');
  const session=await r.json();
  if(session.role!=='owner')throw new Error('BUYER_ONLY');
  state.csrf=session.csrfToken;await refresh();
 }catch(e){show('message','Cannot access lab: '+(e?.message||'UNAVAILABLE'));}
})();
