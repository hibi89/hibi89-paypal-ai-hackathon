// Owner-only D1 quote workbench: static assets served only after current verified session.
import {createWorkerPrivateSessionResolver,PrivateSessionError} from './worker_private_session_resolver.mjs';
const P='/__private/quotes/view';
const CSS=P+'.css',JS=P+'.js';
const HTML=`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Proofline | Quote workflow</title>
<link rel="stylesheet" href="/__private/quotes/view.css"></head><body>
<header><strong>Proofline</strong><nav><a href="/__private/attempts/view">Payment attempt records</a><a href="/__private/quotes/view" aria-current="page">Owner quotes</a></nav></header>
<main><p class="eyebrow">PART 1 / REAL OWNER D1 WORKFLOW</p><h1>Quotes and human approval</h1>
<p class="notice">Saved in the bound D1 database. Approval changes the quote only. It does not create, authorize or capture a PayPal payment. No AI provider is called.</p>
<section><h2>Create a draft</h2><form id="draft">
<label for="scope">Project scope</label><textarea id="scope" minlength="12" maxlength="600" required placeholder="Describe the service and delivery requirements"></textarea>
<button type="submit">Save draft to D1</button></form></section>
<section><div class="bar"><h2>Owner quotes</h2><button id="reload" type="button">Refresh</button></div>
<p id="status" role="status" aria-live="polite">Loading saved quotes…</p><div id="quotes" aria-live="polite"></div></section>
</main><footer>Owner access only · All amounts USD · Human approval is not a PayPal transaction.</footer>
<script src="/__private/quotes/view.js" defer></script></body></html>`;
const STYLES=`:root{font-family:system-ui,sans-serif;color:#192a48;background:#f4f7fb}
*{box-sizing:border-box}body{margin:0}header{background:#14274e;color:#fff;padding:1rem 3vw;display:flex;align-items:center;justify-content:space-between;gap:1rem}
nav{display:flex;gap:1rem;flex-wrap:wrap}a{color:inherit}main{max-width:960px;margin:2.5rem auto;padding:0 1rem}
h1{font-size:clamp(2rem,5vw,3rem)}h2{margin-top:0}.eyebrow{font-weight:700;letter-spacing:.12em;color:#2457bc}
.notice{background:#fff3dd;border:1px solid #dbb76d;padding:1rem;border-radius:.6rem;line-height:1.6}
section{background:white;border:1px solid #dce4f0;border-radius:.8rem;padding:1.5rem;margin:1.3rem 0}
label{display:block;font-weight:700;margin-bottom:.5rem}textarea{width:100%;min-height:100px;border:1px solid #8da2bf;border-radius:.4rem;padding:.7rem;font:inherit}
button{background:#2554c9;color:white;border:none;border-radius:.45rem;padding:.65rem 1rem;font-weight:700;cursor:pointer;margin-top:.5rem}
button:disabled{opacity:.45;cursor:not-allowed}button:focus-visible,a:focus-visible,textarea:focus-visible,input:focus-visible{outline:3px solid #619ff4;outline-offset:2px}
.bar{display:flex;align-items:center;justify-content:space-between}.quote{padding:1rem 0;border-top:1px solid #e3e8f2;overflow-wrap:anywhere}
.scope{white-space:pre-wrap}.amount{width:10rem;padding:.55rem;border:1px solid #91a4bc;border-radius:.4rem}
.approval{display:flex;flex-wrap:wrap;gap:.5rem 1rem;align-items:center;margin-top:1rem}
footer{text-align:center;font-size:.8rem;color:#50607a;padding:2rem}
@media(max-width:560px){header{align-items:flex-start;flex-direction:column}.bar{flex-wrap:wrap}}`;
const SCRIPT=`'use strict';
const el=id=>document.getElementById(id),status=el('status');
const drafts=el('draft'),scope=el('scope'),list=el('quotes');
let draftRequestId=null;
function message(text){status.textContent=text}
function node(tag,text){const x=document.createElement(tag);x.textContent=text;return x}
async function api(path,options={}){
 const res=await fetch(path,{cache:'no-store',credentials:'same-origin',
  redirect:'error',...options});
 const data=await res.json();
 if(!res.ok)throw Error(data.error||'REQUEST_FAILED');
 return data;
}
async function refresh(){
 try{
  const data=await api('/__private/quotes?limit=20');
  list.replaceChildren();
  for(const q of data.quotes){
   const card=node('article','');card.className='quote';
   card.append(node('h3',q.quoteId),node('p','Status: '+q.status+' · Version '+q.version),
     node('p',q.scopeText??'Historical quote: scope not recorded'));
   if(q.status==='APPROVED'){
    card.append(node('p','Human approved: USD '+(q.approvedAmountMinor/100).toFixed(2)+' · No payment executed'));
   }else{
    const form=document.createElement('form');form.className='approval';
    const label=node('label','Amount (USD cents, 100–1,000,000)');
    const amount=document.createElement('input');amount.className='amount';
    amount.type='number';amount.min='100';amount.max='1000000';amount.step='1';
    amount.required=true;label.append(amount);
    const consent=document.createElement('label');
    const check=document.createElement('input');check.type='checkbox';check.required=true;
    consent.append(check,document.createTextNode(' I explicitly approve this quote amount; no payment will execute.'));
    const btn=node('button','Approve amount');btn.type='submit';
    form.append(label,consent,btn);
    form.addEventListener('submit',async e=>{
     e.preventDefault();if(!check.checked)return;
     const minor=Number(amount.value);if(!Number.isSafeInteger(minor)||minor<100||minor>1000000)return;
     btn.disabled=true;
     try{await api('/__private/quotes/'+encodeURIComponent(q.quoteId)+'/approve',{
      method:'POST',headers:{'content-type':'application/json','x-proofline-intent':'quote-approve'},
      body:JSON.stringify({expectedVersion:q.version,amountMinor:minor})
     });await refresh();message('Amount approved and saved to D1; no PayPal action.')}
     catch(err){message('Approval not confirmed: '+err.message);btn.disabled=false}
    });
    card.append(form);
   }
   list.append(card);
  }
  message('Showing '+data.count+' D1 owner quotes. Payment: not authorized.');
 }catch(err){message('Could not load quotes: '+err.message)}
}
drafts.addEventListener('submit',async e=>{
 e.preventDefault();const value=scope.value.trim();
 if(value.length<12||value.length>600)return;
 const btn=drafts.querySelector('button');btn.disabled=true;
 if(!draftRequestId)draftRequestId=crypto.randomUUID();
 try{await api('/__private/quotes',{
  method:'POST',headers:{'content-type':'application/json','x-proofline-intent':'quote-draft'},
  body:JSON.stringify({clientRequestId:draftRequestId,scopeText:value})
 });draftRequestId=null;scope.value='';await refresh();message('Draft saved to real D1.')}
 catch(err){message('Draft not confirmed; retry uses same request ID: '+err.message)}
 finally{btn.disabled=false}
});
el('reload').addEventListener('click',refresh);
refresh();`;
const H={'cache-control':'private, no-store, max-age=0','pragma':'no-cache','vary':'Cookie',
 'x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer',
 'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"};
const send=(status,body,type,extra={})=>new Response(body,{status,headers:{...H,'content-type':type,...extra}});
export function createWorkerPrivateQuoteDashboard({db,allowedOrigin,now}={}){
 const resolver=createWorkerPrivateSessionResolver({db,now});
 return Object.freeze({async fetch(request){
  if(!(request instanceof Request))return send(400,'INVALID_REQUEST','text/plain');
  let u;try{u=new URL(request.url)}catch{return send(400,'INVALID_REQUEST','text/plain')}
  if(u.origin!==allowedOrigin)return send(403,'ORIGIN_NOT_ALLOWED','text/plain');
  if(![P,CSS,JS].includes(u.pathname)||u.search||u.hash)return send(404,'NOT_FOUND','text/plain');
  if(request.method!=='GET')return send(405,'METHOD_NOT_ALLOWED','text/plain',{allow:'GET'});
  const site=request.headers.get('sec-fetch-site');
  if(site&&!['same-origin','none'].includes(site))return send(403,'CROSS_SITE_BLOCKED','text/plain');
  const origin=request.headers.get('origin');if(origin&&origin!==allowedOrigin)
   return send(403,'ORIGIN_NOT_ALLOWED','text/plain');
  try{await resolver(request)}
  catch(e){return send(e instanceof PrivateSessionError&&e.code==='SESSION_STORE_UNAVAILABLE'?503:401,
    'UNAUTHENTICATED','text/plain')}
  const type=u.pathname===P?'text/html; charset=utf-8':u.pathname===CSS?
   'text/css; charset=utf-8':'text/javascript; charset=utf-8';
  return send(200,u.pathname===P?HTML:u.pathname===CSS?STYLES:SCRIPT,type);
 }});
}
