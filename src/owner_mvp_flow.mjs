// Owner-only one-process MVP: real Gemini skill matching -> human-approved
// synthetic quote -> PayPal Sandbox buyer approval -> authorized Capture -> GET.
// This module is NOT HTTP authentication, public hosting or a PayPal Live client.
import {createOwnerMarketplaceAiService} from './owner_marketplace_ai_service.mjs';
import {createOwnerCheckoutHostSession} from './owner_checkout_host_session.mjs';
import {createOwnerPilotCheckoutCoordinator} from './owner_pilot_checkout_coordinator.mjs';
import {validateMarketplaceBrief} from './gemini_marketplace_provider.mjs';

export const MVP_BRIEF='Build a fictional ecommerce website with PayPal checkout and QA testing.';
export const MVP_AMOUNT_MINOR=150;
const quoteId='operator_mvp_01',actorId='local_operator';
const reject=code=>{const e=new Error(code);e.code=code;throw e;};

export function createOwnerMvpFlow({
  ledger,aiStore,sessionStore,geminiProvider,paypalTransport,
  merchantId,publicOrigin,authorizeStage
}={}){
  if(typeof ledger?.insertQuote!=='function'||
    typeof ledger?.approve!=='function'||typeof ledger?.get!=='function'||
    typeof aiStore?.claim!=='function'||typeof sessionStore?.issue!=='function'||
    typeof geminiProvider!=='function'||paypalTransport===undefined)
    reject('MVP_COMPONENTS_REQUIRED');
  if(typeof paypalTransport?.createOwnerPilotOrderOnce!=='function'||
    typeof authorizeStage!=='function'||!(/^[A-Za-z0-9]{13}$/).test(merchantId??''))
    reject('MVP_OPERATOR_CONFIGURATION_REQUIRED');
  let origin;
  try{origin=new URL(publicOrigin);}
  catch{reject('MVP_PUBLIC_HTTPS_ORIGIN_REQUIRED');}
  if(origin.protocol!=='https:'||origin.origin!==publicOrigin||
    origin.username||origin.password||origin.port||origin.search||origin.hash||
    !origin.hostname.includes('.')||origin.hostname==='localhost'||
    origin.hostname.endsWith('.localhost')||
    origin.hostname.endsWith('.local')||origin.hostname.endsWith('.internal')||
    /^(\d+\.){3}\d+$/.test(origin.hostname))
    reject('MVP_PUBLIC_HTTPS_ORIGIN_REQUIRED');
  // Private, non-serializable identity: never taken from a URL, cookie or body.
  const handle=Object.freeze(Object.create(null));
  const trusted=async supplied=>supplied===handle?
    {verified:true,actorId,merchantId}:null;
  const approve=async detail=>(await authorizeStage(Object.freeze(detail)))===true;
  const ai=createOwnerMarketplaceAiService({
    store:aiStore,provider:geminiProvider,resolveTrustedActor:trusted,
    authorizeRequest:async action=>approve({...action,amountMinor:null})
  });
  const host=createOwnerCheckoutHostSession({
    ledger,sessionStore,
    resolveTrustedPrincipal:trusted,
    authorizeSessionIssue:async action=>approve(action)
  });
  const coordinator=createOwnerPilotCheckoutCoordinator({
    ledger,transport:paypalTransport,
    authorizeAction:async action=>approve(action)
  });
  let matches=null,approved=false,checkout=null,opened=false;
  const input=async()=>{
    if(!checkout)reject('MVP_CHECKOUT_NOT_ISSUED');
    const session=await host.resolveTrustedCheckout(checkout);
    return {quoteId:session.quoteId,actorId:session.actorId,
      merchantId:session.merchantId,publicOrigin,sessionProof:session.sessionProof};
  };
  async function classify(){
    if(matches)reject('MVP_AI_ALREADY_CLASSIFIED');
    const brief=validateMarketplaceBrief(MVP_BRIEF);
    const existing=await ledger.get(quoteId);
    if(existing)reject('MVP_EXISTING_QUOTE_REVIEW_REQUIRED');
    // Quote is persistent: one fixed quote per private ledger, even across runs.
    await ledger.insertQuote({id:quoteId,ownerId:actorId,
      merchantId,version:1});
    matches=await ai.classify({sessionHandle:handle,brief});
    if(matches.requestedSkills.length===0)reject('MVP_AI_SKILLS_EMPTY');
    if(!matches.profiles.some(x=>x.eligible))
      reject('MVP_NO_MATCHING_SYNTHETIC_PROFILE');
    return Object.freeze({skills:matches.requestedSkills,
      eligibleProfiles:matches.profiles.filter(p=>p.eligible).map(p=>p.id),
      priceSource:'HUMAN_FIXED_SYNTHETIC_AMOUNT_NOT_AI',
      paypalActionPerformed:false});
  }
  async function approveQuote(){
    if(!matches||approved)reject('MVP_MATCH_BEFORE_APPROVAL_REQUIRED');
    const quote=await ledger.get(quoteId);
    if(!quote||quote.status!=='PROPOSED'||quote.version!==1||
       quote.ownerId!==actorId||quote.merchantId!==merchantId)
      reject('MVP_QUOTE_CHANGED');
    const ok=await approve({action:'APPROVE_SYNTHETIC_USD_1_50',
      actorId,merchantId,quoteId,quoteVersion:quote.version,
      amountMinor:MVP_AMOUNT_MINOR,currency:'USD'});
    if(!ok)reject('MVP_PRICE_HUMAN_APPROVAL_REQUIRED');
    // CAS atomic approval; the AI suggestion never owns the payment amount.
    await ledger.approve({id:quoteId,expectedVersion:1,
      actorId,amountMinor:MVP_AMOUNT_MINOR});
    approved=true;
    return Object.freeze({status:'APPROVED',amountMinor:MVP_AMOUNT_MINOR,
      currency:'USD',amountSource:'HUMAN_ONLY'});
  }
  async function createOrder(){
    if(!approved||checkout)reject('MVP_HUMAN_APPROVAL_REQUIRED');
    const issued=await host.issue({hostLoginHandle:handle,quoteId});
    checkout=issued.handle;
    const result=await coordinator.openOwnerOrder(await input());
    if(result.status==='BUYER_APPROVAL_PENDING'||result.status==='ORDER_APPROVED')
      opened=true;
    return result;
  }
  async function refresh(){
    if(!opened)reject('MVP_ORDER_NOT_OPENED');
    return coordinator.refreshOwnerOrder(await input());
  }
  async function capture(){
    if(!opened)reject('MVP_ORDER_NOT_OPENED');
    const status=await refresh();
    if(status.status!=='ORDER_APPROVED')
      return Object.freeze({status:status.status,
        paymentState:'NOT_CONFIRMED',capturePerformed:false,retryPost:false});
    // PayPal GET buyer APPROVED first; then a SECOND human consent,
    // followed by internal coordinator revalidation, claim and provider GET.
    return coordinator.captureOwnerOrder(await input());
  }
  async function reconcile(){
    if(!opened)reject('MVP_ORDER_NOT_OPENED');
    return coordinator.reconcileOwnerCapture(await input());
  }
  return Object.freeze({classify,approveQuote,createOrder,refresh,capture,
    reconcile,mode:'PRIVATE_OPERATOR_SINGLE_PROCESS_MVP',
    publicHttpEnabled:false,productionAuthImplemented:false,
    livePaymentEnabled:false,automaticCapture:false});
}
