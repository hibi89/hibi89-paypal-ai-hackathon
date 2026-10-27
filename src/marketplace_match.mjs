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
  Object.freeze({ id:'synthetic-web', displayName:'Demo Web Specialist', skills:Object.freeze(['web','design','payments']), language:'en', source:'SYNTHETIC_PROFILE' }),
  Object.freeze({ id:'synthetic-automation', displayName:'Demo Workflow Builder', skills:Object.freeze(['automation','data','web']), language:'en', source:'SYNTHETIC_PROFILE' }),
  Object.freeze({ id:'synthetic-data', displayName:'Demo Data Analyst', skills:Object.freeze(['data','automation','qa']), language:'en', source:'SYNTHETIC_PROFILE' }),
]);
const error=(code,status=400)=>Object.assign(new Error(code),{code,status});
// A closed skill taxonomy is used by both regex-only and AI-assisted matching.
export const MARKETPLACE_SKILL_NAMES=Object.freeze(SKILLS.map(([name])=>name));
export function matchSyntheticMarketplaceSkills(requestedSkills,{source='OFFLINE_REGEX'}={}) {
  if(!Array.isArray(requestedSkills)||requestedSkills.length>MARKETPLACE_SKILL_NAMES.length ||
     !requestedSkills.every(skill=>typeof skill==='string'&&MARKETPLACE_SKILL_NAMES.includes(skill))||
     new Set(requestedSkills).size!==requestedSkills.length ||
     !['OFFLINE_REGEX','GEMINI_API'].includes(source))throw error('INVALID_MATCH_SKILLS');
  const canonical=MARKETPLACE_SKILL_NAMES.filter(skill=>requestedSkills.includes(skill));
  const mode=source==='GEMINI_API'?'GEMINI_ASSISTED_SYNTHETIC_PROFILES':'OFFLINE_SYNTHETIC_NO_AI';
  const profiles=PROFILES.map((profile,index)=>{
    const matchedSkills=canonical.filter(skill=>profile.skills.includes(skill));
    const missingSkills=canonical.filter(skill=>!profile.skills.includes(skill));
    return {
      id:profile.id, displayName:profile.displayName, source:profile.source,
      language:profile.language, skills:[...profile.skills],
      matchedSkills, missingSkills,
      eligible:canonical.length>0 && missingSkills.length===0,
      score:canonical.length>0 ? matchedSkills.length/canonical.length : 0,
      reason:canonical.length===0?'NEEDS_SKILL_CLARIFICATION':
        missingSkills.length===0?'MATCHES_REQUESTED_SKILLS':'MISSING_REQUIRED_SKILLS',
      order:index,
    };
  }).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||b.score-a.score||a.order-b.order)
    .map(({order,...publicProfile})=>publicProfile);
  return {
    mode,skillSource:source,profileCount:PROFILES.length,
    requestedSkills:canonical,needsClarification:canonical.length===0,
    profiles,price:{status:'DATA_INSUFFICIENT',source:'NO_VERIFIED_COMPARABLE_TRANSACTIONS',amountMinor:null},
    paypal:{status:'NOT_CONNECTED',capturePerformed:false},
    statement:source==='GEMINI_API'?
      'Model-classified skills, deterministic matching to fictional profiles. No real opt-in sellers, price evidence or PayPal transaction.':
      'Fictional examples only. No real opt-in sellers, AI request, or PayPal transaction.',
  };
}
export function matchSyntheticMarketplaceBrief(brief) {
  if (typeof brief!=='string' || brief.length<8 || brief.length>500 ||
      /[\u0000-\u001f\u007f]/u.test(brief) || brief.trim().length<8)
    throw error('INVALID_SYNTHETIC_BRIEF');
  const requestedSkills=SKILLS.filter(([,pattern])=>pattern.test(brief)).map(([name])=>name);
  return matchSyntheticMarketplaceSkills(requestedSkills);

}
export function createMarketplaceDemoApi({resolveSession}={}) {
  if(typeof resolveSession!=='function') throw new TypeError('VERIFIED_SESSION_REQUIRED');
  return async function handleMarketplace(request){
    try {
      if(!(request instanceof Request))throw error('REQUEST_REQUIRED');
      if(request.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405,{allow:'POST'});
      const url=new URL(request.url);
      if(url.pathname!=='/api/demo/marketplace')throw error('NOT_FOUND',404);
      const session=await resolveSession(request);
      if(!session || session.verified!==true ||
          session.actorId!=='synthetic-owner' ||
          session.merchantId!=='synthetic-merchant')throw error('OWNER_SESSION_REQUIRED',403);
      const origin=request.headers.get('origin');
      if(origin!==null && origin!==url.origin)throw error('ORIGIN_MISMATCH',403);
      if(typeof session.csrfToken!=='string' ||
          request.headers.get('x-csrf-token')!==session.csrfToken)throw error('CSRF_REQUIRED',403);
      const body=await parseSmallJson(request);
      if(Object.keys(body).some(key=>key!=='brief'))throw error('UNEXPECTED_FIELDS');
      return reply(matchSyntheticMarketplaceBrief(body.brief));
    }catch(e) {
      const status=e instanceof QuoteApiError?e.status:
        Number.isInteger(e?.status)?e.status:400;
      const code=e instanceof QuoteApiError?e.code:
        typeof e?.code==='string'?e.code:'INVALID_MARKETPLACE_REQUEST';
      return reply({error:code},status);
    }
  };
}
