// Browser-only offline demo. Synthetic local session, no production identity.
const view=document.getElementById('quote-view');
const message=document.getElementById('message');
let csrfToken=null, quoteId=null, current=null;
async function api(path,method='GET',data) {
  const options={method,credentials:'same-origin',headers:{}};
  if(method==='POST') {
    options.headers={'content-type':'application/json','x-csrf-token':csrfToken};
    options.body=JSON.stringify(data);
  }
  const result=await fetch(path,options);
  const value=await result.json();
  if(!result.ok) throw new Error(value.error || 'REQUEST_FAILED');
  return value;
}
function show(text){message.textContent=text;}
async function refresh() {
  const value=await api('/api/quotes/'+quoteId);
  current=value.quote;
  view.textContent='Version '+current.version+' · '+current.status+
    ' · Proposal: '+(current.scope || 'Not generated')+
    ' · Estimate: '+(current.aiSuggestedMinor==null?'None':'$'+(current.aiSuggestedMinor/100).toFixed(2))+
    ' · Source: '+(current.suggestionSource || 'NONE')+
    ' · Approved: '+(current.approval?'$'+(current.approval.amountMinor/100).toFixed(2):'Not approved');
  if (current.aiSuggestedMinor!=null && !current.approval)
    document.getElementById('dollars').value=(current.aiSuggestedMinor/100).toFixed(2);
}
function attach(formId,action) {
  document.getElementById(formId).addEventListener('submit',async e=>{
    e.preventDefault();
    try{await action();await refresh();}
    catch(error){show('Blocked: '+error.message);}
  });
}
async function init(){
  try {
    const session=await api('/demo/session');
    csrfToken=session.csrfToken;
    quoteId=session.quoteId;
    await refresh();
    show('Offline demo ready. No AI or PayPal external calls.');
  }catch(error){show('Cannot load local demo: '+error.message);}
}
document.getElementById('refresh').addEventListener('click',async()=>{
  try {await refresh();show('Quote read-only GET complete.');}
  catch(error){show(error.message);}
});
attach('draft-form',async()=>{
  const result=await api('/api/quotes/'+quoteId+'/draft','POST',{
    expectedVersion:current.version,
    scope:document.getElementById('scope').value,
  });
  show(result.warning+' Quote version '+result.quote.version+'.');
});
attach('approve-form',async()=>{
  const dollars=Number(document.getElementById('dollars').value);
  const cents=Math.round(dollars*100);
  if(!Number.isFinite(dollars)||!Number.isSafeInteger(cents)||
     Math.abs(cents/100-dollars)>1e-8) throw new Error('INVALID_AMOUNT');
  if(!document.getElementById('confirm').checked)
    throw new Error('EXPLICIT_CONFIRMATION_REQUIRED');
  await api('/api/quotes/'+quoteId+'/approve','POST',{
    expectedVersion:current.version, confirmed:true, amountMinor:cents,
  });
  document.getElementById('confirm').checked=false;
  show('Human approval saved for version '+current.version+'. Payment remains disabled.');
});
document.getElementById('payment-status').addEventListener('click',async()=>{
  try {await api('/api/quotes/'+quoteId+'/payment');}
  catch(error){show('Payment safety: '+error.message+'. No payment action executed.');}
});
init();
