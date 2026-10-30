// D12: synthetic-only subscription scenario UI; no PayPal orders, APIs,
// provider GET, webhook signature or real subscription activation.
// Reload/F5 and state refresh are GET-only, mutation requires deliberate click.
(() => {
  const el=id=>document.getElementById(id);
  const panel=el('subscription-panel'),state=el('subscription-state'),
    payment=el('subscription-payment'),details=el('subscription-details'),
    message=el('subscription-message');
  const buttons={start:el('subscription-start'),fail:el('subscription-fail'),
    recover:el('subscription-recover'),cancel:el('subscription-cancel')};
  const refreshButton=el('subscription-refresh');
  let session=null,subscription=null,busy=false,ready=false;
  const allowed={
    start:['NOT_STARTED'],fail:['ACTIVE'],
    recover:['RECOVERY_REQUIRED'],cancel:['ACTIVE','RECOVERY_REQUIRED']
  };
  const notify=value=>{message.textContent=value};
  function render(){
    state.textContent=subscription?.state||'NOT_STARTED';
    payment.textContent=subscription?.paymentEvidence||'NOT_VERIFIED';
    const extra=subscription?.failureHint?' · Failure: '+subscription.failureHint:'';
    const recovery=subscription?.recoveryEvidence?
      ' · '+subscription.recoveryEvidence:'';
    details.textContent=subscription?
      'Version '+subscription.version+' · '+subscription.mode+extra+recovery:
      'Subscription scenario is not available.';
    const owner=ready&&session?.role==='owner';
    for(const [action,button] of Object.entries(buttons)){
      button.hidden=session?.role==='reviewer';
      button.disabled=!owner||busy||
        !allowed[action].includes(subscription?.state);
    }
    refreshButton.disabled=!ready||busy;
    panel.setAttribute('aria-busy',String(busy));
  }
  async function fetchState(){
    const reply=await fetch('/api/demo/subscription',{cache:'no-store',
      credentials:'same-origin'});
    const response=await reply.json();
    if(!reply.ok)throw new Error(response.error||'SUBSCRIPTION_READ_FAILED');
    subscription=response.subscription;
    if(subscription.mode!=='OFFLINE_SCENARIO_NO_PROVIDER')throw new Error('INVALID_SCENARIO_MODE');
    render();
  }
  async function act(action){
    if(!ready||busy||session?.role!=='owner'||
      !allowed[action]?.includes(subscription?.state))return;
    busy=true;render();
    try{
      const response=await fetch('/api/demo/subscription/actions/'+action,{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'content-type':'application/json','x-csrf-token':session.csrfToken},
        body:JSON.stringify({eventId:crypto.randomUUID(),
          expectedVersion:subscription.version})
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'SCENARIO_FAILED');
      subscription=result.subscription;
      notify(action==='recover'?
        'Synthetic provider GET fixture simulated; NO actual provider GET or payment verification.' :
        'Offline '+action+' scenario recorded. No PayPal network request.');
    }catch(e){notify('Blocked: '+(e instanceof Error?e.message:'SCENARIO_FAILED'));
      try{await fetchState()}catch{/* keep original error */}}
    finally{busy=false;render()}
  }
  for(const [action,button] of Object.entries(buttons)){
    button.addEventListener('click',()=>act(action));
  }
  refreshButton.addEventListener('click',async()=>{
    if(!ready||busy)return;
    busy=true;render();
    try{await fetchState();notify('GET-only synthetic state refresh; no POST.')}
    catch(e){notify('Blocked: '+e.message)}
    finally{busy=false;render()}
  });
  async function init(){
    try{
      const r=await fetch('/demo/session',{cache:'no-store',credentials:'same-origin'});
      if(!r.ok)throw new Error('DEMO_SESSION_NOT_AVAILABLE');
      session=await r.json();
      if(session.mode!=='OFFLINE_MOCK'||!['owner','reviewer'].includes(session.role)||
        typeof session.csrfToken!=='string'||!session.csrfToken)
        throw new Error('INVALID_DEMO_SESSION');
      await fetchState();
      ready=true;notify('Subscription OFFLINE scenario ready. No writes on page load.');
    }catch(e){notify('Cannot load subscription demo: '+e.message)}
    render();
  }
  render();init();
})();
