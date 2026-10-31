// P0 real-provider dependency inventory. Offline and intentionally non-authorizing.
// NEVER read/print secret values, send HTTP, or infer an account is free/validated.
const NAMES=Object.freeze([
 'PAYPAL_SANDBOX_CLIENT_ID','PAYPAL_SANDBOX_CLIENT_SECRET','GEMINI_API_KEY'
]);
export function inspectP0ProviderReadiness(env={}){
 if(!env||typeof env!=='object'||Array.isArray(env))throw new TypeError('INVALID_ENV_MAP');
 const present=Object.fromEntries(NAMES.map(name=>
  [name,typeof env[name]==='string'&&env[name].trim().length>0]
 ));
 const paypalLocal=present.PAYPAL_SANDBOX_CLIENT_ID&&present.PAYPAL_SANDBOX_CLIENT_SECRET;
 const aiLocal=present.GEMINI_API_KEY;
 return Object.freeze({
  mode:'LOCAL_VARIABLE_NAMES_ONLY_NO_NETWORK',
  status:'EXTERNAL_PROVIDER_EVIDENCE_REQUIRED',
  canCallPayPal:false,
  canCallAI:false,
  mayDeploy:false,
  approvalGranted:false,
  credentialsNeverEmitted:true,
  paypal:Object.freeze({
   sandboxLocalConfiguration:paypalLocal?'LOCALLY_PRESENT_NOT_VERIFIED':'MISSING',
   businessAccount:'NOT_VERIFIED',personalAccount:'NOT_VERIFIED',
   OAuth:'NOT_TESTED',ordersGet:'NOT_TESTED',capture:'NOT_TESTED',
   // PayPal API documentation distinguishes direct-merchant first-party requests
   // from marketplace/platform requests on behalf of other merchants.
   // A Sandbox app + OAuth token is NOT a third-party seller authorization.
   merchantAuthority:Object.freeze({
    directFirstParty:'NOT_VERIFIED',
    platformThirdParty:'NOT_VERIFIED',
    appMerchantOwnership:'NOT_VERIFIED',
    sellerAccountOwnership:'NOT_VERIFIED',
    requiresDistinctPlatformPermission:true,
    localVariablesEstablishAuthorization:false
   })
  }),
  ai:Object.freeze({
   candidate:'GEMINI_API_FREE_TIER_IF_ACCOUNT_ELIGIBLE',
   localConfiguration:aiLocal?'LOCALLY_PRESENT_NOT_VERIFIED':'MISSING',
   freeTierEligibility:'NOT_VERIFIED',
   modelAvailability:'NOT_VERIFIED',
   generation:'NOT_TESTED'
  }),
  missingVariableNames:Object.freeze(NAMES.filter(name=>!present[name])),
  blockers:Object.freeze([
   'OWNER_APPROVAL_FOR_REAL_PROVIDER_ACCOUNTS_AND_CALLS_REQUIRED',
   'PAYPAL_BUSINESS_AND_PERSONAL_SANDBOX_ACCOUNT_PROOF_REQUIRED',
   'PAYPAL_APP_MERCHANT_OWNERSHIP_PROOF_REQUIRED',
   'PAYPAL_PLATFORM_THIRD_PARTY_MERCHANT_AUTHORIZATION_NOT_VERIFIED',
   'PAYPAL_OAUTH_AND_ORDER_GET_PROOF_REQUIRED',
   'AI_FREE_TIER_ELIGIBILITY_AND_ONE_REAL_GENERATION_REQUIRED',
   'NO_REMOTE_ENDPOINT_OR_SECRET_ACCEPTED_IN_THIS_COMMAND'
  ]),
  next:'READ_docs/technical/PPL_P0_REAL_PROVIDER_UNBLOCK_20261024.md'
 });
}
