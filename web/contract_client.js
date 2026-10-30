// Local synthetic contract UI only. Browser never supplies owner/reviewer identity.
// No writes on page load, F5, refresh or server GET responses.
(() => {
  const el=id=>document.getElementById(id);
  const roleText=el('session-role'),payment=el('contract-payment'),
    fulfillment=el('contract-fulfillment'),display=el('contract-view'),
    info=el('contract-message'),createBtn=el('contract-create'),
    refreshBtn=el('contract-refresh'),deliveryForm=el('delivery-form'),
    deliveryNote=el('delivery-note'),reviewActions=el('review-actions'),
    reviewNote=el('review-note'),submitBtn=el('delivery-submit'),
    acceptBtn=el('review-accept'),rejectBtn=el('review-reject'),
    auditEvents=el('contract-events');
  const controls=[createBtn,refreshBtn,submitBtn,acceptBtn,rejectBtn];
  let ready=false,busy=false,session=null,contract=null;
  const show=text=>{info.textContent=text;};
  function render(){
    const reviewer=session?.role==='reviewer';
    roleText.textContent='Server-issued local synthetic role: '+(session?.role||'loading');
    payment.textContent=contract?.paymentState||'NOT_CAPTURED';
    const milestone=contract?.milestones?.[0];
    fulfillment.textContent=milestone?.state||'NO_CONTRACT';
    display.textContent=contract ?
      'Contract '+contract.id+' · Quote v'+contract.quoteVersion+
      ' · $'+(contract.amountMinor/100).toFixed(2)+' USD · Contract version '+contract.version+
      ' · Milestone '+(milestone?.state||'NONE')+
      (milestone?.deliveryNote?' · Evidence: '+milestone.deliveryNote:'') :
      'No contract yet. Approval and explicit contract creation are separate actions.';
    createBtn.hidden=reviewer || Boolean(contract);
    deliveryForm.hidden=reviewer || !milestone ||
      !['PENDING','REJECTED'].includes(milestone.state);
    reviewActions.hidden=!reviewer || milestone?.state!=='SUBMITTED';
    for(const control of controls)control.disabled=!ready||busy;
    createBtn.disabled=!ready||busy||Boolean(contract)||reviewer;
    el('contract-panel').setAttribute('aria-busy',String(busy));
  }
  async function api(path,method='GET',body){
    const opts={method,credentials:'same-origin',cache:'no-store'};
    if(method==='POST'){
      opts.headers={'content-type':'application/json','x-csrf-token':session.csrfToken};
      opts.body=JSON.stringify(body);
    }
    const response=await fetch(path,opts);
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'REQUEST_FAILED');
    return result;
  }
  function route(s){return '/api/contracts/'+s.contractId;}
  function renderAudit(events){
    // No innerHTML: actor, source and detail can originate from local demo inputs.
    auditEvents.replaceChildren();
    if(!events.length){
      const item=document.createElement('li');
      item.textContent='No contract events recorded.';
      auditEvents.append(item);
      return;
    }
    for(const event of events){
      const item=document.createElement('li');
      item.textContent='#'+event.seq+' · '+event.eventType+
        ' · '+event.actorId+' · v'+event.contractVersion+
        (event.fromState&&event.toState?' · '+event.fromState+' → '+event.toState:'')+
        (event.detail?' · '+event.detail:'');
      auditEvents.append(item);
    }
  }
  async function refresh(){
    const response=await fetch(route(session),{cache:'no-store',credentials:'same-origin'});
    if(response.status===404){contract=null;renderAudit([]);render();return;}
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'CONTRACT_READ_FAILED');
    const history=await api(route(session)+'/events'); // read-only GET
    if(!Array.isArray(history.events))throw new Error('AUDIT_EVENTS_UNAVAILABLE');
    contract=data.contract;
    renderAudit(history.events);
    render();
  }
  async function act(fn){
    if(!ready||busy)return;
    busy=true;render();
    try{await fn();}
    catch(e){show('Blocked: '+(e instanceof Error?e.message:'REQUEST_FAILED'));
      try{await refresh();}catch{/* display original error */}}
    finally{busy=false;render();}
  }
  const eventId=()=>crypto.randomUUID();
  refreshBtn.addEventListener('click',()=>act(async()=>{
    await refresh();show('Contract refreshed by GET only. No POST executed.');
  }));
  createBtn.addEventListener('click',()=>act(async()=>{
    const quote=(await api('/api/quotes/'+session.quoteId)).quote;
    if(quote.status!=='APPROVED'||!quote.approval)
      throw new Error('HUMAN_APPROVAL_REQUIRED');
    await api('/api/contracts','POST',{
      id:session.contractId,quoteId:session.quoteId,reviewerId:session.reviewerId,
      expectedVersion:quote.version,eventId:eventId(),
      milestones:[{id:session.milestoneId,step:1,amountMinor:quote.approval.amountMinor}]
    });
    await refresh();show('Contract created from approved quote. Payment NOT_CAPTURED.');
  }));
  deliveryForm.addEventListener('submit',e=>{
    e.preventDefault();return act(async()=>{
      const milestone=contract?.milestones?.[0];
      if(!milestone || !['PENDING','REJECTED'].includes(milestone.state))
        throw new Error('INVALID_DELIVERY_STATE');
      await api(route(session)+'/milestones/'+milestone.id+'/submit','POST',{
        expectedVersion:contract.version,expectedState:milestone.state,
        eventId:eventId(),detail:deliveryNote.value
      });
      await refresh();show('Delivery submitted for reviewer decision. Payment unchanged.');
    });
  });
  const review=(decision)=>act(async()=>{
    const milestone=contract?.milestones?.[0];
    if(!milestone || milestone.state!=='SUBMITTED')
      throw new Error('REVIEW_NOT_READY');
    const body={expectedVersion:contract.version,eventId:eventId()};
    if(decision==='reject')body.detail=reviewNote.value;
    await api(route(session)+'/milestones/'+milestone.id+'/'+decision,'POST',body);
    await refresh();show('Reviewer '+(decision==='accept'?'accepted':'rejected')+
      ' synthetic delivery. Payment NOT_CAPTURED.');
  });
  acceptBtn.addEventListener('click',()=>review('accept'));
  rejectBtn.addEventListener('click',()=>review('reject'));
  async function init(){
    try{
      const response=await fetch('/demo/session',{cache:'no-store',credentials:'same-origin'});
      if(!response.ok)throw new Error('DEMO_SESSION_NOT_AVAILABLE');
      session=await response.json();
      if(session.mode!=='OFFLINE_MOCK'||!['owner','reviewer'].includes(session.role)||
        !/^[A-Za-z0-9_-]{1,64}$/.test(session.contractId)||
        !/^[A-Za-z0-9_-]{1,64}$/.test(session.milestoneId))
        throw new Error('INVALID_DEMO_SESSION');
      await refresh();ready=true;
      show('Offline contract UI ready. GET only until explicit user action.');
    }catch(e){show('Cannot load contract UI: '+(e instanceof Error?e.message:'REQUEST_FAILED'));}
    render();
  }
  render();init();
})();
