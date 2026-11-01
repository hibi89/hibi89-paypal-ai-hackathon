// Optional private-only browser surface. Delegates ALL identity and business
// decisions to the original composed OIDC/marketplace host. No HTTP listener,
// identity provider transport, self-registration, public deploy or payment.
import {readFileSync} from 'node:fs';
const fail=code=>{const e=new TypeError(code);e.code=code;throw e};
const assets=new Map([
 ['/private/marketplace',{file:'../web/private_host_marketplace.html',type:'text/html; charset=utf-8'}],
 ['/private/marketplace/app.css',{file:'../web/private_host_marketplace.css',type:'text/css; charset=utf-8'}],
 ['/private/marketplace/app.js',{file:'../web/private_host_marketplace.js',type:'text/javascript; charset=utf-8'}]
]);
const security={
 'cache-control':'private, no-store, max-age=0','pragma':'no-cache',
 'x-content-type-options':'nosniff','x-frame-options':'DENY',
 'referrer-policy':'no-referrer','vary':'Cookie',
 'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
};
const donePage='<!doctype html><html lang="en"><meta charset="utf-8">'+
 '<meta name="viewport" content="width=device-width, initial-scale=1">'+
 '<title>Proofline | Sign-in complete</title><body><main>'+
 '<h1>Identity verification complete.</h1>'+
 '<p>Your encrypted session cookie was issued. Open the private marketplace workspace using the link below.</p>'+
 '<p>Merchant entitlement and PayPal payment authorization have not been verified.</p>'+
 '<a href="/private/marketplace">Open verified marketplace workspace</a>'+
 '</main></body></html>';

export function createPrivateMarketplaceBrowserSurface({publicOrigin,privateHost}={}){
 let url;
 try{url=new URL(publicOrigin)}catch{fail('BROWSER_HTTPS_ORIGIN_REQUIRED')}
 if(typeof publicOrigin!=='string'||url.origin!==publicOrigin||
    url.protocol!=='https:'||url.port||url.username||url.password||
    url.search||url.hash||url.pathname!=='/'||
    !url.hostname.includes('.')||url.hostname==='localhost'||
    url.hostname.endsWith('.local')||url.hostname.endsWith('.internal')||
    url.hostname.endsWith('.localhost')||
    typeof privateHost?.handle!=='function')
  fail('BROWSER_PRIVATE_VERIFIED_HOST_REQUIRED');
 const pages=new Map();
 for(const [path,{file,type}] of assets){
  const content=readFileSync(new URL(file,import.meta.url),'utf8');
  if(content.length<100||content.length>64000)
   fail('BROWSER_STATIC_ASSET_INVALID');
  pages.set(path,{content,type});
 }
 const reply=(body,type,status=200,extra={})=>
  new Response(body,{status,headers:{...security,'content-type':type,...extra}});
 async function handle(request){
  if(!(request instanceof Request))
   return reply('REQUEST_REQUIRED','text/plain; charset=utf-8',400);
  let u;
  try{u=new URL(request.url)}
  catch{return reply('INVALID_REQUEST','text/plain; charset=utf-8',400)}
  if(u.origin!==publicOrigin||u.username||u.password||u.hash)
   return reply('NOT_FOUND','text/plain; charset=utf-8',404);
  if(pages.has(u.pathname)){
   if(u.search) return reply('NOT_FOUND','text/plain; charset=utf-8',404);
   if(request.method!=='GET')return reply('METHOD_NOT_ALLOWED','text/plain; charset=utf-8',405,{allow:'GET'});
   const page=pages.get(u.pathname);
   return reply(page.content,page.type);
  }
  // The browser's standard navigation to the OIDC callback requests HTML.
  // Keep the original JSON contract for API calls; only convert a *verified*
  // successful callback to a link page. Do not leak the plaintext CSRF token
  // into browser HTML or synthesize a session on a failed callback.
  if(u.pathname==='/api/auth/oidc/callback'&&request.method==='GET'&&
     /(?:^|,|\s)text\/html(?:\s*;|\s*,|$)/i.test(
      request.headers.get('accept')??'')){
   const completed=await privateHost.handle(request);
   if(completed.status!==200)return completed;
   const cookies=completed.headers.getSetCookie();
   if(cookies.length!==2||cookies.some(s=>
      !s.startsWith('__Host-proofline_')||
      !/;\s*Secure(?:;|$)/i.test(s)||
      !/;\s*HttpOnly(?:;|$)/i.test(s)))
    return reply('AUTH_CALLBACK_REJECTED','text/plain; charset=utf-8',503);
   const headers=new Headers({...security,'content-type':'text/html; charset=utf-8'});
   for(const cookie of cookies)headers.append('set-cookie',cookie);
   return new Response(donePage,{status:200,headers});
  }
  return privateHost.handle(request);
 }
 return Object.freeze({
  handle,mode:'PRIVATE_BROWSER_WORKSPACE_COMPOSED_WITH_SIGNED_OIDC',
  publicListenerEnabled:false,publicRegistrationEnabled:false,
  providerNetworkEnabled:false,paymentAuthorized:false
 });
}
