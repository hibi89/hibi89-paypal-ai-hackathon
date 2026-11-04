// Part 2 A2A agent protocol: typed, bounded, pluggable buyer/seller roles.
// This module has NO PayPal access, financial entitlement, model transport or HTTP routes.
import {createHash} from 'node:crypto';

const MONEY=x=>Number.isSafeInteger(x)&&x>=100&&x<=1_000_000;
const reject=code=>{const e=new TypeError(code);e.code=code;throw e;};
const signature=messages=>createHash('sha256')
  .update(JSON.stringify(messages)).digest('hex');
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const allowedFields=new Set(['action','amountMinor','reason']);
function validateReply(reply,role,last){
 if(!object(reply)||Object.keys(reply).some(k=>!allowedFields.has(k)))reject('INVALID_AGENT_MESSAGE');
 if(!['OFFER','COUNTER','ACCEPT','REJECT'].includes(reply.action))reject('INVALID_AGENT_ACTION');
 if(reply.action==='REJECT'){
  if(typeof reply.reason!=='string'||reply.reason.length<3||reply.reason.length>100||
    Object.hasOwn(reply,'amountMinor'))reject('INVALID_AGENT_REJECTION');
  return {role,action:'REJECT',reason:reply.reason};
 }
 if(!MONEY(reply.amountMinor)||Object.hasOwn(reply,'reason'))reject('INVALID_AGENT_AMOUNT');
 if((last===null&&reply.action!=='OFFER')||
   (last!==null&&reply.action==='OFFER'))reject('INVALID_AGENT_TRANSITION');
 if(reply.action==='ACCEPT'){
  if(last?.role===role||last?.action==='REJECT'||reply.amountMinor!==last?.amountMinor)
    reject('ACCEPTANCE_MUST_MATCH_LATEST_OPPOSING_OFFER');
 }
 return {role,action:reply.action,amountMinor:reply.amountMinor};
}
function noPayment({status,reason,messages}){
 const transcript=structuredClone(messages);
 return Object.freeze({
  status,reason,messages:transcript,transcriptSha256:signature(transcript),
  agreedMinor:status==='AGREED_OFFLINE_CONTRACT'?transcript.at(-1)?.amountMinor:null,
  paymentAuthorized:false,providerCalls:0,paypalCapturePerformed:false,
  requiredExternalFundingAuthorization:true,source:'PLUGGABLE_ROLE_PROTOCOL',
 });
}
/**
 * Two distinct callbacks may be backed by offline policies or, after separate
 * authorization, LLM adapters. Neither callback can authorize a payment.
 * Timeout is per turn; an external adapter must separately honor signal for cancellation.
 */
export async function runBoundedA2A({
 buyerAgent,sellerAgent,buyerMaxMinor,sellerMinMinor,
 maxTurns=8,turnTimeoutMs=1000
}={}){
 if(typeof buyerAgent!=='function'||typeof sellerAgent!=='function'||
    !MONEY(buyerMaxMinor)||!MONEY(sellerMinMinor)||
    !Number.isInteger(maxTurns)||maxTurns<2||maxTurns>12||
    !Number.isInteger(turnTimeoutMs)||turnTimeoutMs<50||turnTimeoutMs>10_000)
  reject('INVALID_A2A_PROTOCOL_CONFIGURATION');
 const messages=[];
 for(let turn=0;turn<maxTurns;turn++){
  const role=turn%2===0?'seller':'buyer';
  const callback=role==='seller'?sellerAgent:buyerAgent;
  const last=messages.at(-1)??null;
  const view=Object.freeze({
   role,turn:turn+1,ownLimitMinor:role==='buyer'?buyerMaxMinor:sellerMinMinor,
   lastOffer:last?Object.freeze({...last}):null,
   // A bounded, historical snapshot, not a mutable authority object.
   history:Object.freeze(messages.map(m=>Object.freeze({...m}))),
  });
  const controller=new AbortController();
  let timer;
  let reply;
  try{
   reply=await Promise.race([
    Promise.resolve().then(()=>callback({...view,signal:controller.signal})),
    new Promise((_,fail)=>{timer=setTimeout(()=>{
      controller.abort();
      fail(Object.assign(new Error('AGENT_RESPONSE_TIMEOUT'),{code:'AGENT_RESPONSE_TIMEOUT'}));
    },turnTimeoutMs);})
   ]);
  }catch(e){
   return noPayment({status:'BLOCKED',
    reason:e?.code==='AGENT_RESPONSE_TIMEOUT'?'AGENT_RESPONSE_TIMEOUT':'AGENT_EXECUTION_FAILED',
    messages});
  }finally{clearTimeout(timer);}
  let item;
  try{
   item=validateReply(reply,role,last);
   // Only the owner's own role bound can be used by a role's policy.
   if(item.amountMinor!==undefined&&item.action!=='ACCEPT'&&
      ((role==='buyer'&&item.amountMinor>buyerMaxMinor)||
       (role==='seller'&&item.amountMinor<sellerMinMinor)))
    reject('AGENT_OFFER_VIOLATES_ROLE_POLICY');
   if(item.action==='ACCEPT'&&
      (item.amountMinor>buyerMaxMinor||item.amountMinor<sellerMinMinor))
    reject('A2A_ACCEPTANCE_OUT_OF_BOUNDS');
  }catch(e){
   return noPayment({status:'BLOCKED',reason:e?.code||'INVALID_AGENT_OUTPUT',messages});
  }
  messages.push(item);
  if(item.action==='REJECT')
   return noPayment({status:'NO_AGREEMENT',reason:item.reason,messages});
  if(item.action==='ACCEPT')
   return noPayment({status:'AGREED_OFFLINE_CONTRACT',reason:'BOTH_ROLE_POLICIES_SATISFIED',messages});
 }
 return noPayment({status:'NO_AGREEMENT',reason:'MAX_AGENT_TURNS',messages});
}

/** Injection-free offline agents for protocol contract tests. */
export function createOfflineRoleAgents({
 sellerOpeningMinor=34500,sellerCounterMinor=29900
}={}){
 if(!MONEY(sellerOpeningMinor)||!MONEY(sellerCounterMinor))
  reject('INVALID_SYNTHETIC_AGENT_CONFIGURATION');
 const sellerAgent=async({history,lastOffer,ownLimitMinor})=>{
  if(history.length===0)
   return {action:'OFFER',amountMinor:Math.max(sellerOpeningMinor,ownLimitMinor)};
  const offered=lastOffer.amountMinor;
  if(offered>=sellerCounterMinor&&offered>=ownLimitMinor)
   return {action:'ACCEPT',amountMinor:offered};
  return {action:'COUNTER',amountMinor:Math.max(sellerCounterMinor,ownLimitMinor)};
 };
 const buyerAgent=async({history,lastOffer,ownLimitMinor})=>{
  const offered=lastOffer.amountMinor;
  if(offered<=ownLimitMinor)
   return {action:'ACCEPT',amountMinor:offered};
  if(history.some(m=>m.role==='buyer'))
   return {action:'REJECT',reason:'SELLER_PRICE_EXCEEDS_DELEGATED_CEILING'};
  return {action:'COUNTER',amountMinor:Math.min(29000,ownLimitMinor)};
 };
 return Object.freeze({buyerAgent,sellerAgent,mode:'DETERMINISTIC_LOCAL_FIXTURE'});
}
