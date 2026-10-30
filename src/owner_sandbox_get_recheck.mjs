// Optional, explicitly owner-authorized SANDBOX OAuth + existing-order GET.
// Imports do not read credentials, touch the owner's private SQLite or call APIs.
// Never creates orders, captures, retries POSTs, invokes Gemini or uploads data.
import {DatabaseSync} from 'node:sqlite';
import {lstatSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectOwnerMvpReceipt} from './owner_mvp_receipt.mjs';
import {createSandboxTransport} from './paypal_sandbox_transport.mjs';

const BASE='https://api-m.sandbox.paypal.com';
const EXPECTED_ID='operator_mvp_01';
const ORDER=/^[A-Za-z0-9_-]{1,64}$/;
const reject=code=>{throw Error('READONLY_SANDBOX_'+code)};
const safeFile=filename=>{
 let info;
 try{info=lstatSync(filename)}catch{reject('LOCAL_FILE_UNAVAILABLE')}
 if(!info.isFile()||info.isSymbolicLink()||info.size<1||
    info.size>64*1024*1024)reject('LOCAL_FILE_UNSAFE');
 for(const suffix of ['-wal','-shm']){
   let sidecarPresent=false;
   try{lstatSync(filename+suffix);sidecarPresent=true}
   catch(e){if(e?.code!=='ENOENT')reject('PRIVATE_SQLITE_SIDECAR_UNSAFE')}
   if(sidecarPresent)reject('ACTIVE_SQLITE_WAL_REVIEW_REQUIRED');
 }
};

export function readExistingSandboxClaim(directory){
 if(typeof directory!=='string'||!directory)reject('DIRECTORY_REQUIRED');
 // The same, pre-existing immutable read-only ledger + AI + audit checks used
 // by owner:review:local must pass BEFORE any provider OAuth attempt.
 const receipt=inspectOwnerMvpReceipt({directory});
 if(receipt.status!=='LOCAL_PROVIDER_RESULT_RECORDED_NOT_FRESH_GET'||
   receipt.localAuditIntegrity!=='PASS'||
   receipt.amountMinor!==150||receipt.currency!=='USD'||
   receipt.providerGetPerformedNow!==false||receipt.safeToRepeatPayment!==false)
   reject('EXISTING_LOCAL_RECEIPT_NOT_VERIFIED');
 const filename=join(directory,'checkout.sqlite');
 safeFile(filename);
 let db;
 try{
   db=new DatabaseSync(pathToFileURL(filename).href+'?immutable=1',{readOnly:true});
   db.exec('PRAGMA query_only=ON');
   const quotes=db.prepare('SELECT id,owner_id,merchant_id,version,currency,status,'+
     'approval_actor,approval_version,approval_amount_minor FROM quotes').all();
   const attempts=db.prepare('SELECT quote_id,quote_version,merchant_id,operation,'+
     'state,remote_id,amount_minor,currency FROM payment_attempts').all();
   const q=quotes[0],create=attempts.find(a=>a.operation==='create');
   const capture=attempts.find(a=>a.operation==='capture');
   if(quotes.length!==1||attempts.length!==2||
     q?.id!==EXPECTED_ID||q.owner_id!=='local_operator'||
     !/^[A-Za-z0-9]{13}$/.test(q.merchant_id)||
     q.version!==1||q.currency!=='USD'||q.status!=='APPROVED'||
     q.approval_actor!=='local_operator'||q.approval_version!==1||
     q.approval_amount_minor!==150||
     create?.state!=='APPROVED'||capture?.state!=='PAID'||
     !ORDER.test(create?.remote_id||'')||!ORDER.test(capture?.remote_id||'')||
     create.remote_id===capture.remote_id||
     [create,capture].some(a=>a.quote_id!==q.id||a.quote_version!==q.version||
       a.merchant_id!==q.merchant_id||a.amount_minor!==150||a.currency!=='USD'))
       reject('EXISTING_ORDER_BINDING_INVALID');
   return Object.freeze({
     // PRIVATE IN MEMORY ONLY. Never stringify this object or upload it.
     orderId:create.remote_id,captureId:capture.remote_id,
     quote:Object.freeze({id:q.id,ownerId:q.owner_id,merchantId:q.merchant_id,
       version:q.version,currency:'USD',status:'APPROVED',
       approval:Object.freeze({decision:'APPROVED',quoteVersion:1,
         actorId:q.approval_actor,amountMinor:150})})
   });
 }catch{reject('EXISTING_ORDER_READ_FAILED')}
 finally{try{db?.close()}catch{}}
}

export async function recheckExistingSandboxGet({
  authorized=false,claimReader=readExistingSandboxClaim,directory,
  clientId,clientSecret,fetchImpl
}={}){
 const denied=Object.freeze({status:'OWNER_AUTHORIZATION_REQUIRED_NO_NETWORK',
   sandboxGetVerified:false,externalProviderCalls:0,oauthPosts:0,
   paymentPosts:0,geminiCalls:0,submissionEligible:false});
 if(authorized!==true)return denied;
 if(typeof claimReader!=='function'||typeof fetchImpl!=='function'||
   typeof clientId!=='string'||!clientId||typeof clientSecret!=='string'||!clientSecret)
   return Object.freeze({...denied,status:'MISSING_OWNER_PRIVATE_PREREQUISITES'});
 // Verify historical immutable files before even requesting a token.
 let claim;
 try{claim=claimReader(directory)}
 catch{return Object.freeze({...denied,status:'EXISTING_RECEIPT_REVIEW_REQUIRED'})}
 if(!claim||claim.quote?.id!==EXPECTED_ID||
   claim.quote?.approval?.amountMinor!==150||
   claim.quote?.approval?.decision!=='APPROVED'||
   !/^[A-Za-z0-9]{13}$/.test(claim.quote?.merchantId||'')||
   !ORDER.test(claim.orderId||'')||!ORDER.test(claim.captureId||''))
   return Object.freeze({...denied,status:'EXISTING_CLAIM_UNSAFE'});
 let oauth=0,gets=0,unapproved=0;
 const exactGet=BASE+'/v2/checkout/orders/'+encodeURIComponent(claim.orderId);
 const guardedFetch=async(url,options={})=>{
   if(url===BASE+'/v1/oauth2/token'&&options.method==='POST'&&oauth===0){
     oauth++;return fetchImpl(url,options);
   }
   if(url===exactGet&&options.method==='GET'&&oauth===1&&gets===0){
     gets++;return fetchImpl(url,options);
   }
   unapproved++;
   throw Error('READONLY_SANDBOX_UNAPPROVED_PROVIDER_REQUEST');
 };
 let matched=false;
 try{
   const transport=createSandboxTransport({clientId,clientSecret,
     fetchImpl:guardedFetch});
   const result=await transport.getCaptureProof(claim.quote,claim.orderId);
   matched=result.order?.status==='COMPLETED'&&
     result.capture?.status==='COMPLETED'&&
     result.capture?.id===claim.captureId;
 }catch{
   // Never print token, IDs, remote response, credentials or path.
 }
 return Object.freeze({
   status:matched&&oauth===1&&gets===1&&unapproved===0?
     'EXISTING_SANDBOX_CAPTURE_RECHECKED_BY_AUTHENTICATED_GET':
     'REMOTE_GET_NOT_VERIFIED_REVIEW_ONLY',
   sandboxGetVerified:matched&&oauth===1&&gets===1&&unapproved===0,
   evidenceClass:'OWNER_DEVICE_ONCE_AUTHENTICATED_SANDBOX_READ_NOT_THIRD_PARTY_ATTESTATION',
   oauthPosts:oauth,orderGetRequests:gets,
   externalProviderCalls:oauth+gets,
   blockedUnexpectedRequests:unapproved,
   paymentPosts:0,geminiCalls:0,liveMoneyTransferred:false,
   originalOrderOrCaptureIdsExported:false,rawProviderResponsesExported:false,
   ownerPrivateDatabaseModified:false,publiclyUploaded:false,
   submissionEligible:false,automaticRetry:false
 });
}
