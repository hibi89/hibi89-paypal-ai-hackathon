// D15 synthetic-only composition harness. NO remote network, no live credentials, no HTTP router.
// Tests a real Sandbox transport module against an in-process HTTP simulator and D1-shaped DB.
// Never deploy or reuse this fixture harness with a real provider account.
import { createSandboxTransport } from './paypal_sandbox_transport.mjs';
import { createD1SandboxGetReconciler } from './d1_sandbox_get_reconcile.mjs';

export class OfflineHarnessError extends Error {
  constructor(code){super(code);this.name='OfflineHarnessError';this.code=code;}
}
const bad=(condition,code)=>{if(condition)throw new OfflineHarnessError(code);};
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(x);
const BASE='https://api-m.sandbox.paypal.com';

// Orders are entirely synthetic fixtures, not data from an HTTP request to the harness.
// The caller never injects a fetch function; all URLs are routed to local responses.
export function createOfflineSandboxD1ReadHarness({db,resolveTrustedSession,orders}={}){
  bad(!db||typeof db.prepare!=='function','D1_SHAPED_DB_REQUIRED');
  bad(typeof resolveTrustedSession!=='function','SERVER_SESSION_RESOLVER_REQUIRED');
  bad(!orders||typeof orders!=='object'||Array.isArray(orders),
    'SYNTHETIC_ORDERS_REQUIRED');
  const fixtures=new Map();
  for(const [id,order] of Object.entries(orders)){
    bad(!validId(id)||order?.id!==id,'INVALID_SYNTHETIC_ORDER');
    fixtures.set(id,structuredClone(order));
  }
  const calls={token:0,orderGet:0,rejected:0};
  const fetchImpl=async(url,{method}={})=>{
    // No external request, regardless of global fetch availability.
    if(url===BASE+'/v1/oauth2/token'&&method==='POST'){
      calls.token++;
      return {status:200,json:async()=>({access_token:'OFFLINE_SYNTHETIC_TOKEN',token_type:'Bearer'})};
    }
    const match=new RegExp('^'+BASE.replaceAll('.','\\.')+'/v2/checkout/orders/([A-Za-z0-9_-]{1,64})$').exec(url);
    if(match&&method==='GET'){
      calls.orderGet++;
      const found=fixtures.get(match[1]);
      return {status:found?200:404,json:async()=>structuredClone(found??{error:'NOT_FOUND'})};
    }
    calls.rejected++;
    throw new OfflineHarnessError('OFFLINE_NO_REMOTE_OR_PAYMENT_POST');
  };
  const transport=createSandboxTransport({
    clientId:'OFFLINE_SYNTHETIC_ID',
    clientSecret:'OFFLINE_SYNTHETIC_SECRET',
    fetchImpl
  });
  const trustedSession=async request=>{
    const principal=await resolveTrustedSession(request);
    // The fixture harness deliberately has no authentication provider.
    // The resolver MUST be supplied by test-side trusted code.
    if(principal?.verified!==true)return null;
    return principal;
  };
  const reconcile=createD1SandboxGetReconciler({
    db,resolveSession:trustedSession,transport
  });
  return Object.freeze({
    mode:'OFFLINE_SIMULATED_GET_ONLY',
    refreshOrder:input=>reconcile.refreshOrder(input),
    reconcileCapture:input=>reconcile.reconcileCapture(input),
    audit:()=>Object.freeze({...calls,networkRequests:0,paymentPostRequests:0})
  });
}
