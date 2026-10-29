// Offline synthetic negotiation and budget controls. User actions only; no provider calls.
const form=document.getElementById('agent-negotiation-form');
const output=document.getElementById('agent-negotiation-result');
const budgetForm=document.getElementById('agent-budget-form');
const budgetOutput=document.getElementById('agent-budget-result');
const reserveButton=document.getElementById('agent-budget-reserve');
let proposal=null,proposalVersion=null,agentBusy=false;
async function agentRequest(path,method='GET',body){
 const sessionResponse=await fetch('/demo/session',{cache:'no-store',credentials:'same-origin'});
 if(!sessionResponse.ok)throw Error('SESSION_UNAVAILABLE');
 const session=await sessionResponse.json();
 if(session.role!=='owner')throw Error('OWNER_ONLY');
 const options={method,credentials:'same-origin',cache:'no-store'};
 if(method==='POST'){options.headers={'content-type':'application/json','x-csrf-token':session.csrfToken};options.body=JSON.stringify(body)}
 const response=await fetch(path,options);const data=await response.json();
 if(!response.ok)throw Error(data.error||data.reason||'REQUEST_FAILED');
 return {session,data};
}
function cents(v){const s=String(v).trim();if(!/^\d{1,5}(?:\.\d{1,2})?$/.test(s))throw Error('INVALID_USD');const [a,b='']=s.split('.');return Number(a)*100+Number(b.padEnd(2,'0'))}
async function quote(){const {session}=await agentRequest('/api/demo/budget/status');const r=await fetch('/api/quotes/'+session.quoteId,{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('QUOTE_UNAVAILABLE');return {session,quote:(await r.json()).quote}}
form?.addEventListener('submit',async e=>{
 e.preventDefault();if(agentBusy)return;agentBusy=true;proposal=null;reserveButton.disabled=true;
 try{
  const {session,quote:q}=await quote();
  const {data}=await agentRequest('/api/demo/negotiate','POST',{quoteId:session.quoteId,expectedVersion:q.version,buyerMaxMinor:cents(form.elements.buyerMax.value),sellerMinMinor:cents(form.elements.sellerMin.value),openingMinor:cents(form.elements.opening.value)});
  proposal=data;proposalVersion=q.version;
  output.textContent=data.status==='PROPOSED'?'OFFLINE POLICY proposal: $'+(data.agreedMinor/100).toFixed(2)+' · Human must approve exact quote amount separately.':'No agreement: '+(data.reason||'UNKNOWN');
  reserveButton.disabled=data.status!=='PROPOSED';
 }catch(err){output.textContent='Blocked: '+err.message}finally{agentBusy=false}
});
budgetForm?.addEventListener('submit',async e=>{
 e.preventDefault();if(agentBusy)return;agentBusy=true;
 try{const {data}=await agentRequest('/api/demo/budget/configure','POST',{limitMinor:cents(budgetForm.elements.limit.value),confirmBudget:true});budgetOutput.textContent=data.ok?'Offline budget configured. No payment authorized.':'Blocked: '+data.reason;
  if(data.ok){const state=(await agentRequest('/api/demo/budget/status')).data;budgetOutput.textContent+=' Limit: }
 catch(err){budgetOutput.textContent='Blocked: '+err.message}finally{agentBusy=false}
});
reserveButton?.addEventListener('click',async()=>{
 if(agentBusy||!proposal||proposal.status!=='PROPOSED')return;agentBusy=true;reserveButton.disabled=true;
 try{
  const {session,quote:q}=await quote();
  if(q.version!==proposalVersion||q.status!=='APPROVED'||q.approval?.amountMinor!==proposal.agreedMinor)throw Error('APPROVE_EXACT_PROPOSAL_FIRST');
  const {data}=await agentRequest('/api/demo/budget/reserve','POST',{quoteId:session.quoteId,expectedVersion:q.version,negotiation:proposal,explicitApproval:true});
  budgetOutput.textContent=data.ok?'SQLite budget reserved. Payment remains disabled.':'Blocked: '+data.reason;
  if(data.ok){const state=(await agentRequest('/api/demo/budget/status')).data;budgetOutput.textContent+=' Reserved: 
 }catch(err){budgetOutput.textContent='Blocked: '+err.message}finally{agentBusy=false;reserveButton.disabled=false}
});
+(state.limitMinor/100).toFixed(2)+' · Reserved: }
 catch(err){budgetOutput.textContent='Blocked: '+err.message}finally{agentBusy=false}
});
reserveButton?.addEventListener('click',async()=>{
 if(agentBusy||!proposal||proposal.status!=='PROPOSED')return;agentBusy=true;reserveButton.disabled=true;
 try{
  const {session,quote:q}=await quote();
  if(q.version!==proposalVersion||q.status!=='APPROVED'||q.approval?.amountMinor!==proposal.agreedMinor)throw Error('APPROVE_EXACT_PROPOSAL_FIRST');
  const {data}=await agentRequest('/api/demo/budget/reserve','POST',{quoteId:session.quoteId,expectedVersion:q.version,negotiation:proposal,explicitApproval:true});
  budgetOutput.textContent=data.ok?'SQLite budget reserved. Payment remains disabled.':'Blocked: '+data.reason;
 }catch(err){budgetOutput.textContent='Blocked: '+err.message}finally{agentBusy=false;reserveButton.disabled=false}
});
+(state.reservedMinor/100).toFixed(2)}}
 catch(err){budgetOutput.textContent='Blocked: '+err.message}finally{agentBusy=false}
});
reserveButton?.addEventListener('click',async()=>{
 if(agentBusy||!proposal||proposal.status!=='PROPOSED')return;agentBusy=true;reserveButton.disabled=true;
 try{
  const {session,quote:q}=await quote();
  if(q.version!==proposalVersion||q.status!=='APPROVED'||q.approval?.amountMinor!==proposal.agreedMinor)throw Error('APPROVE_EXACT_PROPOSAL_FIRST');
  const {data}=await agentRequest('/api/demo/budget/reserve','POST',{quoteId:session.quoteId,expectedVersion:q.version,negotiation:proposal,explicitApproval:true});
  budgetOutput.textContent=data.ok?'SQLite budget reserved. Payment remains disabled.':'Blocked: '+data.reason;
 }catch(err){budgetOutput.textContent='Blocked: '+err.message}finally{agentBusy=false;reserveButton.disabled=false}
});
+(state.reservedMinor/100).toFixed(2)+' · Remaining: 
 }catch(err){budgetOutput.textContent='Blocked: '+err.message}finally{agentBusy=false;reserveButton.disabled=false}
});
+(state.limitMinor/100).toFixed(2)+' · Reserved: }
 catch(err){budgetOutput.textContent='Blocked: '+err.message}finally{agentBusy=false}
});
reserveButton?.addEventListener('click',async()=>{
 if(agentBusy||!proposal||proposal.status!=='PROPOSED')return;agentBusy=true;reserveButton.disabled=true;
 try{
  const {session,quote:q}=await quote();
  if(q.version!==proposalVersion||q.status!=='APPROVED'||q.approval?.amountMinor!==proposal.agreedMinor)throw Error('APPROVE_EXACT_PROPOSAL_FIRST');
  const {data}=await agentRequest('/api/demo/budget/reserve','POST',{quoteId:session.quoteId,expectedVersion:q.version,negotiation:proposal,explicitApproval:true});
  budgetOutput.textContent=data.ok?'SQLite budget reserved. Payment remains disabled.':'Blocked: '+data.reason;
 }catch(err){budgetOutput.textContent='Blocked: '+err.message}finally{agentBusy=false;reserveButton.disabled=false}
});
+(state.reservedMinor/100).toFixed(2)}}
 catch(err){budgetOutput.textContent='Blocked: '+err.message}finally{agentBusy=false}
});
reserveButton?.addEventListener('click',async()=>{
 if(agentBusy||!proposal||proposal.status!=='PROPOSED')return;agentBusy=true;reserveButton.disabled=true;
 try{
  const {session,quote:q}=await quote();
  if(q.version!==proposalVersion||q.status!=='APPROVED'||q.approval?.amountMinor!==proposal.agreedMinor)throw Error('APPROVE_EXACT_PROPOSAL_FIRST');
  const {data}=await agentRequest('/api/demo/budget/reserve','POST',{quoteId:session.quoteId,expectedVersion:q.version,negotiation:proposal,explicitApproval:true});
  budgetOutput.textContent=data.ok?'SQLite budget reserved. Payment remains disabled.':'Blocked: '+data.reason;
 }catch(err){budgetOutput.textContent='Blocked: '+err.message}finally{agentBusy=false;reserveButton.disabled=false}
});
+((state.limitMinor-state.reservedMinor)/100).toFixed(2)}
 }catch(err){budgetOutput.textContent='Blocked: '+err.message}finally{agentBusy=false;reserveButton.disabled=false}
});
+(state.limitMinor/100).toFixed(2)+' · Reserved: }
 catch(err){budgetOutput.textContent='Blocked: '+err.message}finally{agentBusy=false}
});
reserveButton?.addEventListener('click',async()=>{
 if(agentBusy||!proposal||proposal.status!=='PROPOSED')return;agentBusy=true;reserveButton.disabled=true;
 try{
  const {session,quote:q}=await quote();
  if(q.version!==proposalVersion||q.status!=='APPROVED'||q.approval?.amountMinor!==proposal.agreedMinor)throw Error('APPROVE_EXACT_PROPOSAL_FIRST');
  const {data}=await agentRequest('/api/demo/budget/reserve','POST',{quoteId:session.quoteId,expectedVersion:q.version,negotiation:proposal,explicitApproval:true});
  budgetOutput.textContent=data.ok?'SQLite budget reserved. Payment remains disabled.':'Blocked: '+data.reason;
 }catch(err){budgetOutput.textContent='Blocked: '+err.message}finally{agentBusy=false;reserveButton.disabled=false}
});
+(state.reservedMinor/100).toFixed(2)}}
 catch(err){budgetOutput.textContent='Blocked: '+err.message}finally{agentBusy=false}
});
reserveButton?.addEventListener('click',async()=>{
 if(agentBusy||!proposal||proposal.status!=='PROPOSED')return;agentBusy=true;reserveButton.disabled=true;
 try{
  const {session,quote:q}=await quote();
  if(q.version!==proposalVersion||q.status!=='APPROVED'||q.approval?.amountMinor!==proposal.agreedMinor)throw Error('APPROVE_EXACT_PROPOSAL_FIRST');
  const {data}=await agentRequest('/api/demo/budget/reserve','POST',{quoteId:session.quoteId,expectedVersion:q.version,negotiation:proposal,explicitApproval:true});
  budgetOutput.textContent=data.ok?'SQLite budget reserved. Payment remains disabled.':'Blocked: '+data.reason;
 }catch(err){budgetOutput.textContent='Blocked: '+err.message}finally{agentBusy=false;reserveButton.disabled=false}
});
