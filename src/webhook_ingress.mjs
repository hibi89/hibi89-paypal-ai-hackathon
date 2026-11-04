// D11 TEST-ONLY Fetch-style PayPal webhook ingress. DO NOT public-deploy.
// Original-byte CRC32 layout: https://developer.paypal.com/api/rest/webhooks/rest/
// Key pinned by trusted caller; NO network certificate downloads or SSRF.
// Fixture signatures prove only OFFLINE_SYNTHETIC crypto, not PayPal authority.
import {createPublicKey,createVerify} from 'node:crypto';
import {WebhookInboxError} from './webhook_inbox.mjs';

const MAX_BYTES=65536;
const fail=(bad,code,status=400)=>{
  if(bad)throw new WebhookInboxError(code,status);
};
const response=(status,code,extra={})=>new Response(JSON.stringify({code,...extra}),{
  status,headers:{'content-type':'application/json','cache-control':'no-store'}});
export function crc32Decimal(raw){
  if(!Buffer.isBuffer(raw))throw new TypeError('raw bytes Buffer required');
  let crc=0xffffffff;
  for(const b of raw){
    crc^=b;
    for(let i=0;i<8;i++)crc=(crc>>>1)^(-(crc&1)&0xedb88320);
  }
  return String((crc^0xffffffff)>>>0);
}
const validCertUrl=value=>{
  if(typeof value!=='string'||value.length>220)return false;
  try{
    const u=new URL(value);
    return u.protocol==='https:'&&u.hostname==='api.sandbox.paypal.com'&&
      u.port===''&&u.username===''&&u.password===''&&
      u.search===''&&u.hash===''&&
      /^\/v1\/notifications\/certs\/CERT-[A-Za-z0-9_-]{8,100}$/.test(u.pathname)&&
      u.href===value;
  }catch{return false;}
};
async function readExactRaw(request){
  const claimed=request.headers.get('content-length');
  if(claimed!==null){
    fail(!/^\d{1,6}$/.test(claimed)||Number(claimed)>MAX_BYTES,
      'PAYLOAD_TOO_LARGE',413);
  }
  fail(!request.body,'EMPTY_BODY');
  const reader=request.body.getReader();
  const parts=[];let size=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>MAX_BYTES)throw new WebhookInboxError('PAYLOAD_TOO_LARGE',413);
      parts.push(Buffer.from(value));
    }
  }catch(err){await reader.cancel().catch(()=>{});throw err}
  fail(!size,'EMPTY_BODY');
  return Buffer.concat(parts,size);
}
export function createOfflineWebhookHandler({
  webhookId,certUrl,pinnedPublicKeyPem,inbox,offlineOnly=false
}={}){
  fail(offlineOnly!==true,'PRODUCTION_WEBHOOK_DISABLED');
  fail(typeof webhookId!=='string'||!/^[A-Za-z0-9_-]{8,128}$/.test(webhookId),
    'INVALID_WEBHOOK_ID');
  fail(!validCertUrl(certUrl),'INVALID_PINNED_CERT_URL');
  fail(!inbox||typeof inbox.receiveVerified!=='function','INBOX_REQUIRED');
  let key;
  try{
    key=createPublicKey(pinnedPublicKeyPem);
    fail(key.asymmetricKeyType!=='rsa','RSA_PINNED_KEY_REQUIRED');
  }catch{throw new WebhookInboxError('RSA_PINNED_KEY_REQUIRED',400)}
  return async function handle(request){
    try{
      const url=new URL(request.url);
      if(url.pathname!=='/api/paypal/webhooks')return response(404,'NOT_FOUND');
      if(request.method!=='POST')return response(405,'METHOD_NOT_ALLOWED');
      fail(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i
        .test(request.headers.get('content-type')||''),'JSON_CONTENT_TYPE_REQUIRED',415);
      const transmissionId=request.headers.get('paypal-transmission-id');
      const transmitted=request.headers.get('paypal-transmission-time');
      const headerCert=request.headers.get('paypal-cert-url');
      const sig=request.headers.get('paypal-transmission-sig');
      fail(!/^[A-Za-z0-9-]{8,128}$/.test(transmissionId||''),
        'INVALID_TRANSMISSION_HEADER',401);
      fail(typeof transmitted!=='string'||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(transmitted)||
        !Number.isFinite(Date.parse(transmitted)),
        'INVALID_TRANSMISSION_TIME',401);
      fail(request.headers.get('paypal-auth-algo')!=='SHA256withRSA',
        'UNSUPPORTED_AUTH_ALGORITHM',401);
      // NEVER fetch this header URL. Only use caller-pinned trusted config.
      fail(headerCert!==certUrl,'CERT_URL_MISMATCH',401);
      fail(typeof sig!=='string'||sig.length>2048||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(sig)||!sig,
        'INVALID_SIGNATURE_HEADER',401);
      const raw=await readExactRaw(request);
      const msg=transmissionId+'|'+transmitted+'|'+webhookId+'|'+crc32Decimal(raw);
      const verified=createVerify('RSA-SHA256').update(msg,'utf8').end()
        .verify(key,Buffer.from(sig,'base64'));
      fail(!verified,'WEBHOOK_SIGNATURE_REJECTED',401);
      let event;
      try{event=JSON.parse(raw.toString('utf8'))}
      catch{throw new WebhookInboxError('INVALID_WEBHOOK_JSON',400)}
      fail(!event||typeof event!=='object'||Array.isArray(event),
        'INVALID_WEBHOOK_JSON');
      // Body is untrusted; only this cryptographic check yields verified=true.
      const result=inbox.receiveVerified({event,rawBody:raw,transmissionId,verified:true});
      const code=result.action==='RECONCILE_GET_FIRST'?202:200;
      return response(code,result.action,{reason:result.reason,status:result.status??null});
    }catch(e){
      if(e instanceof WebhookInboxError)return response(e.status,e.code);
      return response(503,'WEBHOOK_NOT_ACCEPTED');
    }
  };
}
