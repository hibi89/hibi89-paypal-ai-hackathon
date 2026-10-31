// Identity-policy CONTRACT for a future trusted host, not an identity provider.
// Deliberately NOT wired to the 127.0.0.1 synthetic legacy routes.
// No registration endpoints, passwords, cookies, billing or outbound calls.
// Memberships are preprovisioned by the trusted server, NEVER by browser input.
import {QuoteApiError,reply} from './quote_api.mjs';

const ID=/^[A-Za-z0-9_-]{1,64}$/;
const ACTIONS=Object.freeze({
  buyer:Object.freeze(['quote.read','quote.draft','quote.approve','quote.reject',
    'marketplace.match','marketplace.select','contract.create','contract.read']),
  seller:Object.freeze(['seller.profile.read','contract.read','delivery.submit']),
  reviewer:Object.freeze(['contract.read','delivery.review']),
  merchant_operator:Object.freeze(['merchant.read'])
});
const ROLES=new Set(Object.keys(ACTIONS));
const RESOURCE_ACTIONS=new Set([
  'quote.read','quote.draft','quote.approve','quote.reject','marketplace.select',
  'contract.create','contract.read','delivery.submit','delivery.review',
  'seller.profile.read','merchant.read'
]);
const fail=(code,status=403)=>{throw new QuoteApiError(code,status)};
const id=x=>typeof x==='string'&&ID.test(x);
const own=(obj,k)=>Object.hasOwn(obj,k);
const shape=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function memberOf(raw){
  if(!shape(raw)||Object.keys(raw).some(k=>![
      'actorId','merchantId','role','sellerProfileId','active','revision'].includes(k))||
     !id(raw.actorId)||!id(raw.merchantId)||!ROLES.has(raw.role)||
     typeof raw.active!=='boolean'||
     (raw.revision!==undefined&&(!Number.isSafeInteger(raw.revision)||raw.revision<1)))
    throw new TypeError('INVALID_TRUSTED_IDENTITY_FIXTURE');
  const seller=raw.role==='seller';
  if(seller!==own(raw,'sellerProfileId')||
     (seller&&!id(raw.sellerProfileId)))
    throw new TypeError('INVALID_SELLER_ROLE_FIXTURE');
  return Object.freeze({...raw});
}
function canAccess(member,action,resource){
  if(!ACTIONS[member.role].includes(action))return false;
  if(action==='marketplace.match')return true; // tenant is checked at session resolve
  if(!shape(resource)||resource.merchantId!==member.merchantId)return false;
  if(action==='merchant.read')return true;
  if(action==='seller.profile.read')return resource.sellerProfileId===member.sellerProfileId;
  if(action==='delivery.submit')return resource.sellerProfileId===member.sellerProfileId
    && id(resource.contractId)&&resource.contractState==='ACTIVE';
  if(action==='delivery.review')return resource.reviewerId===member.actorId
    && id(resource.contractId)&&resource.contractState==='ACTIVE';
  if(action==='contract.read'){
    if(!id(resource.contractId))return false;
    if(member.role==='buyer')return resource.ownerId===member.actorId;
    if(member.role==='seller')return resource.sellerProfileId===member.sellerProfileId;
    return resource.reviewerId===member.actorId;
  }
  return resource.ownerId===member.actorId && id(resource.quoteId);
}
export function createMarketplaceIdentityPolicy({resolveTrustedSession,members,resolveMembership}={}){
  if(typeof resolveTrustedSession!=='function'||
     (typeof resolveMembership!=='function'&&(!Array.isArray(members)||
       members.length<1||members.length>1000))||
     (members!==undefined&&!Array.isArray(members)))
    throw new TypeError('TRUSTED_IDENTITY_SOURCE_REQUIRED');
  const byActor=new Map();
  for(const raw of members||[]){
    const member=memberOf(raw);
    if(byActor.has(member.actorId))throw new TypeError('AMBIGUOUS_IDENTITY_MEMBERSHIP');
    byActor.set(member.actorId,member);
  }
  // Brand is private per factory; user-crafted {verified:true,role:'buyer'}
  // is NOT a proof, nor is a proof from another policy instance.
  const proofs=new WeakMap();
  async function verified(handle){
    const session=await resolveTrustedSession(handle);
    if(!shape(session)||session.verified!==true||!id(session.actorId)||
       !id(session.merchantId))fail('TRUSTED_SESSION_REQUIRED',401);
    const raw=resolveMembership?await resolveMembership(session.actorId):null;
    const membership=resolveMembership?(raw?memberOf({
      actorId:raw.actorId,merchantId:raw.merchantId,role:raw.role,
      ...(raw.role==='seller'?{sellerProfileId:raw.sellerProfileId}:{}),
      active:raw.active,...(raw.revision===undefined?{}:{revision:raw.revision})
    }):null):byActor.get(session.actorId);
    if(!membership||!membership.active||membership.merchantId!==session.merchantId||
       (own(session,'role')&&session.role!==membership.role))
      fail('TRUSTED_MEMBERSHIP_REQUIRED',403);
    return membership;
  }
  async function issueProof(handle){
    const membership=await verified(handle);
    const proof=Object.freeze({kind:'OFFLINE_IDENTITY_POLICY_PROOF'});
    proofs.set(proof,Object.freeze({handle,actorId:membership.actorId,
      merchantId:membership.merchantId,role:membership.role,
      revision:membership.revision}));
    return proof;
  }
  async function authorize(proof,{action,resource}={}){
    const claim=shape(proof)?proofs.get(proof):null;
    if(!claim)fail('AUTHENTICATED_ROLE_PROOF_REQUIRED',401);
    const membership=await verified(claim.handle); // catches revocation/switch after issue
    if(membership.actorId!==claim.actorId||membership.merchantId!==claim.merchantId||
       membership.role!==claim.role||
       membership.revision!==claim.revision)fail('ROLE_SESSION_CHANGED',403);
    if(typeof action!=='string'||!ACTIONS[membership.role].includes(action)||
       !canAccess(membership,action,resource))
      fail('ROLE_ACTION_FORBIDDEN',403);
    // Evidence only. Never a merchant or PayPal entitlement.
    return Object.freeze({actorId:membership.actorId,merchantId:membership.merchantId,
      role:membership.role,action,
      ...(membership.revision===undefined?{}:{membershipRevision:membership.revision}),
      merchantOwnershipVerified:false,
      sellerIdentityVerified:false,paymentAuthorized:false});
  }
  async function inspect(proof){
    const claim=shape(proof)?proofs.get(proof):null;
    if(!claim)fail('AUTHENTICATED_ROLE_PROOF_REQUIRED',401);
    const membership=await verified(claim.handle);
    if(membership.actorId!==claim.actorId||membership.merchantId!==claim.merchantId||
       membership.role!==claim.role||
       membership.revision!==claim.revision)fail('ROLE_SESSION_CHANGED',403);
    return Object.freeze({actorId:membership.actorId,merchantId:membership.merchantId,
      role:membership.role,allowedActionTypes:Object.freeze([...ACTIONS[membership.role]]),
      sellerIdentityVerified:false,merchantOwnershipVerified:false,
      paymentAuthorized:false,registrationEnabled:false});
  }
  return Object.freeze({issueProof,authorize,inspect,
    mode:'LOCAL_PREPROVISIONED_ROLE_CONTRACT_ONLY',
    publicAuthenticationEnabled:false,registrationEnabled:false,
    providerNetworkEnabled:false});
}


// Safe read-only fixture projection. This is NOT registration/login or role change.
export function createMarketplaceIdentityReadOnlyApi({policy}={}){
  if(!policy||typeof policy.issueProof!=='function'||
     typeof policy.inspect!=='function')throw new TypeError('ROLE_POLICY_REQUIRED');
  return async function handleIdentityRequest(request){
    try{
      if(!(request instanceof Request))fail('REQUEST_REQUIRED',400);
      const url=new URL(request.url);
      if(url.pathname!=='/api/demo/identity')fail('NOT_FOUND',404);
      if(request.method!=='GET')
        return reply({error:'METHOD_NOT_ALLOWED'},405,{allow:'GET'});
      const proof=await policy.issueProof(request);
      const profile=await policy.inspect(proof);
      return reply({identity:profile,mode:'LOCAL_SYNTHETIC_ONLY',
        registrationAvailable:false,realSellerVerified:false,
        realPayPalMerchantVerified:false,externalCalls:0});
    }catch(error){
      return reply({error:error instanceof QuoteApiError?error.code:'INTERNAL_ERROR'},
        error instanceof QuoteApiError?error.status:500);
    }
  };
}
