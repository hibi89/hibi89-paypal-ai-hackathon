// Judge-controlled, fake-only API replay. No POST on load or reload.
// This UI never knows private owner credentials, order IDs or provider tokens.
(() => {
 const button=document.getElementById('protocol-replay-button');
 const status=document.getElementById('protocol-replay-status');
 const list=document.getElementById('protocol-replay-list');
 const detail=document.getElementById('protocol-replay-detail');
 let csrf=null,busy=false;
 const titles={
   FAKE_GEMINI_GENERATE_POST:'Gemini skill classification · injected fixture',
   FAKE_PAYPAL_OAUTH_POST:'PayPal Sandbox OAuth · simulated token',
   FAKE_ORDER_CREATE_POST:'Orders CREATE · fake approved USD 1.50 quote',
   FAKE_ORDER_GET_PAYER_ACTION_REQUIRED:'Order GET · buyer action pending',
   FAKE_ORDER_GET_APPROVED:'Order GET · simulated buyer approved',
   FAKE_ORDER_CAPTURE_POST:'Capture · fake request after approval',
   FAKE_ORDER_GET_COMPLETED:'Order GET · simulated completion only'
 };
 async function init(){
   try{
     const response=await fetch('/demo/session',{method:'GET',
       credentials:'same-origin',cache:'no-store'});
     if(!response.ok)throw Error('SYNTHETIC_SESSION_NOT_READY');
     const session=await response.json();
     if(session.mode!=='OFFLINE_MOCK' || session.role!=='owner' ||
       !/^[a-zA-Z0-9_-]{20,96}$/.test(session.csrfToken||'')){
       button.hidden=true;status.textContent='Only the fictional owner may run this local diagnostic.';
       return;
     }
     csrf=session.csrfToken;
     button.disabled=false;
   }catch{
     button.disabled=true;status.textContent='Local demo session unavailable. No API replay performed.';
   }
 }
 button.addEventListener('click',async()=>{
   if(busy||button.disabled||!csrf)return;
   busy=true;button.disabled=true;list.hidden=true;list.replaceChildren();
   status.textContent='Running injected FAKE API contracts. No external providers contacted.';
   detail.textContent='';
   try{
     const response=await fetch('/api/demo/provider-protocol',{
       method:'POST',credentials:'same-origin',cache:'no-store',
       headers:{'content-type':'application/json','x-csrf-token':csrf},
       body:'{}'
     });
     const data=await response.json();
     if(!response.ok)throw Error(data?.error||'LOCAL_REPLAY_FAILED');
     if(data.status!=='SYNTHETIC_API_PROTOCOL_REPLAY_ONLY' ||
       data.realProviderCalls!==0 || data.realPaymentCaptured!==false ||
       data.externalRequestsAllowed!==false ||
       !Array.isArray(data.stages)||data.stages.length<7 ||
       data.stages.length>40||
       !data.stages.every(x=>Object.hasOwn(titles,x)) ||
       !Array.isArray(data.approvals)||data.approvals.length!==5)
       throw Error('SYNTHETIC_EVIDENCE_NOT_VERIFIED');
     for(const step of data.stages){
       const item=document.createElement('li');
       item.textContent=titles[step];
       list.appendChild(item);
     }
     list.hidden=false;
     status.textContent='Local injected-API sequence verified · 0 real provider calls · 0 real captures.';
     detail.textContent='Human consent checkpoints: '+data.approvals.length+
       ' (simulated). Fake create: '+data.fakeCreatePosts+
       ', fake capture: '+data.fakeCapturePosts+
       '. Not an independently verified Sandbox receipt or live Gemini run.';
   }catch(error){
     // Do not echo provider responses, user text or secrets.
     status.textContent='Fake-only diagnostic unavailable: '+
       (error instanceof Error&&/^SYNTHETIC_[A-Z_]+$/.test(error.message)?
         error.message:'LOCAL_REPLAY_FAILED');
   }finally{busy=false;button.disabled=false;}
 });
 init();
})();
