// Read-only, opt-in protected resource projections for local CI.
// Not a replacement for legacy demo routes or a deployed auth provider.
import {QuoteApiError,reply} from './quote_api.mjs';

const ID=/^[A-Za-z0-9_-]{1,64}$/;
export function createMarketplaceProtectedReadApi({policy,ledger}={}){
 if(!policy||typeof policy.issueProof!=='function'||
    typeof policy.authorize!=='function'||!ledger||
    typeof ledger.getQuoteAuthorityResource!=='function'||
    typeof ledger.getContractAuthorityResource!=='function')
   throw new TypeError('PROTECTED_READ_POLICY_AND_LEDGER_REQUIRED');
 return async function handle(request){
  try{
   if(!(request instanceof Request))throw new QuoteApiError('REQUEST_REQUIRED');
   const url=new URL(request.url),match=/^\/api\/demo\/protected\/(quotes|contracts)\/([A-Za-z0-9_-]{1,64})(\/events)?$/.exec(url.pathname);
   if(!match||url.search!=='')throw new QuoteApiError('NOT_FOUND',404);
   if(request.method!=='GET')return reply({error:'METHOD_NOT_ALLOWED'},405,{allow:'GET'});
   const proof=await policy.issueProof(request);
   const [_,kind,id,events]=match;
   if(events&&kind!=='contracts')throw new QuoteApiError('NOT_FOUND',404);
   const scope=kind==='quotes'
     ?await ledger.getQuoteAuthorityResource(id)
     :await ledger.getContractAuthorityResource(id);
   if(!scope)throw new QuoteApiError('RESOURCE_NOT_FOUND',404);
   await policy.authorize(proof,{action:kind==='quotes'?'quote.read':'contract.read',resource:scope});
   if(kind==='quotes'){
    // No provider token or payment control in returned document.
    const quote=await ledger.get(id);
    return reply({quote,source:'SYNTHETIC_PERSISTED_LEDGER',paymentAuthorized:false});
   }
   // Existing ledger getContract is owner/reviewer-scoped. The *trusted*
   // resource check above already validated the seller assignment; read
   // via owner identity internally without impersonation on the HTTP layer.
   if(events){
    const eventsData=await ledger.listContractEvents({contractId:id,
      actorId:scope.ownerId,merchantId:scope.merchantId});
    return reply({events:eventsData,source:'SYNTHETIC_PERSISTED_LEDGER',
      paymentAuthorized:false});
   }
   const contract=await ledger.getContract({contractId:id,
     actorId:scope.ownerId,merchantId:scope.merchantId});
   return reply({contract,source:'SYNTHETIC_PERSISTED_LEDGER',paymentAuthorized:false});
  }catch(e){
   return reply({error:e instanceof QuoteApiError?e.code:'INTERNAL_ERROR'},
     e instanceof QuoteApiError?e.status:500);
  }
 };
}
