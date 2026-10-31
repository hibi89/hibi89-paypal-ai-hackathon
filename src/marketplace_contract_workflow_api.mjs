// Opt-in local synthetic seller→reviewer workflow. No registration, public
// authentication, merchant ownership or external payment authority.
import {QuoteApiError,parseSmallJson,reply} from './quote_api.mjs';

const fail=(code,status=400)=>{throw new QuoteApiError(code,status)};
const IDENT=/^[A-Za-z0-9_-]{1,64}$/;
const matches=x=>typeof x==='string'&&IDENT.test(x);
export function createMarketplaceContractWorkflowApi({ledger,policy,resolveSession}={}){
 if(typeof resolveSession!=='function'||typeof policy?.issueProof!=='function'||
    typeof policy?.authorize!=='function'||
    typeof ledger?.getContractAuthorityResource!=='function'||
    typeof ledger?.transitionMarketplaceMilestone!=='function')
    throw new TypeError('TRUSTED_WORKFLOW_POLICY_AND_LEDGER_REQUIRED');
 return async function handle(request){
  try{
   if(!(request instanceof Request))fail('REQUEST_REQUIRED');
   const url=new URL(request.url);
   const match=/^\/api\/demo\/workflow\/contracts\/([A-Za-z0-9_-]{1,64})\/milestones\/([A-Za-z0-9_-]{1,64})\/(submit|accept|reject)$/.exec(url.pathname);
   if(!match||url.search)fail('NOT_FOUND',404);
   if(request.method!=='POST')
     return reply({error:'METHOD_NOT_ALLOWED'},405,{allow:'POST'});
   // Issued identity comes from a trusted host resolver, never request body.
   const session=await resolveSession(request);
   if(session?.verified!==true)fail('AUTHENTICATION_REQUIRED',401);
   if(request.headers.get('origin')!==url.origin)fail('ORIGIN_MISMATCH',403);
   if(typeof session.csrfToken!=='string'||session.csrfToken.length<1||
     request.headers.get('x-csrf-token')!==session.csrfToken)
     fail('CSRF_REQUIRED',403);
   const proof=await policy.issueProof(request);
   const [_,contractId,milestoneId,verb]=match;
   const scope=await ledger.getContractAuthorityResource(contractId);
   if(!scope)fail('MARKETPLACE_CONTRACT_NOT_FOUND',404);
   const grant=await policy.authorize(proof,{
     action:verb==='submit'?'delivery.submit':'delivery.review',resource:scope
   });
   if(grant.actorId!==session.actorId||grant.merchantId!==session.merchantId)
     fail('IDENTITY_RESOLVER_MISMATCH',403);
   const body=await parseSmallJson(request);
   if(!body||typeof body!=='object'||Array.isArray(body)||
      Object.keys(body).some(k=>!['expectedVersion','expectedState','eventId','detail'].includes(k)))
      fail('INVALID_WORKFLOW_REQUEST');
   if(!matches(body.eventId)||!Number.isSafeInteger(body.expectedVersion)||
      body.expectedVersion<1)fail('INVALID_WORKFLOW_VERSION');
   const state=verb==='submit'?'SUBMITTED':
      verb==='accept'?'ACCEPTED':'REJECTED';
   const expected=verb==='submit'?body.expectedState:'SUBMITTED';
   if(verb==='submit'&&!['PENDING','REJECTED'].includes(expected))
      fail('INVALID_MILESTONE_TRANSITION',409);
   if(verb!=='submit'&&Object.hasOwn(body,'expectedState')&&body.expectedState!=='SUBMITTED')
      fail('INVALID_MILESTONE_TRANSITION',409);
   const result=await ledger.transitionMarketplaceMilestone({
     contractId,milestoneId,actorId:grant.actorId,
     merchantId:grant.merchantId,expectedVersion:body.expectedVersion,
     expectedState:expected,nextState:state,eventId:body.eventId,
     detail:body.detail??null
   });
   return reply({transition:result,providerCalls:0},200);
  }catch(e){
   return reply({error:e instanceof QuoteApiError?e.code:'INTERNAL_ERROR'},
     e instanceof QuoteApiError?e.status:500);
  }
 };
}
