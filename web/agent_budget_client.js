// Offline synthetic demo. All payments remain disabled.
const form=document.getElementById('agent-negotiation-form');
const output=document.getElementById('agent-negotiation-result');
const budgetForm=document.getElementById('agent-budget-form');
const budgetOutput=document.getElementById('agent-budget-result');
const reserveButton=document.getElementById('agent-budget-reserve');
const historyButton=document.getElementById('agent-budget-history-refresh');
const historyOutput=document.getElementById('agent-budget-history');
let proposal=null,proposalVersion=null,busy=false;
async function request(path,method='GET',body){
 const sr=await fetch('/demo/session',{credentials:'same-origin',cache:'no-store'});
 if(!sr.ok)throw Error('SESSION_UNAVAILABLE');
 const session=await sr.json();
 if(session.role!=='owner')throw Error('OWNER_ONLY');
 const options={method,credentials:'same-origin',cache:'no-store'};
 if(method==='POST'){
  options.headers={'content-type':'application/json','x-csrf-token':session.csrfToken};
  options.body=JSON.stringify(body);
 }
 const res=await fetch(path,options);
 const data=await res.json();
 if(!res.ok)throw Error(data.error||data.reason||'REQUEST_FAILED');
 return {session,data};
}
function cents(value){
 const s=String(value).trim();
 if(!/^\d{1,5}(?:\.\d{1,2})?$/.test(s))throw Error('INVALID_USD');
 const [a,b='']=s.split('.');
 return Number(a)*100+Number(b.padEnd(2,'0'));
}
async function currentQuote(){
 const {session}=await request('/api/demo/budget/status');
 const res=await fetch('/api/quotes/'+session.quoteId,{credentials:'same-origin',cache:'no-store'});
 if(!res.ok)throw Error('QUOTE_UNAVAILABLE');
 return {session,quote:(await res.json()).quote};
}
async function showBudget(prefix){
 const {data}=await request('/api/demo/budget/status');
 budgetOutput.textContent=prefix+' Limit: $'+(data.limitMinor/100).toFixed(2)+' · Reserved: $'+(data.reservedMinor/100).toFixed(2)+' · Remaining: $'+((data.limitMinor-data.reservedMinor)/100).toFixed(2)+' · PayPal: DISABLED';
}
form?.addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;busy=true;proposal=null;
 if(reserveButton)reserveButton.disabled=true;
 try{
  const {session,quote}=await currentQuote();
  const {data}=await request('/api/demo/negotiate','POST',{quoteId:session.quoteId,expectedVersion:quote.version,buyerMaxMinor:cents(form.elements.buyerMax.value),sellerMinMinor:cents(form.elements.sellerMin.value),openingMinor:cents(form.elements.opening.value)});
  proposal=data;proposalVersion=quote.version;
  output.textContent=data.status==='PROPOSED'?'OFFLINE proposal: $'+(data.agreedMinor/100).toFixed(2)+' · Approve the exact amount separately.':'No agreement: '+(data.reason||'UNKNOWN');
  if(reserveButton)reserveButton.disabled=data.status!=='PROPOSED';
 }catch(error){output.textContent='Blocked: '+error.message}finally{busy=false}
});
budgetForm?.addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;busy=true;
 try{
  await request('/api/demo/budget/configure','POST',{limitMinor:cents(budgetForm.elements.limit.value),confirmBudget:true});
  await showBudget('Offline budget configured.');
 }catch(error){budgetOutput.textContent='Blocked: '+error.message}finally{busy=false}
});
reserveButton?.addEventListener('click',async()=>{
 if(busy||proposal?.status!=='PROPOSED')return;
 busy=true;reserveButton.disabled=true;
 try{
  const {session,quote}=await currentQuote();
  if(quote.version!==proposalVersion||quote.status!=='APPROVED'||quote.approval?.amountMinor!==proposal.agreedMinor)throw Error('APPROVE_EXACT_PROPOSAL_FIRST');
  await request('/api/demo/budget/reserve','POST',{quoteId:session.quoteId,expectedVersion:quote.version,negotiation:proposal,explicitApproval:true});
  await showBudget('SQLite budget reserved.');
  await showHistory();
 }catch(error){budgetOutput.textContent='Blocked: '+error.message}finally{busy=false;reserveButton.disabled=false}
});

async function showHistory(){
 const {data}=await request('/api/demo/budget/history');
 const rows=data.reservations||[];
 historyOutput.textContent=rows.length?rows.map(row=>row.quoteId+' · v'+row.quoteVersion+' · $'+(row.amountMinor/100).toFixed(2)+' · OFFLINE SQLITE').join('\n'):'No SQLite reservations.';
}
historyButton?.addEventListener('click',async()=>{
 if(busy)return;busy=true;historyButton.disabled=true;
 try{await showHistory()}catch(error){historyOutput.textContent='Blocked: '+error.message}
 finally{busy=false;historyButton.disabled=false}
});
