// Pure owner-pilot Orders v2 CREATE payload planner: NO network or payment authority.
// Accept only a pre-approved synthetic USD quote and server-verified session.
// A future server must independently verify session ownership in durable storage.
// This is NOT a public endpoint, a real checkout or permission to POST.
import {approvedAmount, planOrder} from './payment_contract.mjs';
import {planBuyerCheckoutCallbacks} from './paypal_checkout_callback_contract.mjs';

const MERCHANT_ID=/^[A-Za-z0-9]{13}$/;
const PILOT_MAX_MINOR=200; // sandbox virtual USD 1.00–2.00 only.
const bad=code=>{const e=new Error(code);e.code=code;throw e;};

export function planOwnerSandboxPilotCheckout({quote,publicOrigin,serverSession}={}){
  if(quote?.status!=='APPROVED')bad('PILOT_APPROVED_QUOTE_REQUIRED');
  // Do not confuse local fixture merchant names with a PayPal merchant account ID.
  if(!MERCHANT_ID.test(quote?.merchantId??''))
    bad('PILOT_REAL_SANDBOX_MERCHANT_ID_REQUIRED');
  const amountMinor=approvedAmount(quote);
  if(amountMinor>PILOT_MAX_MINOR)bad('PILOT_AMOUNT_LIMIT_EXCEEDED');
  // This planning helper does not attest that the merchant actually belongs to
  // the OAuth REST app or that the callback URL is running on a trusted server.
  const callback=planBuyerCheckoutCallbacks({quote,publicOrigin,serverSession});
  const base=planOrder(quote);
  const body=Object.freeze({
    intent:base.body.intent,
    purchase_units:base.body.purchase_units,
    payment_source:Object.freeze({
      paypal:Object.freeze({experience_context:callback.experienceContext})
    })
  });
  return Object.freeze({
    mode:'OFFLINE_SANDBOX_PILOT_PLAN_NOT_AUTHORIZED_TO_EXECUTE',
    provider:'PAYPAL_SANDBOX_ONLY',networkAllowed:false,
    buyerReturnIsProof:false,captureApproved:false,
    requiresDurableFirstClaim:true,requiresSeparateOwnerExecutionApproval:true,
    method:base.method,path:base.path,requestId:base.requestId,
    amountMinor,body
  });
}
