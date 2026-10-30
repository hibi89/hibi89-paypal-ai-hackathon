// On-click, GET-only projection from current human-approved SQLite quote.
// Real PayPal Orders planner, fictional merchant; NEVER a provider payment.
(()=>{
 const button=document.getElementById('quote-checkout-preview');
 const status=document.getElementById('quote-checkout-preview-result');
 let busy=false;
 button.addEventListener('click',async()=>{
  if(busy||button.disabled)return;
  busy=true;button.disabled=true;
  status.textContent='Checking approved local quote (GET only)…';
  try{
   const response=await fetch('/api/demo/quote-checkout-preview',{
    method:'GET',credentials:'same-origin',cache:'no-store'});
   const d=await response.json();
   if(!response.ok){
    status.textContent=response.status===409?'Approve quote and amount first.':
      'Local plan unavailable; no payment attempted.';
    return;
   }
   if(d.status!=='LOCAL_APPROVED_QUOTE_PAYPAL_PLAN_ONLY'||
      d.source!=='PERSISTED_SYNTHETIC_SQLITE_APPROVAL'||
      !/^[A-Za-z0-9_-]{1,64}$/.test(d.quoteId||'')||
      !Number.isSafeInteger(d.quoteVersion)||d.quoteVersion<1||
      !Number.isSafeInteger(d.amountMinor)||d.amountMinor<100||
      d.amountMinor>1000000||d.amount!==(d.amountMinor/100).toFixed(2)||
      d.currency!=='USD'||d.plannedMethod!=='POST_NOT_SENT'||
      d.plannedPath!=='/v2/checkout/orders'||
      d.executionAuthorized!==false||d.orderCreated!==false||
      d.capturePerformed!==false||d.externalProviderCalls!==0||
      d.sandboxMerchantConnected!==false||
      d.quoteBoundFakeFlow?.mode!=='PURE_DOMAIN_FAKE_PAYPAL_EVENTS_NO_HTTP'||
      d.quoteBoundFakeFlow?.quoteVersion!==d.quoteVersion||
      d.quoteBoundFakeFlow?.amountMinor!==d.amountMinor||
      d.quoteBoundFakeFlow?.providerCalls!==0||
      d.quoteBoundFakeFlow?.paymentPosts!==0||
      d.quoteBoundFakeFlow?.ledgerMutations!==0||
      d.quoteBoundFakeFlow?.blockedPrematureCapture!==true||
      d.quoteBoundFakeFlow?.blockedMismatchedCapture!==true||
      d.quoteBoundFakeFlow?.fakeDomainReconcilePassed!==true||
      d.quoteBoundFakeFlow?.paymentWasReal!==false)throw Error('UNVERIFIED');
   status.textContent='Quote '+d.quoteId+' · version '+d.quoteVersion+
     ' · human-approved USD '+d.amount+
     ' → PayPal Orders v2 CREATE plan (NOT SENT). Real provider calls: 0. '+
     'Fictional merchant; no Sandbox buyer or Capture. '+
     'This same approved amount also passed 9 in-memory fake PayPal domain stages: '+
     'buyer approval gate, Capture plan and GET reconciliation; 0 real transactions. '+
     'The separate fixed USD 1.50 fake Gemini API replay remains an independent test.';
  }catch{status.textContent='Read-only plan proof unavailable.';}
  finally{busy=false;button.disabled=false;}
 });
})();

// Reviewer verification remains TWO different proof classes, not linked
// payments. GET actual approved SQLite quote -> pure Orders v2 plan;
// POST owner-approved injected FAKE USD1.50 adapter; GET quote again.
// No external HTTP, real order, Capture, or user-private receipt.
(()=>{
 const btn=document.getElementById('verify-local-bridge');
 const out=document.getElementById('verify-local-bridge-result');
 let busy=false;
 async function checkedPlan(){
   const response=await fetch('/api/demo/quote-checkout-preview',{
     method:'GET',credentials:'same-origin',cache:'no-store'});
   if(!response.ok)throw Error('APPROVAL_REQUIRED');
   const value=await response.json();
   if(value.status!=='LOCAL_APPROVED_QUOTE_PAYPAL_PLAN_ONLY'||
      value.source!=='PERSISTED_SYNTHETIC_SQLITE_APPROVAL'||
      !Number.isSafeInteger(value.quoteVersion)||value.quoteVersion<1||
      !Number.isSafeInteger(value.amountMinor)||value.amountMinor<100||
      value.amount!==(value.amountMinor/100).toFixed(2)||
      value.plannedMethod!=='POST_NOT_SENT'||
      value.plannedPath!=='/v2/checkout/orders'||
      value.orderCreated!==false||value.capturePerformed!==false||
      value.executionAuthorized!==false||value.externalProviderCalls!==0)
     throw Error('UNVERIFIED_PLAN');
   return value;
 }
 btn.addEventListener('click',async()=>{
   if(busy||btn.disabled)return;
   busy=true;btn.disabled=true;
   out.textContent='Verifying current approved quote + separate fake API flow…';
   try{
     const before=await checkedPlan();
     const resp=await fetch('/demo/session',{
       method:'GET',credentials:'same-origin',cache:'no-store'});
     if(!resp.ok)throw Error('SESSION_NOT_VERIFIED');
     const session=await resp.json();
     if(session.mode!=='OFFLINE_MOCK'||session.role!=='owner'||
       !/^[A-Za-z0-9_-]{20,96}$/.test(session.csrfToken||''))
       throw Error('OWNER_SESSION_REQUIRED');
     const replay=await fetch('/api/demo/provider-protocol',{
       method:'POST',credentials:'same-origin',cache:'no-store',
       headers:{'content-type':'application/json','x-csrf-token':session.csrfToken},
       body:'{}'});
     if(!replay.ok)throw Error('FAKE_REPLAY_FAILED');
     const proof=await replay.json();
     const steps=['FAKE_GEMINI_GENERATE_POST','FAKE_ORDER_CREATE_POST',
       'FAKE_ORDER_GET_APPROVED','FAKE_ORDER_CAPTURE_POST',
       'FAKE_ORDER_GET_COMPLETED'];
     if(proof.status!=='SYNTHETIC_API_PROTOCOL_REPLAY_ONLY'||
       proof.syntheticAmount!=='USD 1.50 · human approved in fixture'||
       proof.realProviderCalls!==0||proof.realPaymentCaptured!==false||
       proof.externalRequestsAllowed!==false||proof.fakeCreatePosts!==1||
       proof.fakeCapturePosts!==1||proof.fakeGetReconciliation!==true||
       !Array.isArray(proof.approvals)||proof.approvals.length!==5||
       !Array.isArray(proof.stages))throw Error('UNVERIFIED_FAKE_PROVIDER');
     let prev=-1;
     for(const step of steps){
       const at=proof.stages.indexOf(step);
       if(at<=prev)throw Error('INVALID_FAKE_STAGE_ORDER');
       prev=at;
     }
     const after=await checkedPlan();
     if(before.quoteId!==after.quoteId||
       before.quoteVersion!==after.quoteVersion||
       before.amountMinor!==after.amountMinor||
       before.quoteBoundFakeFlow?.mode!=='PURE_DOMAIN_FAKE_PAYPAL_EVENTS_NO_HTTP'||
       after.quoteBoundFakeFlow?.amountMinor!==after.amountMinor||
       after.quoteBoundFakeFlow?.steps?.length!==9||
       after.quoteBoundFakeFlow?.blockedPrematureCapture!==true||
       after.quoteBoundFakeFlow?.blockedMismatchedCapture!==true||
       after.quoteBoundFakeFlow?.fakeDomainReconcilePassed!==true||
       after.quoteBoundFakeFlow?.providerCalls!==0||
       after.quoteBoundFakeFlow?.paymentPosts!==0)
       throw Error('QUOTE_CHANGED_DURING_REPLAY');
     out.textContent='LOCAL PROOF PASS — Current approved quote v'+after.quoteVersion+
       ' / USD '+after.amount+
       ' → Orders and Capture pure planning + 9 in-memory FAKE payment gates (NONE SENT). Separately, a fixed USD 1.50 '+
       'Gemini/PayPal injection fixture completed 7 ordered stages and 5 simulated '+
       'human approvals. These are NOT one transaction. Real provider calls: 0; '+
       'real Capture: 0.';
   }catch{
     out.textContent='LOCAL PROOF INCOMPLETE — no real provider call or payment. '+
       'Check quote approval and fake replay budget.';
   }finally{busy=false;btn.disabled=false;}
 });
})();
