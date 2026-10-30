// Local-only fictional marketplace fixture. No Gemini call, live seller or PayPal payment.
// The server selects the category and computes exact skill eligibility; no invented ratings.
const marketplaceForm=document.getElementById('marketplace-form');
const marketplaceBrief=document.getElementById('marketplace-brief');
const marketplaceVertical=document.getElementById('marketplace-vertical');
const marketplaceButton=document.getElementById('marketplace-submit');
const marketplaceOutput=document.getElementById('marketplace-results');
const marketplaceSelection=document.getElementById('marketplace-selection-status');
const quoteScopeInput=document.getElementById('scope');

let marketplaceBusy=false;
let matchEpoch=0;
let activeRecommendation=null;
function selectedCategory(){
  return marketplaceVertical?.value||'ai_work';
}
function invalidateMatch(message){
  ++matchEpoch;
  activeRecommendation=null;
  marketplaceOutput.textContent='Choose Explore matching specialists to compare fictional providers.';
  marketplaceSelection.textContent=message;
}
if(marketplaceVertical){
  marketplaceVertical.addEventListener('change',()=>{
    marketplaceBrief.value=selectedCategory()==='general_services'
      ? 'Design a new logo and brand identity for my small business'
      : 'Build an ecommerce website with PayPal checkout';
    invalidateMatch('Category changed: re-match before preparing a quote; no payment affected.');
  });
}
marketplaceBrief.addEventListener('input',()=>{
  invalidateMatch('Project changed: re-match before choosing a specialist. Existing quote unchanged.');
});
function make(tag,className,textContent){
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(textContent!==undefined)node.textContent=textContent;
  return node;
}
function createProfileCard(profile,requestedSkills,matchedBrief,matchedVertical){
  const eligible=profile.eligible===true;
  const card=make('article','profile-card'+(eligible?' eligible':''));
  const top=make('div','profile-top');
  const initials=profile.displayName.split(' ').filter(Boolean).slice(-2)
    .map(word=>word[0]||'').join('').toUpperCase();
  const avatar=make('span','profile-avatar',initials||'SP');
  avatar.setAttribute?.('aria-hidden','true');
  const identity=make('div','profile-identity');
  identity.append(make('div','profile-name',profile.displayName),
    make('div','profile-label','Fictional sample · no verified reviews'));
  const tierName={professional:'Professional',rising:'Rising Talent',
    newcomer:'Newcomer'}[profile.tier]||'Illustrative candidate';
  identity.append(make('span','profile-tier',tierName+' · demo archetype'));
  top.append(avatar,identity);
  card.append(top);

  const coverage=Array.isArray(requestedSkills)&&requestedSkills.length
    ? profile.matchedSkills.length+'/'+requestedSkills.length+' required skills'
    : 'Requirements need clarification';
  card.append(make('span','match-status',
    eligible?'eligible demo match · '+coverage:coverage+' · partial match'));
  card.append(make('p','profile-description',
    eligible?'All recognized required skills appear in this fictional profile.':
      'Some required skills are missing. Review gaps before choosing.'));
  const skills=make('div','skill-list');
  for(const skill of profile.skills||[]){
    const chip=make('span','skill-chip'+(profile.matchedSkills.includes(skill)?' is-match':''),skill);
    skills.append(chip);
  }
  card.append(skills);
  if(profile.missingSkills?.length){
    card.append(make('p','profile-gap','Missing: '+profile.missingSkills.join(', ')));
  }
  if(eligible && /^synthetic-[a-z]+$/.test(profile.id)){
    const choose=make('button','profile-action','Prepare quote with this sample →');
    choose.type='button';
    choose.id='marketplace-choose-'+profile.id;
    choose.addEventListener('click',()=>{
      if(marketplaceBrief.value!==matchedBrief || selectedCategory()!==matchedVertical){
        marketplaceSelection.textContent='Brief or category changed. Match again before selecting.';
        return;
      }
      // This is a local text preparation only, not a seller or PayPal merchant binding.
      const prepared=matchedBrief+' [Synthetic candidate: '+profile.id+']';
      if(prepared.length>500){
        marketplaceSelection.textContent='Brief too long to prepare quote. Shorten and match again.';
        return;
      }
      quoteScopeInput.value=prepared;
      marketplaceSelection.textContent='Scope prepared locally for '+profile.displayName+
        '. No quote submitted, candidate binding, human approval or payment. '+
        'Click Generate OFFLINE MOCK draft below, then approve its exact version separately.';
      document.getElementById('draft-panel')?.scrollIntoView?.({behavior:'smooth',block:'start'});
      quoteScopeInput.focus?.({preventScroll:true});
    });
    card.append(choose);
  }else{
    card.append(make('p','profile-gap','Not fully eligible for this example.'));
  }
  return card;
}
// The server is the source of truth: browser reloads and repeated clicks
// never refund the two additional recommendation rounds.
function renderRecommendationSet(body,brief,vertical,viewRound=body.round){
  const set=body.history?.find(entry=>entry.round===viewRound);
  if(!set)return;
  activeRecommendation={body,brief,vertical};
  marketplaceOutput.replaceChildren();
  const summary=make('p','match-summary',
    'OFFLINE SYNTHETIC · '+(vertical==='ai_work'?'AI Work':'Global Services')+
    ' · Required skills: '+(body.requestedSkills.join(', ')||'none identified; clarify request')+
    ' · Reference price: DATA_INSUFFICIENT · PayPal: NOT_CONNECTED');
  marketplaceOutput.append(summary);
  const tierNote=make('p','recommendation-explainer',
    'Three different opportunity paths. Career tiers are fictional examples, NOT verified credentials or price claims.');
  marketplaceOutput.append(tierNote);
  const grid=make('div','profile-grid');
  for(const profile of set.profiles)
    grid.append(createProfileCard(profile,body.requestedSkills,brief,vertical));
  marketplaceOutput.append(grid);
  const controls=make('div','recommendation-controls');
  controls.append(make('p','recommendation-count',
    'Viewing set '+viewRound+' of '+body.maxRounds+
    ' · '+(body.round*3)+' candidates discovered · '+body.remainingRefreshes+' more sets available'));
  const next=make('button','recommendation-next',
    body.remainingRefreshes===0?'All 9 candidates shown':'Show 3 other specialists ('+body.remainingRefreshes+' left)');
  next.type='button';
  next.id='marketplace-next-recommendations';
  next.disabled=body.remainingRefreshes===0||marketplaceBusy;
  next.addEventListener('click',()=>advanceRecommendations());
  controls.append(next);
  const records=make('div','recommendation-history');
  records.setAttribute('role','group');
  records.setAttribute('aria-label','Previously recommended sets');
  for(const entry of body.history){
    const button=make('button','recommendation-history-button',
      'Set '+entry.round+' · 3 profiles');
    button.type='button';
    button.id='marketplace-history-round-'+entry.round;
    button.setAttribute('aria-pressed',String(entry.round===viewRound));
    button.addEventListener('click',()=>renderRecommendationSet(body,brief,vertical,entry.round));
    records.append(button);
  }
  controls.append(records);
  marketplaceOutput.append(controls);
  if(!set.profiles.some(p=>p.eligible))
    marketplaceSelection.textContent='No fully eligible synthetic candidate in this set. Check skill gaps before choosing.';
}
async function advanceRecommendations(){
  const previous=activeRecommendation;
  if(marketplaceBusy||!previous||previous.body.remainingRefreshes===0)return;
  if(previous.brief!==marketplaceBrief.value||
     previous.vertical!==selectedCategory())return;
  marketplaceBusy=true;
  const epoch=matchEpoch;
  try{
    const sessionResponse=await fetch('/demo/session',{credentials:'same-origin',cache:'no-store'});
    if(!sessionResponse.ok)throw new Error('SESSION_NOT_READY');
    const session=await sessionResponse.json();
    if(session.mode!=='OFFLINE_MOCK'||session.role!=='owner')throw new Error('OWNER_SESSION_REQUIRED');
    const result=await fetch('/api/demo/marketplace/next',{
      method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{'content-type':'application/json','x-csrf-token':session.csrfToken},
      body:JSON.stringify({sessionId:previous.body.sessionId,
        expectedRound:previous.body.round})
    });
    // Stale concurrent tab or double request: restore server history instead
    // of silently consuming another round.
    const response=result.status===409
      ? await fetch('/api/demo/marketplace/history?sessionId='+
          encodeURIComponent(previous.body.sessionId),
          {credentials:'same-origin',cache:'no-store'})
      : result;
    const body=await response.json();
    if(!response.ok)throw new Error(body.error||'REFRESH_FAILED');
    if(epoch!==matchEpoch||previous.brief!==marketplaceBrief.value||
       previous.vertical!==selectedCategory())return;
    renderRecommendationSet(body,previous.brief,previous.vertical);
    marketplaceSelection.textContent='Recommendation history preserved. No quote, seller enrollment or payment changed.';
  }catch(e){
    if(epoch===matchEpoch)
      marketplaceSelection.textContent='Cannot show another set: '+(e?.message||'REQUEST_FAILED');
  }finally{
    marketplaceBusy=false;
    if(epoch===matchEpoch&&activeRecommendation)
      renderRecommendationSet(activeRecommendation.body,
        activeRecommendation.brief,activeRecommendation.vertical);
  }
}
marketplaceForm.addEventListener('submit',async event=>{
  event.preventDefault();
  if(marketplaceBusy)return;
  marketplaceBusy=true;
  marketplaceButton.disabled=true;
  const selectedVertical=selectedCategory();
  const matchedBrief=marketplaceBrief.value;
  const epoch=++matchEpoch;
  marketplaceOutput.textContent='Checking fictional specialists in selected service category…';
  marketplaceSelection.textContent='No candidate selected. No quote or payment modified.';
  try {
    const sessionResponse=await fetch('/demo/session',{credentials:'same-origin',cache:'no-store'});
    if(!sessionResponse.ok)throw new Error('SESSION_NOT_READY');
    const session=await sessionResponse.json();
    if(session.mode!=='OFFLINE_MOCK'||session.role!=='owner')throw new Error('OWNER_SESSION_REQUIRED');
    const result=await fetch('/api/demo/marketplace',{
      method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{'content-type':'application/json','x-csrf-token':session.csrfToken},
      body:JSON.stringify({brief:matchedBrief,vertical:selectedVertical}),
    });
    const body=await result.json();
    if(!result.ok)throw new Error(body.error||'MATCH_FAILED');
    // No innerHTML: model and server text always goes through textContent.
    if(epoch!==matchEpoch || marketplaceBrief.value!==matchedBrief ||
       selectedCategory()!==selectedVertical)return;
    renderRecommendationSet(body,matchedBrief,selectedVertical);
  }catch(e){
    if(epoch!==matchEpoch)return;
    marketplaceOutput.textContent='Cannot match: '+(e?.message||'REQUEST_FAILED');
    marketplaceSelection.textContent='No candidate selected; quote and payment unchanged.';
  }finally{
    marketplaceBusy=false;
    marketplaceButton.disabled=false;
  }
});
