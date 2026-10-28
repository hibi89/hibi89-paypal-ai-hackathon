// LOCAL-ONLY synthetic quote demo. NOT a production auth or PayPal client.
// Every visible POST is a deliberate user action. Reload/F5 only makes GET calls.
const view=document.getElementById('quote-view');
const message=document.getElementById('message');
const root=document.getElementById('demo-main');
const draftForm=document.getElementById('draft-form');
const approveForm=document.getElementById('approve-form');
const rejectForm=document.getElementById('reject-form');
const rejectReason=document.getElementById('reject-reason');
const scope=document.getElementById('scope');
const dollars=document.getElementById('dollars');
const confirmBox=document.getElementById('confirm');
const draftButton=document.getElementById('draft-submit');
const approveButton=document.getElementById('approve-submit');
const rejectButton=document.getElementById('reject-submit');
const refreshButton=document.getElementById('refresh');
const paymentButton=document.getElementById('payment-status');
const controls=[draftButton,approveButton,rejectButton,refreshButton,paymentButton];
let csrfToken=null,quoteId=null,current=null,initialized=false,busy=false,reviewerMode=false;
function updateControls(){
  for(const element of controls) element.disabled=!initialized||busy||reviewerMode;
  // An already-approved amount cannot be approved again; draft revision is allowed.
  approveButton.disabled=!initialized||busy||reviewerMode||current?.status!=='PROPOSED';
  rejectButton.disabled=!initialized||busy||reviewerMode||current?.status!=='PROPOSED'||!!current?.rejection;
  root.setAttribute('aria-busy',String(busy));
}
function show(text){message.textContent=text;}
async function api(path,method='GET',data) {
  const options={method,credentials:'same-origin',cache:'no-store'};
  if(method==='POST'){
    options.headers={'content-type':'application/json','x-csrf-token':csrfToken};
    options.body=JSON.stringify(data);
  }
  const result=await fetch(path,options);
  let value;
  try {value=await result.json();}
  catch {throw new Error('INVALID_SERVER_RESPONSE');}
  if(!result.ok)throw new Error(value.error||'REQUEST_FAILED');
  return value;
}
async function refresh(){
  if(!quoteId)throw new Error('SESSION_NOT_READY');
  const value=await api('/api/quotes/'+quoteId);
  current=value.quote;
  const decisionStatus=current.rejection?'REJECTED':current.status;
  view.textContent='Version '+current.version+' · '+decisionStatus+
    ' · Proposal: '+(current.scope||'Not generated')+
    ' · Estimate: '+(current.aiSuggestedMinor==null?'None':'$'+(current.aiSuggestedMinor/100).toFixed(2))+
    ' · Source: '+(current.suggestionSource||'NONE')+
    ' · Approved: '+(current.approval?'$'+(current.approval.amountMinor/100).toFixed(2):'Not approved');
  if(current.rejection)view.textContent+=' · Rejected by '+current.rejection.actorId+
    ': '+current.rejection.reason;
  if(current.aiSuggestedMinor!=null&&!current.approval)
    dollars.value=(current.aiSuggestedMinor/100).toFixed(2);
  updateControls();
}
async function runOnce(action){
  // Synchronous guard: even two clicks during the same event loop submit at most one POST.
  if(busy||!initialized)return;
  busy=true;
  updateControls();
  try {await action();}
  catch(error){
    // Do not echo raw server stack traces or secrets.
    show('Blocked: '+(error instanceof Error?error.message:'REQUEST_FAILED'));
    try {await refresh();}catch {/* Preserve original rejection. */}
  }finally{
    busy=false;
    updateControls();
  }
}
async function init(){
  busy=true;
  updateControls();
  try{
    const session=await api('/demo/session');
    if(session.mode!=='OFFLINE_MOCK'||typeof session.csrfToken!=='string'||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(session.quoteId))
      throw new Error('INVALID_DEMO_SESSION');
    csrfToken=session.csrfToken;
    quoteId=session.quoteId;
    reviewerMode=session.role==='reviewer';
    if(reviewerMode){
      for(const id of ['marketplace-panel','quote-panel','draft-panel','approval-panel','payment-panel'])
        document.getElementById(id).hidden=true;
    }else await refresh();
    initialized=true;
    show('Offline demo ready. No AI or PayPal external calls.');
  }catch(error){show('Cannot load local demo: '+(error instanceof Error?error.message:'REQUEST_FAILED'));}
  finally{busy=false;updateControls();}
}
function centsFromUsd(value){
  const raw=value.trim();
  if(!/^\d{1,5}(?:\.\d{1,2})?$/.test(raw))throw new Error('INVALID_AMOUNT');
  const [whole,fraction='']=raw.split('.');
  const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(cents)||cents<100||cents>1000000)
    throw new Error('INVALID_AMOUNT');
  return cents;
}
refreshButton.addEventListener('click',()=>runOnce(async()=>{
  await refresh();
  show('Read-only GET completed. No draft or payment POST.');
}));
draftForm.addEventListener('submit',event=>{
  event.preventDefault();
  return runOnce(async()=>{
    const result=await api('/api/quotes/'+quoteId+'/draft','POST',{
      expectedVersion:current.version,
      scope:scope.value,
    });
    await refresh();
    confirmBox.checked=false;
    show(result.warning+' Quote version '+result.quote.version+'.');
  });
});
rejectForm.addEventListener('submit',event=>{
  event.preventDefault();
  return runOnce(async()=>{
    const reason=rejectReason.value.trim();
    if(reason.length<3||reason.length>500)throw new Error('INVALID_REJECTION_REASON');
    const version=current.version;
    await api('/api/quotes/'+quoteId+'/reject','POST',{expectedVersion:version,reason});
    await refresh();
    show('Quote version '+version+' rejected. Revise the proposal to create a new version.');
  });
});
approveForm.addEventListener('submit',event=>{
  event.preventDefault();
  return runOnce(async()=>{
    if(!confirmBox.checked)throw new Error('EXPLICIT_CONFIRMATION_REQUIRED');
    const amountMinor=centsFromUsd(dollars.value);
    const previousVersion=current.version;
    await api('/api/quotes/'+quoteId+'/approve','POST',{
      expectedVersion:previousVersion,confirmed:true,amountMinor,
    });
    await refresh();
    confirmBox.checked=false;
    show('Human approval saved for version '+previousVersion+'. Payment remains disabled.');
  });
});
paymentButton.addEventListener('click',()=>runOnce(async()=>{
  try{await api('/api/quotes/'+quoteId+'/payment');show('No payments configured.');}
  catch(error){show('Payment safety: '+error.message+'. No payment action executed.');}
}));
updateControls();
init();

