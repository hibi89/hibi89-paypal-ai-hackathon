// PayPal Sandbox transport boundary — intentionally NOT wired into public HTTP routes.
// The caller must first atomically claim the operation in the persistent ledger.
// Only an EXPLICIT injected HTTP implementation is allowed; no implicit global fetch.
// Never store/log OAuth access tokens or credentials. No Live PayPal capability.
import { planOrder, planCapture, requestKey, approvedAmount, paypalRequestHeaderId } from './payment_contract.mjs';
import { planOwnerSandboxPilotCheckout } from './sandbox_pilot_checkout_plan.mjs';
import {boundServerSessionFromStoredProof} from './pilot_checkout_session_store.mjs';

const BASE = 'https://api-m.sandbox.paypal.com';
// Bound every OAuth, order and capture request. POST timeout is UNKNOWN, never retried.
const REQUEST_TIMEOUT_MS = 10_000;
const ORDER_ID = /^[a-zA-Z0-9_-]{1,64}$/;
export class SandboxTransportError extends Error {
  constructor(code) { super(code); this.name='SandboxTransportError'; this.code=code; }
}
const reject=(bad,code)=>{if(bad)throw new SandboxTransportError(code);};
const safeText=(x)=>typeof x==='string' && x.length>0 && x.length<256;
const merchantBound=(quote)=>{
  reject(typeof quote?.merchantId!=='string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(quote.merchantId),
    'SANDBOX_MERCHANT_BINDING_REQUIRED');
};
function approvalLink(links, orderId) {
  reject(!Array.isArray(links),'APPROVAL_LINK_MISSING');
  const match=links.find(x=>x?.rel==='payer-action'||x?.rel==='approve');
  reject(!safeText(match?.href),'APPROVAL_LINK_MISSING');
  let url;
  try { url=new URL(match.href); }
  catch { throw new SandboxTransportError('UNSAFE_APPROVAL_LINK'); }
  reject(url.protocol!=='https:' ||
    !['www.sandbox.paypal.com','sandbox.paypal.com'].includes(url.hostname) ||
    url.port!=='' || url.username!=='' || url.password!=='' ||
    url.pathname!=='/checkoutnow' || url.hash!=='' ||
    url.searchParams.getAll('token').length!==1 ||
    url.searchParams.get('token')!==orderId,
  'UNSAFE_APPROVAL_LINK');
  // A real PayPal host is not sufficient: this payer-action link must point
  // to the exact order created by our approved quote, not some other token.
  return url.href;
}
function claimValidated(quote, claim, operation) {
  // Validate seller identity before even acquiring an OAuth token or issuing POST.
  merchantBound(quote);
  const cents=approvedAmount(quote);
  reject(claim?.action!=='FIRST_CLAIM_ONLY_NO_PROVIDER_CALL' ||
    claim?.attempt?.operation!==operation ||
    claim?.attempt?.quoteId!==quote.id ||
    claim?.attempt?.quoteVersion!==quote.version ||
    claim?.attempt?.merchantId!==quote.merchantId ||
    claim?.attempt?.requestId!==requestKey(quote,operation) ||
    claim?.attempt?.amountMinor!==cents ||
    claim?.attempt?.currency!==quote.currency ||
    claim?.attempt?.state!=='IN_FLIGHT',
  'DURABLE_FIRST_CLAIM_REQUIRED');
}
function verifiedOrder(quote, data, id) {
  const cents=approvedAmount(quote);
  const units=data?.purchase_units;
  reject(!data || data.id!==id ||
    data.intent!=='CAPTURE' ||
    !['CREATED','PAYER_ACTION_REQUIRED','APPROVED','COMPLETED'].includes(data.status) ||
    !Array.isArray(units) || units.length!==1 ||
    units[0]?.reference_id!==quote.id ||
    units[0]?.payee?.merchant_id!==quote.merchantId ||
    units[0]?.amount?.currency_code!=='USD' ||
    units[0]?.amount?.value!==(cents/100).toFixed(2),
  'SANDBOX_ORDER_MISMATCH');
  return data;
}
export function createSandboxTransport(options={}) {
  reject(Object.hasOwn(options,'baseUrl') || Object.hasOwn(options,'environment'),
    'LIVE_ENVIRONMENT_OVERRIDE_FORBIDDEN');
  const {clientId,clientSecret,fetchImpl}=options;
  reject(!safeText(clientId)||!safeText(clientSecret)||
    typeof fetchImpl!=='function',
  'PRIVATE_CREDENTIALS_AND_EXPLICIT_TRANSPORT_REQUIRED');
  async function fetchJson(path,{method='GET',token,body,requestId}={}) {
    reject(!path.startsWith('/') || path.startsWith('//') ||
      path.includes('://') || path.includes('..') ||
      !(/^\/v1\/oauth2\/token$/.test(path) ||
        /^\/v2\/checkout\/orders(?:\/[A-Za-z0-9_-]{1,64}(?:\/capture)?)?$/.test(path)),
    'UNAPPROVED_SANDBOX_PATH');
    const url=BASE+path;
    const headers={'accept':'application/json'};
    if (token) headers.authorization='Bearer '+token;
    if (requestId) headers['PayPal-Request-Id']=paypalRequestHeaderId(requestId);
    if (method==='POST') headers['content-type']=path.includes('/oauth2/')
      ? 'application/x-www-form-urlencoded':'application/json';
    if (path==='/v1/oauth2/token')
      headers.authorization='Basic '+Buffer.from(clientId+':'+clientSecret).toString('base64');
    // Even HTTP 5xx or unreadable success bodies can follow a committed POST.
    // Never signal that a retry is safe; durable caller must GET-first.
    const paymentPost=method==='POST' && path.startsWith('/v2/checkout/orders');
    let response;
    try {
      response=await fetchImpl(url,{
        method, headers, redirect:'error',
        signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        ...(method==='POST'?{body:body??'{}'}:{}),
      });
    }catch {
      throw new SandboxTransportError(paymentPost?
        'SANDBOX_POST_OUTCOME_UNKNOWN':
        method==='POST'?'SANDBOX_OAUTH_NETWORK_ERROR':'SANDBOX_GET_NETWORK_ERROR');
    }
    if(!response || typeof response.status!=='number' ||
        response.status<200 || response.status>=300)
      throw new SandboxTransportError(paymentPost?
        'SANDBOX_POST_OUTCOME_UNKNOWN':'SANDBOX_HTTP_FAILURE');
    try { return await response.json(); }
    catch { throw new SandboxTransportError(paymentPost?
      'SANDBOX_POST_OUTCOME_UNKNOWN':'SANDBOX_MALFORMED_JSON'); }
  }
  async function accessToken() {
    const data=await fetchJson('/v1/oauth2/token',{
      method:'POST',body:'grant_type=client_credentials',
    });
    reject(!safeText(data?.access_token) || data.token_type!=='Bearer',
      'SANDBOX_OAUTH_INVALID_RESPONSE');
    return data.access_token;
  }
  async function getOrder(quote,id) {
    reject(!ORDER_ID.test(id),'INVALID_ORDER_ID');
    approvedAmount(quote);
    merchantBound(quote);
    const token=await accessToken();
    const data=await fetchJson('/v2/checkout/orders/'+encodeURIComponent(id),{token});
    return verifiedOrder(quote,data,id);
  }
  async function createFromPlan(quote,planned) {
    // This helper is never exported. Only an explicit, validated first-claim
    // call from the two entrypoints below can reach provider OAuth/Orders.
    const token=await accessToken();
    const created=await fetchJson(planned.path,{
      method:'POST',token,body:JSON.stringify(planned.body),requestId:planned.requestId,
    });
    reject(!ORDER_ID.test(created?.id) ||
      !['CREATED','PAYER_ACTION_REQUIRED','APPROVED'].includes(created.status),
    'SANDBOX_CREATE_UNVERIFIED');
    const payerUrl=approvalLink(created.links,created.id);
    // Mandatory server GET to validate reference/amount before returning approval URL.
    const checked=await getOrder(quote,created.id);
    reject(!['CREATED','PAYER_ACTION_REQUIRED','APPROVED'].includes(checked.status),
      'SANDBOX_CREATE_GET_STATUS_CONFLICT');
    return {orderId:created.id,payerUrl,orderStatus:checked.status,
      paymentState:'NOT_PAID',source:'SANDBOX_TRANSPORT'};
  }
  async function createOrderOnce(quote,claim) {
    claimValidated(quote,claim,'create');
    return createFromPlan(quote,planOrder(quote));
  }
  async function createOwnerPilotOrderOnce(quote,claim,{publicOrigin,sessionProof}={}) {
    // A caller-supplied {verified:true} JSON is NEVER adequate payment authority.
    // Resolve an opaque, DB-backed branded proof; expiration/revocation are
    // rechecked before any token fetch or Orders POST.
    const serverSession=boundServerSessionFromStoredProof(sessionProof,quote);
    claimValidated(quote,claim,'create');
    const plan=planOwnerSandboxPilotCheckout({quote,publicOrigin,serverSession});
    return createFromPlan(quote,plan);
  }
  async function captureOnce(quote,claim,orderId) {
    claimValidated(quote,claim,'capture');
    // Verification precedes capture. Browser return params do not count as APPROVED.
    const checked=await getOrder(quote,orderId);
    const planned=planCapture(quote,checked);
    reject(planned.action!=='CAPTURE_ONCE',
      'SANDBOX_CAPTURE_NOT_AUTHORIZED');
    const token=await accessToken();
    const payload=await fetchJson(planned.path,{
      method:'POST',token,requestId:planned.requestId,body:'{}',
    });
    reject(payload?.id!==orderId,'SANDBOX_CAPTURE_ORDER_MISMATCH');
    // A successful POST is not payment proof; caller must GET and reconcile.
    return {orderId,paymentState:'UNKNOWN_AWAITING_GET',postStatus:payload.status};
  }
  // Only a fresh authenticated PayPal GET of the order can prove completion.
  // Do not trust an order returned by the browser or a capture POST body.
  async function getCaptureProof(quote,orderId) {
    const order=await getOrder(quote,orderId);
    if(order.status!=='COMPLETED') return {order,capture:null};
    const captures=order.purchase_units?.[0]?.payments?.captures;
    if(!Array.isArray(captures) || captures.length!==1)
      return {order,capture:null};
    const c=captures[0];
    const merchant=order.purchase_units[0]?.payee?.merchant_id;
    reject(quote.merchantId && merchant!==quote.merchantId,
      'SANDBOX_MERCHANT_MISMATCH');
    reject(!ORDER_ID.test(c?.id) || c.status!=='COMPLETED' ||
      c.amount?.currency_code!==quote.currency ||
      c.amount?.value!==(approvedAmount(quote)/100).toFixed(2),
    'SANDBOX_CAPTURE_PROOF_MISMATCH');
    return {order,capture:{
      id:c.id,orderId:order.id,status:c.status,amount:c.amount,
    }};
  }
  return Object.freeze({createOrderOnce,createOwnerPilotOrderOnce,getOrder,captureOnce,getCaptureProof,
    sandboxBase:BASE,mode:'SANDBOX_ONLY',realAccessTested:false});
}
