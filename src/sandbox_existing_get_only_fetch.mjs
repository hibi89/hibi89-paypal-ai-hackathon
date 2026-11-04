// A second independent deny-by-default HTTP boundary for PRIVATE operator
// reconciliation. It permits only Sandbox OAuth and an existing Order GET.
// NEVER permits creating or capturing an order, even if called by mistake.
const deny=code=>{const e=new Error(code);e.code=code;throw e;};
export function createExistingSandboxGetOnlyFetch({
 fetchImpl,maxOrderGets=3,maxOauthPosts=3
}={}){
 if(typeof fetchImpl!=='function'||
    !Number.isSafeInteger(maxOrderGets)||maxOrderGets<1||maxOrderGets>5||
    !Number.isSafeInteger(maxOauthPosts)||maxOauthPosts<1||maxOauthPosts>5)
  deny('GET_ONLY_FETCH_CONFIGURATION_REQUIRED');
 let oauthPosts=0,orderGets=0,blocked=false;
 const count=()=>Object.freeze({oauthPostRequests:oauthPosts,
  orderGetRequests:orderGets,orderCreatePosts:0,capturePosts:0,
  paymentPostPermitted:false,source:'PRIVATE_SANDBOX_GET_ONLY'});
 const run=async(url,init={})=>{
  // URL objects and caller-chosen prefixes are not accepted: transport must
  // inject the exact PayPal Sandbox HTTPS string.
  if(typeof url!=='string'||!init||typeof init!=='object')deny('GET_ONLY_FETCH_DENIED');
  let parsed;
  try{parsed=new URL(url)}catch{deny('GET_ONLY_FETCH_DENIED')}
  const method=init.method;
  const auth=method==='POST'&&parsed.pathname==='/v1/oauth2/token'&&
    init.body==='grant_type=client_credentials'&&
    typeof init.headers?.authorization==='string'&&
    init.headers.authorization.startsWith('Basic ');
  const order=method==='GET'&&
    /^\/v2\/checkout\/orders\/[A-Za-z0-9_-]{1,64}$/.test(parsed.pathname)&&
    init.body===undefined&&
    typeof init.headers?.authorization==='string'&&
    init.headers.authorization.startsWith('Bearer ');
  if(parsed.origin!=='https://api-m.sandbox.paypal.com'||
     parsed.username||parsed.password||parsed.search||parsed.hash||
     parsed.port||init.redirect!=='error'||(!auth&&!order))
   deny('GET_ONLY_FETCH_DENIED');
  if(blocked)deny('GET_ONLY_FETCH_CIRCUIT_OPEN');
  if(auth&&oauthPosts>=maxOauthPosts||order&&orderGets>=maxOrderGets)
   deny('GET_ONLY_FETCH_REQUEST_CAP');
  if(auth)oauthPosts++;
  else orderGets++;
  try{return await fetchImpl(url,init)}
  catch(e){
   blocked=true;
   // Never return raw request/response, token or HTTP client exception.
   deny('GET_ONLY_FETCH_NETWORK_UNKNOWN');
  }
 };
 return Object.freeze({fetch:run,status:count});
}
