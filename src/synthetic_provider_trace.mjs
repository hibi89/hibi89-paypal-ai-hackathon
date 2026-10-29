// Exact allowlist of provider-API boundary semantics observed by the REAL
// orchestrator using EXPLICITLY INJECTED FAKE transport only. This is NOT a
// network trace, independent attestation, captured payment or Sandbox receipt.
const CONSENT_STAGES=Object.freeze([
  'GEMINI_SKILL_CLASSIFICATION_ONCE',
  'APPROVE_SYNTHETIC_USD_1_50',
  'ISSUE_OWNER_SANDBOX_CHECKOUT_SESSION',
  'CREATE_SANDBOX_ORDER',
  'CAPTURE_SANDBOX_ORDER'
]);
const BAD=code=>{throw Error('FAKE_PROTOCOL_'+code)};
const ordered=(xs,labels)=>{
  let prev=-1;
  for(const stage of labels){
    const index=xs.indexOf(stage,prev+1);
    if(index<=prev)BAD('ORDER_OR_REQUIRED_STAGE_MISSING');
    prev=index;
  }
};
export function verifyInjectedProviderProtocol({calls,consents}={}){
  if(!Array.isArray(calls)||calls.length<7||calls.length>40||
    !Array.isArray(consents)||consents.length!==CONSENT_STAGES.length||
    !consents.every((x,i)=>x===CONSENT_STAGES[i]))BAD('HUMAN_CONSENT_SEQUENCE');
  const events=calls.map(call=>{
    if(!call||typeof call!=='object'||Array.isArray(call)||
      typeof call.path!=='string')BAD('INVALID_CALL_RECORD');
    const {kind,method,path,observedStatus}=call;
    if(kind==='FAKE_GEMINI'&&method==='POST'&&
      /^\/v1beta\/models\/[a-zA-Z0-9._-]+:generateContent$/.test(path)&&
      observedStatus===undefined)return 'FAKE_GEMINI_GENERATE_POST';
    if(kind==='FAKE_PAYPAL'&&method==='POST'&&
      path==='/v1/oauth2/token'&&observedStatus===undefined)
      return 'FAKE_PAYPAL_OAUTH_POST';
    if(kind==='FAKE_PAYPAL'&&method==='POST'&&
      path==='/v2/checkout/orders'&&observedStatus===undefined)
      return 'FAKE_ORDER_CREATE_POST';
    if(kind==='FAKE_PAYPAL'&&method==='POST'&&
      /^\/v2\/checkout\/orders\/[A-Za-z0-9_-]{1,64}\/capture$/.test(path)&&
      observedStatus===undefined)return 'FAKE_ORDER_CAPTURE_POST';
    if(kind==='FAKE_PAYPAL'&&method==='GET'&&
      /^\/v2\/checkout\/orders\/[A-Za-z0-9_-]{1,64}$/.test(path)&&
      ['PAYER_ACTION_REQUIRED','APPROVED','COMPLETED'].includes(observedStatus))
      return 'FAKE_ORDER_GET_'+observedStatus;
    return BAD('UNEXPECTED_METHOD_HOST_OR_PATH');
  });
  const n=type=>events.filter(x=>x===type).length;
  if(n('FAKE_GEMINI_GENERATE_POST')!==1||n('FAKE_ORDER_CREATE_POST')!==1||
    n('FAKE_ORDER_CAPTURE_POST')!==1||n('FAKE_PAYPAL_OAUTH_POST')<1||
    n('FAKE_ORDER_GET_PAYER_ACTION_REQUIRED')<1||
    n('FAKE_ORDER_GET_APPROVED')<1||
    n('FAKE_ORDER_GET_COMPLETED')<1)BAD('PROVIDER_COUNTS');
  ordered(events,[
    'FAKE_GEMINI_GENERATE_POST',
    'FAKE_ORDER_CREATE_POST',
    'FAKE_ORDER_GET_PAYER_ACTION_REQUIRED',
    'FAKE_ORDER_GET_APPROVED',
    'FAKE_ORDER_CAPTURE_POST',
    'FAKE_ORDER_GET_COMPLETED'
  ]);
  return Object.freeze({
    status:'INJECTED_FAKE_PROTOCOL_SEQUENCE_VERIFIED',
    transport:'FAKE_INJECTED_NO_PROVIDER_NETWORK',
    stageSequence:Object.freeze(events),
    humanConsentStages:Object.freeze([...CONSENT_STAGES]),
    fakeGeminiPosts:1,fakePayPalOrderCreatePosts:1,
    fakePayPalOrderCapturePosts:1,
    fakePaypalOauthPosts:n('FAKE_PAYPAL_OAUTH_POST'),
    fakePaypalGetObservations:Object.freeze({
      buyerPending:n('FAKE_ORDER_GET_PAYER_ACTION_REQUIRED'),
      buyerApproved:n('FAKE_ORDER_GET_APPROVED'),
      capturedCompleted:n('FAKE_ORDER_GET_COMPLETED')
    }),
    actualProviderCalls:0,realPaymentCaptured:false,
    privateIdentifiersIncluded:false
  });
}
