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
      d.sandboxMerchantConnected!==false)throw Error('UNVERIFIED');
   status.textContent='Quote '+d.quoteId+' · version '+d.quoteVersion+
     ' · human-approved USD '+d.amount+
     ' → PayPal Orders v2 CREATE plan (NOT SENT). Real provider calls: 0. '+
     'Fictional merchant; no Sandbox buyer or Capture. '+
     'This reads your approved quote, unlike the separate fixed USD 1.50 fake API replay.';
  }catch{status.textContent='Read-only plan proof unavailable.';}
  finally{busy=false;button.disabled=false;}
 });
})();
