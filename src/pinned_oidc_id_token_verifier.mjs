// Server-only, offline, pinned-key OIDC ID-token verifier (RS256).
// Caller MUST obtain expectedNonce from a server-side one-time login challenge;
// never trust browser-supplied nonce or map a JWT claim to merchant authority.
// No implicit JWKS download, HTTP listener, login, registration or payment.
import {constants,createHash,createPublicKey,verify as cryptoVerify,timingSafeEqual} from 'node:crypto';

const error=()=>{const e=new Error('OIDC_ID_TOKEN_UNVERIFIED');e.code='OIDC_ID_TOKEN_UNVERIFIED';return e;};
const fail=()=>{throw error();};
const base64url=/^[A-Za-z0-9_-]+$/;
const safeId=/^[A-Za-z0-9._:-]{3,128}$/;
const safeKid=/^[A-Za-z0-9._:-]{1,128}$/;
const parse=(part,max)=>{
 if(typeof part!=='string'||part.length>max||!base64url.test(part))fail();
 let bytes;
 try{bytes=Buffer.from(part,'base64url');if(bytes.toString('base64url')!==part)fail()}
 catch{fail()}
 try{
  const obj=JSON.parse(bytes.toString('utf8'));
  if(!obj||typeof obj!=='object'||Array.isArray(obj))fail();
  return obj;
 }catch{fail()}
};
const seconds=x=>Number.isSafeInteger(x)&&x>=0;
const validNonce=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{16,128}$/.test(x);
const fixedEqual=(a,b)=>{
 const aa=Buffer.from(a),bb=Buffer.from(b);
 return aa.length===bb.length&&timingSafeEqual(aa,bb);
};
export function createPinnedOidcIdTokenVerifier({
 issuer,audience,jwks,now=Date.now,maxAuthAgeMs=5*60*1000,clockSkewMs=30_000
}={}){
 let url;
 try{url=new URL(issuer)}catch{fail()}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
    url.origin==='null'||url.href.replace(/\/$/,'')!==issuer||
    !safeId.test(audience??'')||typeof now!=='function'||
    !Number.isSafeInteger(maxAuthAgeMs)||maxAuthAgeMs<60_000||maxAuthAgeMs>10*60*1000||
    !Number.isSafeInteger(clockSkewMs)||clockSkewMs<0||clockSkewMs>60_000||
    !Array.isArray(jwks?.keys)||jwks.keys.length<1||jwks.keys.length>8)fail();
 const keys=new Map();
 for(const jwk of jwks.keys){
  if(!jwk||typeof jwk!=='object'||jwk.kty!=='RSA'||!safeKid.test(jwk.kid??'')||
     (jwk.use!==undefined&&jwk.use!=='sig')||
     (jwk.alg!==undefined&&jwk.alg!=='RS256')||
     (jwk.key_ops!==undefined&&(!Array.isArray(jwk.key_ops)||
      jwk.key_ops.length!==1||jwk.key_ops[0]!=='verify'))||
     typeof jwk.n!=='string'||typeof jwk.e!=='string'||keys.has(jwk.kid))fail();
  let key;
  try{key=createPublicKey({key:{kty:'RSA',n:jwk.n,e:jwk.e},format:'jwk'})}
  catch{fail()}
  if(key.asymmetricKeyType!=='rsa'||
     (key.asymmetricKeyDetails?.modulusLength??0)<2048)fail();
  keys.set(jwk.kid,key);
 }
 async function verifyExternalIdentity(assertion){
  try{
   if(!assertion||typeof assertion!=='object'||Array.isArray(assertion)||
      typeof assertion.idToken!=='string'||assertion.idToken.length>8192||
      !validNonce(assertion.expectedNonce))fail();
   const parts=assertion.idToken.split('.');
   if(parts.length!==3||parts.some(p=>!p||p.length>6000||!base64url.test(p)))fail();
   const [rawHeader,rawBody,rawSig]=parts;
   const header=parse(rawHeader,2048),claims=parse(rawBody,6000);
   if(header.alg!=='RS256'||!safeKid.test(header.kid??'')||!keys.has(header.kid)||
      (header.typ!==undefined&&header.typ!=='JWT')||
      Object.keys(header).some(k=>!['alg','kid','typ'].includes(k)))fail();
   const sig=Buffer.from(rawSig,'base64url');
   if(sig.length<256||sig.toString('base64url')!==rawSig||
      !cryptoVerify('RSA-SHA256',Buffer.from(rawHeader+'.'+rawBody),{
       key:keys.get(header.kid),padding:constants.RSA_PKCS1_PADDING
      },sig))fail();
   const timestamp=now();
   if(!Number.isSafeInteger(timestamp)||timestamp<0)fail();
   const aud=claims.aud;
   const validAudience=aud===audience||
    (Array.isArray(aud)&&aud.length>=1&&aud.length<=8&&
     aud.every(x=>typeof x==='string'&&safeId.test(x))&&
     new Set(aud).size===aud.length&&aud.includes(audience)&&
     claims.azp===audience);
   const iat=claims.iat,auth=claims.auth_time,exp=claims.exp;
   if(claims.iss!==issuer||typeof claims.sub!=='string'||
      claims.sub.length<1||claims.sub.length>256||
      !validAudience||claims.nonce!==assertion.expectedNonce||
      !fixedEqual(claims.nonce,assertion.expectedNonce)||
      !seconds(iat)||!seconds(auth)||!seconds(exp)||
      (claims.nbf!==undefined&&!seconds(claims.nbf)))fail();
   if(exp<=iat||timestamp>=exp*1000+clockSkewMs||
      iat*1000>timestamp+clockSkewMs||
      auth*1000>timestamp+clockSkewMs||
      auth*1000>iat*1000+clockSkewMs||
      timestamp-iat*1000>maxAuthAgeMs||
      timestamp-auth*1000>maxAuthAgeMs||
      (claims.nbf!==undefined&&claims.nbf*1000>timestamp+clockSkewMs))fail();
   return Object.freeze({verified:true,issuer,audience,subject:claims.sub,
    assertionId:createHash('sha256').update(assertion.idToken).digest('hex'),
    authenticatedAtMs:auth*1000});
  }catch{fail()}
 }
 return Object.freeze({verifyExternalIdentity,
  mode:'OFFLINE_PINNED_RS256_OIDC_ID_TOKEN_VERIFIER',
  jwksNetworkFetchAllowed:false,trustBrowserNonce:false,
  registrationEnabled:false,merchantOwnershipVerified:false,
  paymentAuthorized:false});
}
