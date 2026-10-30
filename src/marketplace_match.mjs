// Bounded contest vertical slice: deterministic matchmaking among fictional profiles.
// No Gemini call, real seller registration, marketplace data, price ML or payment authority.
import { parseSmallJson, reply, QuoteApiError } from './quote_api.mjs';

const SKILLS = Object.freeze([
  ['web', /\b(web|website|frontend|front-end|e-commerce|ecommerce|storefront|landing page)\b/i],
  ['design', /\b(design|figma|ui|ux|layout|visual)\b/i],
  ['payments', /\b(paypal|payment|checkout|billing|invoice)\b/i],
  ['automation', /\b(automation|automate|workflow|n8n|integration|integrate)\b/i],
  ['data', /\b(data|dataset|analytics|dashboard|python|sql|report)\b/i],
  ['qa', /\b(test|testing|qa|quality assurance|accessibility)\b/i],
]);
const PROFILES = Object.freeze([
  // Nine fictional archetypes, ordered as three rounds of professional/rising/newcomer.
  // Tier describes the presentation slot, NOT verified seniority or price.
  Object.freeze({id:'synthetic-web',displayName:'Demo Web Specialist',tier:'professional',skills:Object.freeze(['web','design','payments']),language:'en',source:'SYNTHETIC_PROFILE'}),
  Object.freeze({id:'synthetic-automation',displayName:'Demo Workflow Builder',tier:'rising',skills:Object.freeze(['automation','data','web']),language:'en',source:'SYNTHETIC_PROFILE'}),
  Object.freeze({id:'synthetic-data',displayName:'Demo Data Analyst',tier:'newcomer',skills:Object.freeze(['data','automation','qa']),language:'en',source:'SYNTHETIC_PROFILE'}),
  Object.freeze({id:'synthetic-commerce',displayName:'Demo Commerce Engineer',tier:'professional',skills:Object.freeze(['web','payments','qa']),language:'en',source:'SYNTHETIC_PROFILE'}),
  Object.freeze({id:'synthetic-ui',displayName:'Demo Emerging UI Maker',tier:'rising',skills:Object.freeze(['web','design','qa']),language:'en',source:'SYNTHETIC_PROFILE'}),
  Object.freeze({id:'synthetic-layout',displayName:'Demo Junior Layout Creator',tier:'newcomer',skills:Object.freeze(['web','design']),language:'en',source:'SYNTHETIC_PROFILE'}),
  Object.freeze({id:'synthetic-systems',displayName:'Demo Systems Specialist',tier:'professional',skills:Object.freeze(['payments','automation','data']),language:'en',source:'SYNTHETIC_PROFILE'}),
  Object.freeze({id:'synthetic-builder',displayName:'Demo Growing App Builder',tier:'rising',skills:Object.freeze(['web','automation','data']),language:'en',source:'SYNTHETIC_PROFILE'}),
  Object.freeze({id:'synthetic-tester',displayName:'Demo Entry QA Learner',tier:'newcomer',skills:Object.freeze(['qa','web']),language:'en',source:'SYNTHETIC_PROFILE'}),
]);

const error=(code,status=400)=>Object.assign(new Error(code),{code,status});
// Three distinct opportunity lanes per round. Rank candidates ONLY within
// their lane by explicit required-skill coverage; never infer reputation,
// real experience, pricing, popularity or verified portfolio quality.
const TIERS=Object.freeze(['professional','rising','newcomer']);
function chooseOpportunitySet(profiles,required,round,{profileIds,legacyOrder=false}={}) {
  if(profileIds!==undefined){
    if(!Array.isArray(profileIds)||profileIds.length!==3||
       new Set(profileIds).size!==3)throw error('INVALID_RECOMMENDATION_ROSTER');
    return TIERS.map((tier,i)=>{
      const found=profiles.find(p=>p.id===profileIds[i]);
      if(!found||found.tier!==tier)throw error('INVALID_RECOMMENDATION_ROSTER');
      return found;
    });
  }
  if(legacyOrder)return profiles.slice(round*3,round*3+3);
  return TIERS.map(tier=>{
    const ordered=profiles.filter(profile=>profile.tier===tier)
      .map((profile,index)=>({
        profile,index,coverage:required.filter(skill=>profile.skills.includes(skill)).length
      })).sort((a,b)=>{
        const fullA=required.length>0&&a.coverage===required.length;
        const fullB=required.length>0&&b.coverage===required.length;
        return Number(fullB)-Number(fullA)||b.coverage-a.coverage||a.index-b.index;
      });
    if(ordered.length!==3)throw error('UNEXPECTED_SYNTHETIC_TIER_POOL');
    return ordered[round].profile;
  });
}

// A closed skill taxonomy is used by both regex-only and AI-assisted matching.
export const MARKETPLACE_SKILL_NAMES=Object.freeze(SKILLS.map(([name])=>name));
export function matchSyntheticMarketplaceSkills(requestedSkills,{source='OFFLINE_REGEX',round=0,profileIds,legacyOrder=true}={}) {
  if(!Array.isArray(requestedSkills)||requestedSkills.length>MARKETPLACE_SKILL_NAMES.length ||
     !requestedSkills.every(skill=>typeof skill==='string'&&MARKETPLACE_SKILL_NAMES.includes(skill))||
     new Set(requestedSkills).size!==requestedSkills.length ||
     !['OFFLINE_REGEX','GEMINI_API'].includes(source))throw error('INVALID_MATCH_SKILLS');
  if(!Number.isInteger(round)||round<0||round>2)throw error('INVALID_RECOMMENDATION_ROUND');
  const canonical=MARKETPLACE_SKILL_NAMES.filter(skill=>requestedSkills.includes(skill));
  const mode=source==='GEMINI_API'?'GEMINI_ASSISTED_SYNTHETIC_PROFILES':'OFFLINE_SYNTHETIC_NO_AI';
  const profiles=chooseOpportunitySet(PROFILES,canonical,round,{profileIds,legacyOrder}).map(profile=>{
    const matchedSkills=canonical.filter(skill=>profile.skills.includes(skill));
    const missingSkills=canonical.filter(skill=>!profile.skills.includes(skill));
    return {
      id:profile.id, displayName:profile.displayName, source:profile.source,
      tier:profile.tier,tierEvidence:'FICTIONAL_SCENARIO_NOT_VERIFIED',
      language:profile.language, skills:[...profile.skills],
      matchedSkills, missingSkills,
      eligible:canonical.length>0 && missingSkills.length===0,
      score:canonical.length>0 ? matchedSkills.length/canonical.length : 0,
      reason:canonical.length===0?'NEEDS_SKILL_CLARIFICATION':
        missingSkills.length===0?'MATCHES_REQUESTED_SKILLS':'MISSING_REQUIRED_SKILLS',
    };
  });
  return {
    mode,skillSource:source,profileCount:profiles.length,candidatePoolSize:PROFILES.length,round:round+1,
    requestedSkills:canonical,needsClarification:canonical.length===0,
    profiles,price:{status:'DATA_INSUFFICIENT',source:'NO_VERIFIED_COMPARABLE_TRANSACTIONS',amountMinor:null},
    paypal:{status:'NOT_CONNECTED',capturePerformed:false},
    statement:source==='GEMINI_API'?
      'Model-classified skills, deterministic matching to fictional profiles. No real opt-in sellers, price evidence or PayPal transaction.':
      'Fictional examples only. No real opt-in sellers, AI request, or PayPal transaction.',
  };
}
export function matchSyntheticMarketplaceBrief(brief,{round=0}={}) {
  if (typeof brief!=='string' || brief.length<8 || brief.length>500 ||
      /[\u0000-\u001f\u007f]/u.test(brief) || brief.trim().length<8)
    throw error('INVALID_SYNTHETIC_BRIEF');
  const requestedSkills=SKILLS.filter(([,pattern])=>pattern.test(brief)).map(([name])=>name);
  return matchSyntheticMarketplaceSkills(requestedSkills,{round});

}
// Second contest category: general digital services, using the SAME offline quote,
// approval and payment boundaries. This is not a real opt-in seller directory.
const GENERAL_SERVICE_SKILLS=Object.freeze([
  ['design', /\b(design|graphic|logo|figma|ui|ux|visual)\b/i],
  ['translation', /\b(translat(?:e|ion|or)|korean|japanese|localiz(?:e|ation))\b/i],
  ['marketing', /\b(marketing|seo|campaign|advertis(?:e|ing)|social media)\b/i],
  ['writing', /\b(writing|copywriting|copywriter|content|article|blog)\b/i],
  ['video', /\b(video|edit(?:ing|or)|motion|animation)\b/i],
  ['branding', /\b(brand|branding|identity|logo)\b/i],
]);
const GENERAL_PROFILES=Object.freeze([
  Object.freeze({id:'synthetic-creative',displayName:'Demo Creative Designer',tier:'professional',skills:Object.freeze(['design','branding','video']),language:'en',source:'SYNTHETIC_PROFILE'}),
  Object.freeze({id:'synthetic-translator',displayName:'Demo Translation Writer',tier:'rising',skills:Object.freeze(['translation','writing']),language:'en',source:'SYNTHETIC_PROFILE'}),
  Object.freeze({id:'synthetic-marketer',displayName:'Demo Marketing Specialist',tier:'newcomer',skills:Object.freeze(['marketing','writing','video']),language:'en',source:'SYNTHETIC_PROFILE'}),
  Object.freeze({id:'synthetic-brand',displayName:'Demo Brand Art Director',tier:'professional',skills:Object.freeze(['design','branding','marketing']),language:'en',source:'SYNTHETIC_PROFILE'}),
  Object.freeze({id:'synthetic-localizer',displayName:'Demo Rising Localizer',tier:'rising',skills:Object.freeze(['translation','writing','branding']),language:'en',source:'SYNTHETIC_PROFILE'}),
  Object.freeze({id:'synthetic-copy',displayName:'Demo Entry Copy Creator',tier:'newcomer',skills:Object.freeze(['writing','marketing']),language:'en',source:'SYNTHETIC_PROFILE'}),
  Object.freeze({id:'synthetic-campaign',displayName:'Demo Campaign Director',tier:'professional',skills:Object.freeze(['marketing','branding','video']),language:'en',source:'SYNTHETIC_PROFILE'}),
  Object.freeze({id:'synthetic-motion',displayName:'Demo Growing Motion Artist',tier:'rising',skills:Object.freeze(['video','design']),language:'en',source:'SYNTHETIC_PROFILE'}),
  Object.freeze({id:'synthetic-illustrator',displayName:'Demo Entry Illustrator',tier:'newcomer',skills:Object.freeze(['design','branding']),language:'en',source:'SYNTHETIC_PROFILE'}),
]);
export function matchSyntheticGeneralServiceBrief(brief,{round=0}={}) {
  if(typeof brief!=='string'||brief.length<8||brief.length>500||
     /[\u0000-\u001f\u007f]/u.test(brief)||brief.trim().length<8)
    throw error('INVALID_SYNTHETIC_BRIEF');
  const requestedSkills=GENERAL_SERVICE_SKILLS.filter(([,pattern])=>pattern.test(brief)).map(([skill])=>skill);
  return matchSyntheticGeneralServiceSkills(requestedSkills,{round});
}
export function matchSyntheticGeneralServiceSkills(requestedSkills,{round=0,profileIds,legacyOrder=true}={}) {
  const allowed=GENERAL_SERVICE_SKILLS.map(([name])=>name);
  if(!Array.isArray(requestedSkills)||requestedSkills.length>allowed.length||
     requestedSkills.some(skill=>typeof skill!=='string'||!allowed.includes(skill))||
     new Set(requestedSkills).size!==requestedSkills.length)
    throw error('INVALID_MATCH_SKILLS');
  if(!Number.isInteger(round)||round<0||round>2)throw error('INVALID_RECOMMENDATION_ROUND');
  const canonical=allowed.filter(skill=>requestedSkills.includes(skill));
  const profiles=chooseOpportunitySet(GENERAL_PROFILES,canonical,round,{profileIds,legacyOrder}).map(profile=>{
    const matchedSkills=canonical.filter(skill=>profile.skills.includes(skill));
    const missingSkills=canonical.filter(skill=>!profile.skills.includes(skill));
    return {
      id:profile.id,displayName:profile.displayName,source:profile.source,
      tier:profile.tier,tierEvidence:'FICTIONAL_SCENARIO_NOT_VERIFIED',
      language:profile.language,skills:[...profile.skills],
      matchedSkills,missingSkills,
      eligible:canonical.length>0&&missingSkills.length===0,
      score:canonical.length?matchedSkills.length/canonical.length:0,
      reason:!canonical.length?'NEEDS_SKILL_CLARIFICATION':
        !missingSkills.length?'MATCHES_REQUESTED_SKILLS':'MISSING_REQUIRED_SKILLS',
    };
  });
  return {
    vertical:'general_services',
    mode:'OFFLINE_SYNTHETIC_NO_AI',
    skillSource:'OFFLINE_REGEX',
    profileCount:profiles.length,candidatePoolSize:GENERAL_PROFILES.length,round:round+1,
    requestedSkills:canonical,needsClarification:canonical.length===0,
    profiles,
    price:{status:'DATA_INSUFFICIENT',source:'NO_VERIFIED_COMPARABLE_TRANSACTIONS',amountMinor:null},
    paypal:{status:'NOT_CONNECTED',capturePerformed:false},
    statement:'Fictional general-service archetypes only. Career tiers are illustrative, not independently verified. No real sellers, Gemini request, fee-sharing agreement or PayPal transaction.',
  };
}

// History is read-only; starting/reusing a set and requesting the next set
// are deliberately separate CSRF-bound mutations. No actual seller identities.
export function createMarketplaceDemoApi({resolveSession,store}={}) {
  if(typeof resolveSession!=='function'||!store)throw new TypeError('VERIFIED_SESSION_AND_STORE_REQUIRED');
  const render=(row)=>{
    const matchFor=i=>row.vertical==='ai_work'
      ? {...matchSyntheticMarketplaceSkills(row.skills,{round:i,profileIds:row.roster[i]}),vertical:'ai_work'}
      : matchSyntheticGeneralServiceSkills(row.skills,{round:i,profileIds:row.roster[i]});
    const current=matchFor(row.round);
    return {...current,sessionId:row.id,round:row.round+1,
      maxRounds:3,remainingRefreshes:2-row.round,
      history:Array.from({length:row.round+1},(_,i)=>({
        round:i+1,profiles:matchFor(i).profiles
      }))};
  };
  return async function handleMarketplace(request){
    try {
      if(!(request instanceof Request))throw error('REQUEST_REQUIRED');
      const url=new URL(request.url);
      const path=url.pathname;
      const history=path==='/api/demo/marketplace/history';
      const next=path==='/api/demo/marketplace/next';
      if(!history&&!next&&path!=='/api/demo/marketplace')throw error('NOT_FOUND',404);
      if((history&&request.method!=='GET')||(!history&&request.method!=='POST'))
        return reply({error:'METHOD_NOT_ALLOWED'},405,{allow:history?'GET':'POST'});
      const session=await resolveSession(request);
      if(!session||session.verified!==true||
          session.actorId!=='synthetic-owner'||
          session.merchantId!=='synthetic-merchant')throw error('OWNER_SESSION_REQUIRED',403);
      const origin=request.headers.get('origin');
      if(origin!==null&&origin!==url.origin)throw error('ORIGIN_MISMATCH',403);
      if(history){
        if(url.searchParams.size!==1)throw error('INVALID_HISTORY_QUERY');
        const id=url.searchParams.get('sessionId');
        const row=store.get(session.actorId,id);
        if(!row)throw error('RECOMMENDATION_SESSION_NOT_FOUND',404);
        return reply(render(row));
      }
      if(typeof session.csrfToken!=='string'||
          request.headers.get('x-csrf-token')!==session.csrfToken)
        throw error('CSRF_REQUIRED',403);
      const body=await parseSmallJson(request);
      if(next){
        if(Object.keys(body).some(key=>!['sessionId','expectedRound'].includes(key))||
           typeof body.sessionId!=='string'||!Number.isInteger(body.expectedRound))
          throw error('INVALID_RECOMMENDATION_ADVANCE');
        const row=store.next(session.actorId,body.sessionId,body.expectedRound);
        return reply(render(row));
      }
      if(Object.keys(body).some(key=>!['brief','vertical'].includes(key)))
        throw error('UNEXPECTED_FIELDS');
      const vertical=body.vertical??'ai_work';
      if(!['ai_work','general_services'].includes(vertical))
        throw error('INVALID_MARKETPLACE_VERTICAL');
      const initial=vertical==='ai_work'
        ? matchSyntheticMarketplaceBrief(body.brief)
        : matchSyntheticGeneralServiceBrief(body.brief);
      const row=store.start(session.actorId,vertical,body.brief,initial.requestedSkills);
      return reply(render(row));
    }catch(e) {
      const status=e instanceof QuoteApiError?e.status:
        Number.isInteger(e?.status)?e.status:400;
      const code=e instanceof QuoteApiError?e.code:
        typeof e?.code==='string'?e.code:'INVALID_MARKETPLACE_REQUEST';
      return reply({error:code},status);
    }
  };
}
