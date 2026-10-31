// Offline Proofline Part 2: checked server state, no payment/LLM transport.
// Build DOM with textContent only; no untrusted HTML, storage or automatic POST.
'use strict';
const el=id=>document.getElementById(id);
const model={csrf:null,consents:{services:null,gifts:null},selected:null,
  server:null,busy:false,revoking:false};
const show=(id,value)=>{el(id).textContent=typeof value==='string'?value:JSON.stringify(value,null,2);};
const key=()=>crypto.randomUUID();
const money=n=>Number.isSafeInteger(n)?'$'+(n/100).toFixed(2):'UNKNOWN';
const explanation=code=>({
  DELEGATION_ALREADY_SPENT:'One-use mandate consumed. Issue a fresh mandate; no PayPal payment occurred.',
  DELEGATION_ALREADY_CLAIMED:'This mandate already has an A2A attempt. Never rerun it automatically.',
  DELEGATION_REVOKED:'This mandate was revoked. Issue a fresh mandate.',
  DELEGATION_EXPIRED:'This mandate expired. Issue a fresh mandate.',
  A2A_PENDING_OR_UNKNOWN:'Attempt is pending or interrupted. Inspect the audit and revoke if still eligible; NEVER auto-retry.',
  REPLAY_CONFLICT:'A request key was reused for different parameters. The operation was blocked.'
})[code]||'No state or payment change was assumed.';
async function api(route,body){
 const r=await fetch('/api/demo/innovation/'+route,{
  method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',
  headers:body?{'content-type':'application/json','x-csrf-token':model.csrf}:{},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 const data=await r.json();
 if(!r.ok){
  const e=new Error(data.error||'REQUEST_FAILED');
  e.code=data.error;
  throw e;
 }
 return data;
}
function mandateStatus(c){
 if(c.revoked)return 'REVOKED';
 if(c.usedMinor>0)return 'ACCEPTED_OFFLINE / USED '+money(c.usedMinor);
 if(c.expiresAt<=Date.now())return 'EXPIRED';
 const pending=model.server?.pendingAttempts?.some(p=>p.consentId===c.id);
 return pending?'PENDING_OR_INTERRUPTED (NO AUTO-RETRY)':'ACTIVE / UNUSED';
}
function renderMandates(){
 const data=model.server;
 if(!data)return;
 const select=el('mandate-selector');
 const current=model.selected||select.value;
 const rows=data.consents;
 // Keep a deliberately selected revoked/spent row inspectable.
 const selected=rows.find(c=>c.id===current)||
  rows.find(c=>c.active)||rows[0]||null;
 model.selected=selected?.id||null;
 select.replaceChildren();
 if(!rows.length){
  const option=document.createElement('option');
  option.value='';option.textContent='No mandates';select.append(option);
 }else for(const c of rows){
  const option=document.createElement('option');
  option.value=c.id;
  option.textContent=c.category.toUpperCase()+' | '+money(c.maxMinor)+
   ' | '+mandateStatus(c)+' | '+c.id.slice(0,8);
  select.append(option);
 }
 select.value=model.selected||'';
 const revoked=el('revoke-mandate');
 revoked.disabled=!selected?.active||model.revoking||!model.csrf;
 if(selected){
  const pending=data.pendingAttempts.some(p=>p.consentId===selected.id);
  show('mandate-state',selected.category.toUpperCase()+' · '+money(selected.maxMinor)+
   ' · '+mandateStatus(selected)+'. '+
   (pending?'The attempt may be running or interrupted; revoke blocks late acceptance. ':
    'This mandate cannot authorize any PayPal charge. ')+
   (selected.active?'You can revoke this mandate before offline acceptance.':
    'For another transaction, configure a new mandate.'));
 }else show('mandate-state','No mandate exists. Configure a scoped mandate first.');
}
function renderTranscript(messages){
 const list=el('a2a-transcript');
 list.replaceChildren();
 for(const m of messages||[]){
  const li=document.createElement('li');
  li.textContent=(m.role==='buyer'?'BUYER AGENT':m.role==='seller'?'SELLER AGENT':'UNVERIFIED ACTOR')+
   ' · '+m.action+(Number.isSafeInteger(m.amountMinor)?' · '+money(m.amountMinor):'')+
   (m.reason?' · '+m.reason:'');
  list.append(li);
 }
}
// Read existing SQLite-backed event evidence only. No API call or replay.
function renderSavedA2AHistory(){
 const select=el('a2a-history'),saved=model.server?.events?.filter(e=>
  e.kind==='a2a'&&typeof e.result?.consentId==='string'&&
  Array.isArray(e.result.messages))||[];
 const previous=select.value;
 select.replaceChildren();
 if(!saved.length){
  const option=document.createElement('option');
  option.value='';option.textContent='No completed negotiation yet';
  select.append(option);
 }else for(const item of saved){
  const option=document.createElement('option');
  option.value=item.result.consentId;
  option.textContent=(item.result.status||'UNKNOWN')+' | '+
   (Number.isSafeInteger(item.result.agreedMinor)?money(item.result.agreedMinor):'NO AGREEMENT')+
   ' | '+item.result.consentId.slice(0,8);
  select.append(option);
 }
 if(saved.some(e=>e.result.consentId===previous))select.value=previous;
 el('show-a2a-history').disabled=!saved.length;
 show('a2a-history-status',saved.length
  ?saved.length+' stored negotiation(s) available. Select one and view its original messages without agent or payment calls.'
  :'No completed negotiations stored yet. Reads never call AI or PayPal.');
}
function openSavedA2AHistory(){
 const consentId=el('a2a-history').value;
 const entry=model.server?.events?.find(e=>e.kind==='a2a'&&
  e.result?.consentId===consentId&&Array.isArray(e.result.messages));
 if(!entry){
  show('a2a-history-status','Saved negotiation not available. Refresh the audit; no operation was repeated.');
  return;
 }
 renderTranscript(entry.result.messages);
 show('a2a-output',entry.result);
 show('a2a-progress','SAVED SQLITE HISTORY / READ ONLY · '+
  (entry.result.status||'UNKNOWN')+' · '+
  entry.result.messages.length+' recorded agent messages · paymentState '+
  (entry.result.paymentState||'NOT_PAID')+
  ' · no model execution or PayPal request.');
 show('a2a-history-status','Saved negotiation '+entry.result.consentId.slice(0,8)+
  ' restored from existing local ledger evidence. No network POST was sent.');
}
el('show-a2a-history').addEventListener('click',openSavedA2AHistory);
async function refresh(){
 const data=await api('state');
 model.server=data;
 show('activity',{
  mode:data.mode,paymentState:data.paymentState,providerCalls:data.providerCalls,
  delegations:data.consents.map(c=>({category:c.category,cap:money(c.maxMinor),
   state:mandateStatus(c),revision:c.revision,expiresAt:c.expiresAt,id:c.id})),
  pendingOrInterrupted:data.pendingAttempts,
  recentEvents:data.events.slice(0,10).map(e=>({
   kind:e.kind,status:e.result.status,reason:e.result.reason||null,
   transcriptSha256:e.result.transcriptSha256||null,createdAt:e.createdAt}))
 });
 for(const c of data.consents)
  if(c.active&&!model.consents[c.category])model.consents[c.category]=c.id;
 renderMandates();
 renderSavedA2AHistory();
 if(data.pendingAttempts.length)
  show('pending-status',data.pendingAttempts.length+
   ' PENDING_OR_INTERRUPTED attempt(s). Their live status is unverified. Do not resubmit; revoke an unused mandate to block late acceptance.');
 else show('pending-status','No pending A2A attempts in the local ledger. All reads are GET-only.');
}
async function run(name,fn){
 if(model.busy)return;
 model.busy=true;
 // Revoke and read-only audit stay available while A2A is in flight.
 for(const b of document.querySelectorAll('button:not(#revoke-mandate):not(#refresh)'))
  b.disabled=true;
 try{
  await fn();
  await refresh();
  show('message',name+' completed locally. No real payment or AI provider called.');
 }catch(e){
  show('message',name+' blocked: '+(e.code||e.message||'ERROR')+'. '+explanation(e.code));
  if(name==='A2A')show('a2a-progress','A2A request BLOCKED: '+(e.code||'ERROR')+'. No payment executed.');
  try{await refresh();}catch{}
 }finally{
  model.busy=false;
  for(const b of document.querySelectorAll('button:not(#revoke-mandate):not(#refresh)'))
   b.disabled=false;
  renderMandates();
 }
}
el('mandate-selector').addEventListener('change',()=>{
 model.selected=el('mandate-selector').value;
 renderMandates();
});
el('delegate').addEventListener('click',()=>run('Consent',async()=>{
 const category=el('category').value,maxMinor=Number(el('limit').value)*100,
  expiresInMinutes=Number(el('minutes').value);
 const data=await api('delegate',{category,maxMinor,expiresInMinutes,idempotencyKey:key()});
 model.consents[category]=data.consentId;
 model.selected=data.consentId;
 show('delegation-status',data);
}));
el('revoke-mandate').addEventListener('click',async()=>{
 if(model.revoking)return;
 const selected=model.server?.consents.find(c=>c.id===model.selected);
 if(!selected?.active||!model.csrf)return;
 model.revoking=true;
 el('revoke-mandate').disabled=true;
 show('mandate-state','Revocation submitted for this synthetic mandate…');
 try{
  const result=await api('revoke',{consentId:selected.id,idempotencyKey:key()});
  if(model.consents[selected.category]===selected.id)model.consents[selected.category]=null;
  await refresh();
  show('mandate-state',selected.category.toUpperCase()+' · '+result.status+
   ' · No PayPal payment was reversed or attempted. Issue a new mandate to continue.');
  show('message','Mandate revoked locally. Late A2A acceptance is blocked.');
 }catch(e){
  show('message','Revocation blocked: '+(e.code||e.message||'ERROR')+'. '+explanation(e.code));
  try{await refresh();}catch{}
 }finally{model.revoking=false;renderMandates();}
});
el('a2a').addEventListener('click',()=>run('A2A',async()=>{
 const consentId=model.consents.services;
 if(!consentId)throw Object.assign(new Error('CONFIGURE_SERVICES_MANDATE_FIRST'),{code:'CONFIGURE_SERVICES_MANDATE_FIRST'});
 show('a2a-progress','A2A preclaim requested. Negotiation may be pending; never submit the same mandate again.');
 renderTranscript([]);
 const result=await api('a2a',{consentId,idempotencyKey:key()});
 renderTranscript(result.messages);
 show('a2a-output',result);
 show('a2a-progress',result.status+' · '+result.messages.length+
  ' policy-driven agent messages · paymentState '+result.paymentState+
  ' · hash '+(result.transcriptSha256||'NONE')+
  '. Accepted offline only; PayPal checkout disabled.');
}));
el('gift').addEventListener('click',()=>run('Gift',async()=>{
 if(!model.consents.gifts)
  throw Object.assign(new Error('CONFIGURE_GIFTS_MANDATE_FIRST'),{code:'CONFIGURE_GIFTS_MANDATE_FIRST'});
 const raw=el('gift-max-price').value.trim();
 if(!/^\d{1,5}(\.\d{1,2})?$/.test(raw))
  throw Object.assign(new Error('INVALID_SYNTHETIC_GIFT_PREFERENCES'),{code:'INVALID_SYNTHETIC_GIFT_PREFERENCES'});
 const parts=raw.split('.');
 const maxPriceMinor=Number(parts[0])*100+Number((parts[1]||'').padEnd(2,'0'));
 show('gift-output',await api('gift',{
  consentId:model.consents.gifts,idempotencyKey:key(),
  category:el('gift-category').value,style:el('gift-style').value,
  priority:el('gift-priority').value,maxPriceMinor
 }));
}));
el('churn').addEventListener('click',()=>run('churn',async()=>{
 const raw=el('churn-monthly').value.trim();
 if(!/^\d{1,5}(\.\d{1,2})?$/.test(raw))
  throw Object.assign(new Error('INVALID_SYNTHETIC_CHURN'),{code:'INVALID_SYNTHETIC_CHURN'});
 const parts=raw.split('.');
 const currentMinor=Number(parts[0])*100+Number((parts[1]||'').padEnd(2,'0'));
 const result=await api('churn',{
  idempotencyKey:key(),subscriptionRef:el('churn-reference').value,
  currentMinor,remainingMonths:Number(el('churn-months').value),
  churnRisk:el('churn-risk').value,maxDiscountBps:Number(el('churn-cap').value),
  pauseAllowed:el('churn-pause').checked
 });
 show('churn-output',result);
}));
el('invoice').addEventListener('click',()=>run('invoice',async()=>{
 // Parse decimal USD to minor units without floating-point rounding.
 const raw=el('invoice-amount').value.trim();
 if(!/^\d{1,5}(\.\d{1,2})?$/.test(raw))
  throw Object.assign(new Error('INVALID_AMOUNT'),{code:'INVALID_SYNTHETIC_DOSSIER'});
 const dollars=raw.split('.');
 const amountMinor=Number(dollars[0])*100+Number((dollars[1]||'').padEnd(2,'0'));
 const list=[['contract_terms','invoice-evidence-contract'],
  ['delivery_record','invoice-evidence-delivery'],
  ['review_decision','invoice-evidence-review']];
 const evidenceKinds=list.filter(([,id])=>el(id).checked).map(([kind])=>kind);
 const result=await api('invoice',{
  idempotencyKey:key(),contractRef:el('invoice-contract').value,
  amountMinor,issueType:el('invoice-issue').value,
  deliveryStatus:el('invoice-delivery').value,evidenceKinds
 });
 show('invoice-output',result);
}));
el('refresh').addEventListener('click',async()=>{
 try{await refresh();show('message','Read-only audit completed locally. No duplicate A2A or payment POST.');}
 catch(e){show('message','Audit unavailable: '+(e.code||e.message||'ERROR'));}
});
(async()=>{
 try{
  const r=await fetch('/demo/session',{credentials:'same-origin',cache:'no-store'});
  if(!r.ok)throw new Error('LOCAL_BUYER_LOGIN_REQUIRED');
  const session=await r.json();
  if(session.role!=='owner')throw new Error('BUYER_ONLY');
  model.csrf=session.csrfToken;
  await refresh();
 }catch(e){show('message','Cannot access lab: '+(e.message||'UNAVAILABLE'));}
})();
