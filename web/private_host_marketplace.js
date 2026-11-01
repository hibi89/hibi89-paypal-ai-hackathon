// Same-origin, session-only dashboard client. No self-registration, localStorage,
// synthetic account chooser, payment route, retry, external API or HTML injection.
'use strict';
const byId=id=>document.getElementById(id);
const idPattern=/^[A-Za-z0-9_-]{1,64}$/;
let principal=null;
let busy=false;
const controls=['read-quote','read-contract','read-events','submit','accept','reject','sign-out'];
function show(id,text){byId(id).textContent=typeof text==='string'?text:JSON.stringify(text,null,2)}
function setEnabled(){
 const authorized=!!principal&&!busy;
 byId('read-quote').disabled=!authorized;
 byId('read-contract').disabled=!authorized;
 byId('read-events').disabled=!authorized;
 byId('submit').disabled=!authorized||principal.role!=='seller';
 byId('accept').disabled=!authorized||principal.role!=='reviewer';
 byId('reject').disabled=!authorized||principal.role!=='reviewer';
 byId('sign-out').disabled=!authorized;
 byId('refresh-session').disabled=busy;
 byId('sign-in').hidden=!!principal||busy;
}
async function request(path,{method='GET',body,csrf}={}){
 const headers={accept:'application/json'};
 if(body!==undefined)headers['content-type']='application/json';
 if(csrf)headers['x-csrf-token']=csrf;
 const response=await fetch(path,{
  method,credentials:'same-origin',cache:'no-store',redirect:'error',headers,
  ...(body!==undefined?{body:JSON.stringify(body)}:{})
 });
 let payload;
 try{payload=await response.json()}catch{throw Error('INVALID_BACKEND_RESPONSE')}
 if(!response.ok){
  const error=Error(typeof payload?.error==='string'?payload.error:'REQUEST_FAILED');
  error.status=response.status;
  throw error;
 }
 if(payload?.paymentAuthorized!==false)throw Error('PAYMENT_SAFETY_PROOF_MISSING');
 return payload;
}
async function refreshSession(){
 busy=true;setEnabled();
 try{
  const payload=await request('/api/auth/oidc/session');
  if(payload.authenticated!==true||!payload.identity||payload.merchantOwnershipVerified!==false)
   throw Error('UNVERIFIED_ACCOUNT_RESPONSE');
  principal=Object.freeze({...payload.identity});
  show('session-status','SIGNED IN / ROLE CHECKED / MERCHANT ENTITLEMENT NOT VERIFIED');
  show('actor',principal.actorId);
  show('merchant',principal.merchantId);
  show('role',principal.role.toUpperCase());
 }catch(e){
  principal=null;
  show('session-status','NOT SIGNED IN · '+(e.message||'SESSION_UNAVAILABLE')+
   '. Use the configured identity provider; no account can be created here.');
  show('actor','—');show('merchant','—');show('role','—');
 }finally{busy=false;setEnabled()}
}
async function withUiWork(task,onFailure){
 if(busy||!principal)return;
 busy=true;setEnabled();
 try{await task()}
 catch(e){show(onFailure,'OPERATION FAILED / '+(e.message||'UNAVAILABLE')+
  '. No success inferred. If a write was attempted, inspect the contract and audit events; never retry automatically.')}
 finally{busy=false;setEnabled()}
}
function checkedId(input){
 const raw=byId(input).value.trim();
 if(!idPattern.test(raw))throw Error('INVALID_'+input.toUpperCase());
 return raw;
}
function encodedId(input){return encodeURIComponent(checkedId(input))}
function contractBase(){
 return '/api/marketplace/contracts/'+encodedId('contract-id')
}
function checkedVersion(){
 const value=Number(byId('expected-version').value);
 if(!Number.isSafeInteger(value)||value<1||value>2147483647)
  throw Error('INVALID_MILESTONE_VERSION');
 return value;
}
async function freshCsrf(){
 // No plaintext CSRF token is persisted by the browser; refresh only for an
 // explicit user-triggered mutation. An ambiguous write MUST NOT be retried.
 const token=await request('/api/auth/oidc/csrf',{method:'POST'});
 if(!token.rotated||typeof token.csrfToken!=='string'||token.csrfToken.length<20)
  throw Error('CSRF_REFRESH_FAILED');
 return token.csrfToken;
}
async function writeMilestone(action){
 const path=contractBase()+'/milestones/'+encodedId('milestone-id')+'/'+action;
 const expectedVersion=checkedVersion();
 const body={eventId:'ui_'+crypto.randomUUID().replaceAll('-','_'),
  expectedVersion};
 if(action==='submit'){
  body.expectedState=byId('expected-state').value;
  if(!['PENDING','REJECTED'].includes(body.expectedState))
   throw Error('INVALID_PREVIOUS_STATE');
  body.detail=byId('delivery-detail').value.trim();
  if(body.detail.length<3||body.detail.length>1000)
   throw Error('DELIVERY_NOTE_REQUIRED');
 }
 const csrf=await freshCsrf();
 show('action-status','Submitting one role-bound action. Do not refresh or submit twice.');
 const result=await request(path,{method:'POST',body,csrf});
 show('action-output',result);
 show('action-status','Recorded '+String(result?.transition?.state||'UNKNOWN')+
  ' · no PayPal payment authorized. Refresh contract and audit separately.');
}
byId('refresh-session').addEventListener('click',refreshSession);
byId('read-quote').addEventListener('click',()=>withUiWork(async()=>{
 const result=await request('/api/marketplace/quotes/'+encodedId('quote-id'));
 show('quote-output',result);
},'quote-output'));
byId('read-contract').addEventListener('click',()=>withUiWork(async()=>{
 const result=await request(contractBase());
 show('contract-output',result);
},'contract-output'));
byId('read-events').addEventListener('click',()=>withUiWork(async()=>{
 const result=await request(contractBase()+'/events');
 show('contract-output',result);
},'contract-output'));
for(const action of ['submit','accept','reject']){
 byId(action).addEventListener('click',()=>withUiWork(()=>writeMilestone(action),'action-status'));
}
byId('sign-out').addEventListener('click',()=>withUiWork(async()=>{
 const csrf=await freshCsrf();
 const result=await request('/api/auth/oidc/logout',{method:'POST',csrf});
 if(result.authenticated!==false||result.revoked!==true)
  throw Error('LOGOUT_NOT_CONFIRMED');
 principal=null;
 show('session-status','SIGNED OUT. Previous session revoked.');
 show('actor','—');show('merchant','—');show('role','—');
 show('action-status','Signed out. No payment operation was executed.');
 show('quote-output','Signed out.');
 show('contract-output','Signed out.');
 show('action-output','Signed out.');
},'session-status'));
void refreshSession();
