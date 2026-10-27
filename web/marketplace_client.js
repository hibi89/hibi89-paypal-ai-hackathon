// Local-only fictional marketplace fixture, not a Gemini or PayPal integration.
const marketplaceForm=document.getElementById('marketplace-form');
const marketplaceBrief=document.getElementById('marketplace-brief');
const marketplaceButton=document.getElementById('marketplace-submit');
const marketplaceOutput=document.getElementById('marketplace-results');
const marketplaceSelection=document.getElementById('marketplace-selection-status');
const quoteScopeInput=document.getElementById('scope');
let marketplaceBusy=false;
marketplaceForm.addEventListener('submit',async event=>{
  event.preventDefault();
  if(marketplaceBusy)return;
  marketplaceBusy=true;
  marketplaceButton.disabled=true;
  marketplaceOutput.textContent='Checking three fictional profiles…';
  marketplaceSelection.textContent='No candidate selected. No quote or payment modified.';
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
    // Candidate choice is local preparation only: no quote write/approval/PayPal POST.
    // Revalidation protects against a stale match after editing the project brief.
    const matchedBrief=marketplaceBrief.value;
    for(const profile of body.profiles){
      const p=document.createElement('p');
      p.textContent=profile.displayName+' ['+profile.id+'] · '+
        (profile.eligible?'eligible demo match':'not eligible for all requested skills')+
        ' · matched: '+(profile.matchedSkills.join(', ')||'none')+
        ' · missing: '+(profile.missingSkills.join(', ')||'none');
      if(profile.eligible && /^synthetic-[a-z]+$/.test(profile.id)){
        const choose=document.createElement('button');
        choose.type='button';
        choose.id='marketplace-choose-'+profile.id;
        choose.textContent='Prepare quote scope for '+profile.displayName;
        choose.addEventListener('click',()=>{
          if(marketplaceBrief.value!==matchedBrief){
            marketplaceSelection.textContent='Brief changed after matching. Match again before selecting.';
            return;
          }
          // Synthetic ID is explanatory text, NOT a PayPal merchant binding.
          const prepared=matchedBrief+' [Synthetic candidate: '+profile.id+']';
          if(prepared.length>500){
            marketplaceSelection.textContent='Brief too long to prepare quote. Shorten and match again.';
            return;
          }
          quoteScopeInput.value=prepared;
          marketplaceSelection.textContent='Scope prepared locally for '+profile.displayName+
            '. No quote submitted, candidate binding, human approval or payment. '+
            'Click Generate OFFLINE MOCK draft below, then approve its exact version separately.';
        });
        p.append(choose);
      }
      marketplaceOutput.append(p);
    }
    if(!body.profiles.some(p=>p.eligible))
      marketplaceSelection.textContent='No fully eligible synthetic candidate; clarify the skills and match again.';
  }catch(e){marketplaceOutput.textContent='Cannot match: '+(e?.message||'REQUEST_FAILED');
    marketplaceSelection.textContent='No candidate selected; quote and payment unchanged.';}
  finally{marketplaceBusy=false;marketplaceButton.disabled=false;}
});
