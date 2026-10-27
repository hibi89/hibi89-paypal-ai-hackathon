// D08 offline HTTP contract/delivery API. Caller session MUST be resolved server-side.
// NOT a production auth provider, real payment endpoint or public deployment.
import { QuoteApiError, parseSmallJson, reply } from './quote_api.mjs';

const idPattern=/^[a-zA-Z0-9_-]{1,64}$/;
const safeId = id => typeof id==='string' && idPattern.test(id);
const fail=(condition,code,status=400)=>{
  if(condition) throw new QuoteApiError(code,status);
};
function parsePath(path) {
  if(path==='/api/contracts') return {kind:'create',method:'POST'};
  const segments=path.split('/');
  if(segments[0]!=='' || segments[1]!=='api' || segments[2]!=='contracts' ||
      !safeId(segments[3])) return null;
  if(segments.length===4) return {kind:'contract',contractId:segments[3],method:'GET'};
  if(segments.length===5 && segments[4]==='events')
    return {kind:'events',contractId:segments[3],method:'GET'};
  if(segments.length===7 && segments[4]==='milestones' &&
      safeId(segments[5]) && ['submit','accept','reject'].includes(segments[6]))
    return {kind:segments[6],contractId:segments[3],milestoneId:segments[5],
      method:'POST'};
  return null;
}
function exactFields(data,names) {
  fail(Object.keys(data).some(key=>!names.includes(key)), 'UNEXPECTED_REQUEST_FIELD');
}
function validEvent(data) {
  fail(!safeId(data.eventId),'INVALID_EVENT_ID');
  fail(!Number.isSafeInteger(data.expectedVersion) || data.expectedVersion<1,
    'CONTRACT_VERSION_REQUIRED');
}
function sessionIsTrusted(session){
  return session?.verified===true &&
    typeof session.actorId==='string' && session.actorId.length>0 &&
    session.actorId.length<=128 &&
    typeof session.merchantId==='string' && session.merchantId.length>0 &&
    session.merchantId.length<=128;
}
// Never accept actor, merchant or role from the HTTP body/headers. Trusted resolver
// maps browser request to an authenticated merchant-bound server session.
export function createContractApi({repository,resolveSession}={}){
  if(!repository || ['createContract','getContract','listContractEvents',
      'transitionMilestone'].some(name=>typeof repository[name]!=='function') ||
      typeof resolveSession!=='function')
    throw new TypeError('TRUSTED_CONTRACT_SESSION_AND_LEDGER_REQUIRED');
  return async function handleContractRequest(request) {
    try {
      if(!(request instanceof Request)) throw new QuoteApiError('REQUEST_REQUIRED');
      const url=new URL(request.url), r=parsePath(url.pathname);
      fail(!r,'NOT_FOUND',404);
      if(request.method!==r.method)
        return reply({error:'METHOD_NOT_ALLOWED'},405,{allow:r.method});
      const session=await resolveSession(request);
      fail(!sessionIsTrusted(session),'AUTHENTICATION_REQUIRED',401);
      if(r.method==='POST'){
        const origin=request.headers.get('origin');
        fail(origin!==null && origin!==url.origin,'ORIGIN_MISMATCH',403);
        fail(typeof session.csrfToken!=='string'||!session.csrfToken||
          request.headers.get('x-csrf-token')!==session.csrfToken,
        'CSRF_REQUIRED',403);
      }
      const ctx={actorId:session.actorId,merchantId:session.merchantId};
      if(r.kind==='contract') {
        const contract=await repository.getContract({...ctx,contractId:r.contractId});
        return reply({contract});
      }
      if(r.kind==='events') {
        const events=await repository.listContractEvents({...ctx,contractId:r.contractId});
        return reply({events});
      }
      const body=await parseSmallJson(request);
      if(r.kind==='create') {
        exactFields(body,['id','quoteId','reviewerId','expectedVersion','eventId','milestones']);
        fail(!safeId(body.id)||!safeId(body.quoteId)||
          typeof body.reviewerId!=='string'||!body.reviewerId||
          body.reviewerId.length>128 || !safeId(body.eventId),
          'INVALID_CONTRACT_REQUEST');
        fail(!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<1,
          'QUOTE_VERSION_REQUIRED');
        fail(!Array.isArray(body.milestones)||body.milestones.length<1||
          body.milestones.length>30,'INVALID_MILESTONES');
        for(const m of body.milestones) {
          fail(!m||typeof m!=='object'||Array.isArray(m)||
            Object.keys(m).some(k=>!['id','step','amountMinor'].includes(k)),
            'INVALID_MILESTONE');
        }
        const contract=await repository.createContract({...ctx,id:body.id,
          quoteId:body.quoteId,reviewerId:body.reviewerId,
          expectedVersion:body.expectedVersion,eventId:body.eventId,
          milestones:body.milestones});
        return reply({contract},201);
      }
      const fields=r.kind==='submit'?['expectedVersion','eventId','expectedState','detail']:
        ['expectedVersion','eventId','detail'];
      exactFields(body,fields);
      validEvent(body);
      if(r.kind==='submit')
        fail(!['PENDING','REJECTED'].includes(body.expectedState),
          'INVALID_MILESTONE_TRANSITION',409);
      const nextState={submit:'SUBMITTED',accept:'ACCEPTED',reject:'REJECTED'}[r.kind];
      const expectedState=r.kind==='submit'?body.expectedState:'SUBMITTED';
      const detail=body.detail===undefined?null:body.detail;
      const contract=await repository.transitionMilestone({...ctx,
        contractId:r.contractId,milestoneId:r.milestoneId,
        expectedVersion:body.expectedVersion,expectedState,nextState,
        eventId:body.eventId,detail});
      return reply({contract});
    }catch(err){
      if(err instanceof QuoteApiError) return reply({error:err.code},err.status);
      // Hide SQL/stack/provider information from callers.
      return reply({error:'INTERNAL_ERROR'},500);
    }
  };
}
