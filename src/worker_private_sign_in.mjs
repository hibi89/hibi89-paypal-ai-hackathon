// Static, public entry into an otherwise private owner-only Worker.
// Intentionally NO JavaScript, cookies, tokens, user-specific data or OAuth GET.
// A real browser submits a same-origin FORM POST to the existing PKCE coordinator.
const PAGE='/__private/sign-in';
const CSS=PAGE+'.css';
const BASE_HEADERS={
 'cache-control':'no-store, max-age=0','pragma':'no-cache',
 'x-content-type-options':'nosniff','x-frame-options':'DENY',
 'referrer-policy':'no-referrer','vary':'Cookie',
 'permissions-policy':'camera=(), microphone=(), geolocation=()',
 'content-security-policy':"default-src 'none'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; script-src 'none'; connect-src 'none'"
};
const HTML=`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Proofline | Owner sign-in</title><link rel="stylesheet" href="/__private/sign-in.css"></head>
<body><header><strong>p. proofline</strong><span>PRIVATE OWNER WORKSPACE</span></header>
<main><section class="hero"><p class="eyebrow">PROOFLINE / VERIFY IDENTITY</p>
<h1>Sign in to view your evidence.</h1>
<p class="lead">Use the verified identity provider configured by the workspace owner. Only pre-authorized owner accounts can access this read-only D1 evidence view.</p>
<form method="POST" action="/api/auth/oidc/start"><button type="submit">Continue with verified identity</button></form>
<p class="note">Signing in does not authorize payments, grant merchant permissions, or contact PayPal or an AI provider.</p>
</section><aside role="note"><strong>Release hold</strong><p>This is a restricted candidate workspace, not a live transaction dashboard. Local D1 attempt states are not PayPal confirmations.</p></aside></main>
<footer>Proofline · Explicit owner authorization required · No public account registration</footer></body></html>`;
const STYLE=`:root{font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;color:#152343;background:#f4f7fc}
*{box-sizing:border-box}body{margin:0;min-height:100vh}
header{background:#132145;color:#fff;display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:1.1rem clamp(1rem,4vw,4rem)}
header strong{font-size:1.3rem}header span{font-size:.7rem;letter-spacing:.14em;color:#c0d1f1}
main{max-width:900px;margin:4rem auto;padding:0 1.5rem}
.hero{background:#fff;border:1px solid #dce5f2;border-radius:1.2rem;padding:clamp(1.4rem,5vw,3rem);box-shadow:0 20px 55px rgba(21,35,67,.05)}
.eyebrow{font-size:.7rem;letter-spacing:.14em;color:#365bc7;font-weight:800}
h1{font-size:clamp(2rem,6vw,3.3rem);letter-spacing:-.055em;line-height:1.1;max-width:15ch}
.lead{max-width:58ch;line-height:1.7;color:#51627d}
form{margin:2rem 0 1.1rem}
button{border:0;background:#234dc5;color:#fff;padding:1rem 1.4rem;border-radius:.65rem;font:700 1rem system-ui;cursor:pointer}
button:focus-visible{outline:3px solid #80adff;outline-offset:3px}
.note,aside,footer{font-size:.82rem;line-height:1.55;color:#62708b}
aside{margin-top:1.2rem;background:#fff8ec;border:1px solid #edcf8b;border-radius:.8rem;padding:1rem 1.4rem}
aside strong{color:#714e17}aside p{margin:.4rem 0 0}
footer{padding:0 1.5rem 2rem;text-align:center}
@media(max-width:600px){header span{font-size:.55rem}main{margin:2rem auto}button{width:100%}}`;
const respond=(status,body,type,extra={})=>new Response(body,{
 status,headers:{...BASE_HEADERS,'content-type':type,...extra}
});
export function ownerSignInAsset(request,origin){
 if(!(request instanceof Request))return respond(400,'{"error":"INVALID_REQUEST"}','application/json');
 let url;try{url=new URL(request.url)}catch{return respond(400,'{"error":"INVALID_REQUEST"}','application/json')}
 if(url.origin!==origin)return respond(403,'{"error":"ORIGIN_NOT_ALLOWED"}','application/json');
 if(url.pathname!==PAGE&&url.pathname!==CSS)return null;
 if(url.search||url.hash)return respond(404,'{"error":"NOT_FOUND"}','application/json');
 if(request.method!=='GET')return respond(405,'{"error":"METHOD_NOT_ALLOWED"}','application/json',{'allow':'GET'});
 return url.pathname===PAGE?
  respond(200,HTML,'text/html; charset=utf-8'):
  respond(200,STYLE,'text/css; charset=utf-8');
}
export function redirectVerifiedOwnerLogin(result,origin,{roleSessionsEnabled=false}={}){
 // The existing trusted OIDC router issues all three cookies only after
 // RSA/nonce/tenant authorization. Reject malformed or partial responses.
 if(!(result instanceof Response)||result.status!==200)return result;
 const cookies=result.headers.getSetCookie?.()??[];
 if(cookies.length!==3||
    !cookies.some(x=>(roleSessionsEnabled===true?
      /^__Host-proofline_(?:session|contract_role)=[A-Za-z0-9_-]{43}; Secure; HttpOnly; Path=\/; SameSite=Strict; Max-Age=\d+$/:
      /^__Host-proofline_session=[A-Za-z0-9_-]{43}; Secure; HttpOnly; Path=\/; SameSite=Strict; Max-Age=\d+$/
     ).test(x))||
    !cookies.some(x=>/^__Host-proofline_oidc_state=; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=0$/.test(x))||
    !cookies.some(x=>/^__Host-proofline_oidc_pkce=; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=0$/.test(x)))
  return respond(503,'{"error":"LOGIN_RESPONSE_UNAVAILABLE"}','application/json');
 const isRole=roleSessionsEnabled===true&&cookies.some(x=>
  x.startsWith('__Host-proofline_contract_role='));
 const url=origin+(isRole?'/__private/contracts':'/__private/attempts/view');
 const out=new Response(null,{status:303,headers:{
  ...BASE_HEADERS,location:url
 }});
 for(const cookie of cookies)out.headers.append('set-cookie',cookie);
 return out;
}
