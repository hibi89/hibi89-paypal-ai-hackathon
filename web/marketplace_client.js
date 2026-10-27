// Local-only fictional marketplace fixture, not a Gemini or PayPal integration.
const marketplaceForm=document.getElementById('marketplace-form');
const marketplaceBrief=document.getElementById('marketplace-brief');
const marketplaceButton=document.getElementById('marketplace-submit');
const marketplaceOutput=document.getElementById('marketplace-results');
let marketplaceBusy=false;
marketplaceForm.addEventListener('submit',async event=>{
  event.preventDefault();
  if(marketplaceBusy)return;
  marketplaceBusy=true;
  marketplaceButton.disabled=true;
  marketplaceOutput.textContent='Checking three fictional profiles…';
  try {
    const sessionResponse=await fetch('/demo/session',{credentials:'same-origin',cache:'no-store'});
    if(!sessionResponse.ok)throw new Error('SESSION_NOT_READY');
    const session=await sessionResponse.json();
    if(session.mode!=='OFFLINE_MOCK'||session.role!=='owner')throw new Error('OWNER_SESSION_REQUIRED');
    const result=await fetch('/api/demo/marketplace',{
      method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{'content-type':'application/json','x-csrf-token':session.csrfToken},
      body:JSON.stringify({brief:marketplaceBrief.value}),
    });
    const body=await result.json();
    if(!result.ok)throw new Error(body.error||'MATCH_FAILED');
    // No innerHTML: even server-controlled strings are rendered as text.
    marketplaceOutput.replaceChildren();
    const summary=document.createElement('p');
    summary.textContent='OFFLINE SYNTHETIC — requested skills: '+
      (body.requestedSkills.join(', ')||'none identified; clarify request')+
      '. Reference price: DATA_INSUFFICIENT. PayPal: NOT_CONNECTED.';
    marketplaceOutput.append(summary);
    for(const profile of body.profiles){
      const p=document.createElement('p');
      p.textContent=profile.displayName+' ['+profile.id+'] · '+
        (profile.eligible?'eligible demo match':'not eligible for all requested skills')+
        ' · matched: '+(profile.matchedSkills.join(', ')||'none')+
        ' · missing: '+(profile.missingSkills.join(', ')||'none');
      marketplaceOutput.append(p);
    }
  }catch(e){marketplaceOutput.textContent='Cannot match: '+(e?.message||'REQUEST_FAILED');}
  finally{marketplaceBusy=false;marketplaceButton.disabled=false;}
});
