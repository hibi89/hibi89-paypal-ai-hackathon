/** WORKNOVA consented agentic transaction CONTROL-PLANE simulation.
 * Zero network/provider transport. Synthetic amounts, fixtures, evidence.
 * Not a PayPal-issued card, an escrow, a payout or authorization to pay.
 */
import { DatabaseSync } from 'node:sqlite';
import {createHash} from 'node:crypto';

const initial=()=>({version:1,mode:'SYNTHETIC_OFFLINE_SIMULATION',step:0,
 mandate:null,job:null,delivery:null,license:null,
 reservedMinor:0,paypalProviderCalls:0,realPayments:0,escrowCreated:false,
 events:[]});
const actions=['grant','negotiate','verify','license','review'];
/** Three bounded role turns; deterministic fixture, not a real LLM. */
export function simulateBoundedAgreement({askMinor,buyerCeilingMinor,sellerFloorMinor}) {
 const good=x=>Number.isSafeInteger(x)&&x>0&&x<=100_000_000;
 if(!good(askMinor)||!good(buyerCeilingMinor)||!good(sellerFloorMinor))throw TypeError('INVALID_PRICE');
 const transcript=[{role:'SELLER_AGENT',action:'OFFER',amountMinor:askMinor}];
 if(buyerCeilingMinor<sellerFloorMinor)return {status:'NO_AGREEMENT',transcript};
 const price=Math.min(buyerCeilingMinor,askMinor);
 if(price!==askMinor)transcript.push({role:'BUYER_AGENT',action:'COUNTER',amountMinor:price});
 const acceptRole=price===askMinor?'BUYER_AGENT':'SELLER_AGENT';
 transcript.push({role:acceptRole,action:'ACCEPT',amountMinor:price});
 return {status:'AGREED_OFFLINE',amountMinor:price,transcript,paymentAuthorized:false};
}

const stageNames=['NOT_STARTED','DELEGATION_CREATED','A2A_AGREED','DELIVERY_REVIEWED','SECOND_TRADE_PROPOSED','HUMAN_SETTLEMENT_GATE'];
const formatAmount=(n)=>(n/100).toFixed(2);
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const record=(s,type,headline,detail)=>s.events.push({number:s.events.length+1,type,headline,detail,source:'SYNTHETIC_LOCAL',providerCalls:0});
function apply(s,action,{now=()=>Date.now()}={}) {
 if(action==='reset')return initial();
 if(action==='revoke'){
  if(!s.mandate)return {error:'NO_MANDATE_TO_REVOKE'};
  if(s.mandate.revoked)return s;
  const next=structuredClone(s);next.mandate.revoked=true;
  record(next,'REVOKED','DELEGATION REVOKED','All subsequent actions blocked; reservations remain simulated, no funds moved');
  return next;
 }
 if(action==='unsafe')return {error:'GUARDRAIL_BLOCKED',reason:'PROPOSED_600_USD_EXCEEDS_500_USD_MANDATE',paymentAuthorized:false};
 const expected=actions.indexOf(action);
 if(expected===-1)return {error:'UNKNOWN_ACTION'};
 if(expected<s.step)return s; // exact replay: no extra reservation or event
 if(expected>s.step)return {error:'INVALID_STEP_ORDER',required:actions[s.step]};
 const next=structuredClone(s);
 const timestamp=now();
 if(action==='grant') {
   next.mandate={kind:'POLICY_TOKEN_NOT_CARD',owner:'SYNTHETIC_BUYER',agent:'worknova-delegated-agent',
    currency:'USD',limitMinor:50000,perTradeLimitMinor:30000,
    categories:['AI_SERVICES','SOFTWARE_LICENSE'],merchants:['mock-freelancer','mock-software'],
    expiresAt:timestamp+15*60*1000,revocable:true,revoked:false};
   record(next,'CONSENT','DELEGATED BUDGET  $500.00','15 min · $300/trade · allowlisted merchants · revocable');
 } else {
   if(!next.mandate||next.mandate.revoked||next.mandate.expiresAt<=timestamp)
     return {error:'MANDATE_NOT_ACTIVE'};
   if(action==='negotiate') {
     const deal=simulateBoundedAgreement({askMinor:36000,buyerCeilingMinor:30000,sellerFloorMinor:30000});
     if(deal.status!=='AGREED_OFFLINE')return {error:'A2A_NO_AGREEMENT'};
     const amount=deal.amountMinor;
     if(amount>next.mandate.perTradeLimitMinor||next.reservedMinor+amount>next.mandate.limitMinor)
       return {error:'PAYMENT_GUARD_DENIED'};
     next.job={type:'AI_SERVICES',merchant:'mock-freelancer',amountMinor:amount,
      transcript:deal.transcript,
      source:'DETERMINISTIC_AGENT_FIXTURE',agreement:'OFFLINE_AGREED',paymentAuthorized:false};
     next.reservedMinor+=amount;
     record(next,'A2A','BUYER AI × SELLER AI  /  $300.00','$360 offer → $300 counter → synthetic agreement; $300 budget reserved, no funds moved');
   } else if(action==='verify') {
     if(!next.job)return {error:'JOB_NOT_AGREED'};
     next.delivery={repository:'example/freelancer-demo',pr:42,
      commit:'a'.repeat(40),checks:[{name:'unit-tests',result:'SUCCESS'},{name:'security',result:'SUCCESS'}],
      evidence:'USER_SUPPLIED_FIXTURE_NOT_GITHUB_VERIFIED',decision:'READY_FOR_HUMAN_SETTLEMENT_REVIEW',
      escrowStatus:'NOT_CREATED',payoutStatus:'NOT_EXECUTED'};
     record(next,'DELIVERY','SYNTHETIC PR #42  /  CI PASS','Fixture-only check results; ready for human review, not escrow release');
   } else if(action==='license') {
     const deal=simulateBoundedAgreement({askMinor:20000,buyerCeilingMinor:16000,sellerFloorMinor:16000});
     if(deal.status!=='AGREED_OFFLINE')return {error:'LICENSE_NO_AGREEMENT'};
     const amount=deal.amountMinor;
     if(amount>next.mandate.perTradeLimitMinor||next.reservedMinor+amount>next.mandate.limitMinor)
       return {error:'PAYMENT_GUARD_DENIED'};
     next.license={type:'SOFTWARE_LICENSE',merchant:'mock-software',askingMinor:20000,amountMinor:16000,
      negotiation:'$200 ask → $160 agreed',transcript:deal.transcript,provider:'NOT_CONNECTED',checkout:'NOT_EXECUTED',
      source:'DETERMINISTIC_AGENT_FIXTURE'};
     next.reservedMinor+=amount;
     record(next,'PURCHASE','LICENSE DEAL  $200 → $160','Offline A2A agreement; no checkout, no real charge');
   } else if(action==='review') {
     if(!next.delivery||!next.license)return {error:'EVIDENCE_MISSING'};
     next.gate={status:'HUMAN_PROVIDER_AUTH_REQUIRED',settlement:'NOT_EXECUTED',
       payableMinor:next.reservedMinor,remainingMinor:next.mandate.limitMinor-next.reservedMinor,
       providerCalls:0,policyDigest:hash({mandate:next.mandate,job:next.job,delivery:next.delivery,license:next.license})};
     record(next,'GUARD','BOTH TRADES READY FOR GATED REVIEW','PayPal Sandbox Order/Capture would require verified merchant + separate owner approval');
   }
 }
 next.step++;
 return next;
}
export function createCommerceEngine({filename=':memory:',now=()=>Date.now()}={}){
 const db=new DatabaseSync(filename);
 db.exec('CREATE TABLE IF NOT EXISTS demo_state (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)');
 db.prepare('INSERT OR IGNORE INTO demo_state(id,payload) VALUES (1,?)').run(JSON.stringify(initial()));
 const get=()=>{
   const s=JSON.parse(db.prepare('SELECT payload FROM demo_state WHERE id=1').get().payload);
   return {...s,stage:stageNames[s.step],remainingMinor:s.mandate?s.mandate.limitMinor-s.reservedMinor:0,
     genuinePayPalAuthorization:false,disclosure:'SIMULATED / NO PAYPAL API / NO GEMINI API / NO ESCROW / NO CARD'};
 };
 const step=(action)=>{
   if(typeof action!=='string'||action.length>30)return {status:400,...{error:'INVALID_ACTION'}};
   db.exec('BEGIN IMMEDIATE');
   try{
     const before=JSON.parse(db.prepare('SELECT payload FROM demo_state WHERE id=1').get().payload);
     const next=apply(before,action,{now});
     if(next.error){db.exec('ROLLBACK');return {status:409,...next};}
     db.prepare('UPDATE demo_state SET payload=? WHERE id=1').run(JSON.stringify(next));
     db.exec('COMMIT');return {status:200,...get()};
   } catch(e){db.exec('ROLLBACK');throw e;}
 };
 return {get,step,close:()=>db.close()};
}
export const SCENARIO_ACTIONS=Object.freeze(actions);
export {formatAmount};
