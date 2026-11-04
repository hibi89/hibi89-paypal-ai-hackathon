// D13 offline-only integration checker; never sends POST or triggers payment.
(() => {
  const el=id=>document.getElementById(id);
  const panel=el('integration-panel'),state=el('integration-state'),
    paypal=el('integration-paypal'),detail=el('integration-detail'),
    message=el('integration-message'),button=el('integration-refresh');
  let busy=false,ready=false,reviewer=false;
  async function refresh(){
    const reply=await fetch('/api/demo/integration',{cache:'no-store',credentials:'same-origin'});
    const result=await reply.json();
    if(!reply.ok)throw new Error(result.error||'INTEGRATION_UNAVAILABLE');
    if(result.mode!=='SYNTHETIC_LOOPBACK_ONLY'||result.realPayPal!=='NOT_TESTED'||
      result.realAI!=='NOT_TESTED'||result.publicDeployment!=='NOT_TESTED')
      throw new Error('UNSAFE_PROVIDER_READINESS');
    state.textContent=result.status;
    paypal.textContent=result.realPayPal;
    detail.textContent='Quote: '+result.quote+' · Contract: '+result.contract+
      ' · Cross-contract: '+result.dataContract+
      ' · Subscription: '+result.subscription+
      ' · Contract payment: '+result.contractPayment+
      ' · Subscription payment: '+result.subscriptionPayment+
      ' · Public deployment: '+result.publicDeployment;
  }
  function render(){button.disabled=busy||!ready||reviewer;panel.setAttribute('aria-busy',String(busy));}
  button.addEventListener('click',async()=>{
    if(!ready||busy||reviewer)return;
    busy=true;render();
    try{await refresh();message.textContent='GET-only local integration check complete.';}
    catch(e){message.textContent='Blocked: '+e.message;}
    finally{busy=false;render();}
  });
  async function init(){
    try {
      const r=await fetch('/demo/session',{cache:'no-store',credentials:'same-origin'});
      if(!r.ok)throw new Error('DEMO_SESSION_REQUIRED');
      const s=await r.json();
      reviewer=s.role==='reviewer';
      if(reviewer){
        panel.hidden=true;message.textContent='Owner-only local integration view.';
        return;
      }
      if(s.role!=='owner'||s.mode!=='OFFLINE_MOCK')
        throw new Error('UNTRUSTED_SYNTHETIC_SESSION');
      await refresh();
      ready=true;
      message.textContent='Read-only local integration check ready.';
    }catch(e){message.textContent='Cannot inspect local integration: '+e.message;}
    finally{render();}
  }
  render();init();
})();
