// No outbound requests. Only an explicit two-key operator authorization can
// construct a Worker-compatible PayPal SANDBOX OAuth + GET-only transport.
// This is a CODE gate; strings cannot attest actual user authority or ownership.
import {createWorkerSandboxOrderGetTransport} from './worker_sandbox_get_transport.mjs';
const MERCHANT=/^[A-Za-z0-9]{13}$/;
const fail=code=>{throw Error(code);};
const APPROVAL='OWNER_APPROVED_SANDBOX_ORDER_GET_ONLY';
const NETWORK='OWNER_APPROVED_SANDBOX_OAUTH_AND_GET_ONLY';
export function prepareWorkerSandboxGetGate({env,fetchImpl}={}){
 const approval=env?.PRIVATE_SANDBOX_ORDER_GET_OPT_IN;
 const network=env?.PRIVATE_SANDBOX_GET_NETWORK_OPT_IN;
 const requested=approval!==undefined||network!==undefined;
 if(!requested)return Object.freeze({enabled:false,transport:null,merchantId:null,
  actualRemoteProviderVerified:false,providerCalls:0});
 if(approval!==APPROVAL||network!==NETWORK)
  fail('SANDBOX_GET_DOUBLE_APPROVAL_REQUIRED');
 const merchantId=env.PRIVATE_SANDBOX_MERCHANT_ID;
 if(!MERCHANT.test(merchantId??''))
  fail('SANDBOX_MERCHANT_BINDING_REQUIRED');
 const transport=createWorkerSandboxOrderGetTransport({
  clientId:env.PRIVATE_SANDBOX_CLIENT_ID,
  clientSecret:env.PRIVATE_SANDBOX_CLIENT_SECRET,
  fetchImpl,networkApproved:true
 });
 return Object.freeze({enabled:true,transport,merchantId,
  actualRemoteProviderVerified:false,providerCalls:0});
}
