// Local-only, private, read-only review of existing MVP evidence.
// Never invokes a provider, browser mutation, payment or database write.
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {matchSyntheticMarketplaceSkills,MARKETPLACE_SKILL_NAMES} from './marketplace_match.mjs';
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const loopback=addr=>addr==='127.0.0.1'||addr==='::ffff:127.0.0.1';
function render(receipt){
 const skills=receipt?.classifiedSkills;
 const valid=Array.isArray(skills)&&skills.length>0&&
   skills.every(x=>typeof x==='string'&&MARKETPLACE_SKILL_NAMES.includes(x))&&
   new Set(skills).size===skills.length;
 const recorded=receipt?.status==='LOCAL_PROVIDER_RESULT_RECORDED_NOT_FRESH_GET'&&
   receipt?.amountMinor===150&&receipt?.currency==='USD'&&
   receipt?.localAuditIntegrity==='PASS'&&valid&&
   receipt?.localStates?.capture==='PAID'&&receipt?.localStates?.gemini==='COMMITTED';
 const matches=recorded?matchSyntheticMarketplaceSkills(skills,{source:'GEMINI_API'}):null;
 const candidate=matches?.profiles.find(x=>x.matchedSkills.length>0);
 const tags=items=>items.length?items.map(v=>'<span class="tag">'+esc(v)+'</span>').join(' '):'<em>None</em>';
 const ai=recorded?'<p>Saved model-classified skills (no new Gemini call):</p>'+tags(matches.requestedSkills):
  '<p>No complete, consistent local AI and payment record is available for this review.</p>';
 const worker=candidate?
  '<p><strong>'+esc(candidate.displayName)+'</strong> — fictional profile, not a real onboarded seller.</p>'+
  '<p>Matched: '+tags(candidate.matchedSkills)+'</p>'+
  '<p>Missing: '+tags(candidate.missingSkills)+'</p>'+
  '<p>'+(candidate.eligible?'Matches required skill taxonomy':'Human review needed for missing skills')+'</p>':
  '<p>Matching unavailable without saved skills.</p>';
 return [
  '<!doctype html><html lang="en"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<title>PayPal Owner MVP Review — Local Only</title>',
  '<style>:root{font:16px/1.5 system-ui,sans-serif;background:#f6f7f9;color:#1e293b}',
  '*{box-sizing:border-box}body{max-width:830px;margin:0 auto;padding:30px 20px}',
  'h1{font-size:1.7rem;margin:0 0 10px}h2{font-size:1.14rem;margin:0 0 10px}',
  'p,small{color:#475569}.panel{background:#fff;border:1px solid #e2e8f0;',
  'border-radius:12px;padding:18px;margin:14px 0}.notice{background:#fffbeb;',
  'border-left:4px solid #b45309;padding:12px;margin:18px 0}',
  '.tag{display:inline-block;padding:3px 9px;background:#e8eef7;',
  'border-radius:5px;font-size:.9rem;margin:2px}',
  '.metric{font-size:1.4rem;font-weight:700}.grid{display:grid;',
  'grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}',
  '.label{font-weight:700;font-size:.8rem}</style></head><body>',
  '<header><h1>PayPal AI Marketplace — Owner MVP Review</h1>',
  '<div class="label">',recorded?'LOCAL RESULT RECORDED':'REVIEW REQUIRED','</div>',
  '<p>Private, read-only snapshot from an earlier owner-operated Sandbox CLI.</p></header>',
  '<div class="notice"><strong>Not a new PayPal verification.</strong> This page never',
  ' contacts Gemini or PayPal, cannot attest current remote status, and does not',
  ' create, charge, capture or replay any payment. NOT a production service.</div>',
  '<section class="panel"><h2>1. Gemini-assisted skill review</h2>',ai,'</section>',
  '<section class="panel"><h2>2. Synthetic freelancer match</h2>',worker,'</section>',
  '<div class="grid"><section class="panel"><h2>3. Human-approved quote</h2>',
  '<div class="metric">',recorded?'USD 1.50':'NOT VERIFIED','</div>',
  '<p>Fixed by a person, not AI-predicted market pricing.</p></section>',
  '<section class="panel"><h2>4. Sandbox payment evidence</h2>',
  '<div class="metric">',recorded?'LOCAL GET RESULT':'NOT VERIFIED','</div>',
  '<p>',recorded?'Local SQLite records a previous provider-GET-verified Sandbox capture.':
   'No complete local capture result is available.', ' No new GET or POST was performed here.</p>',
  '</section></div><section class="panel"><h2>5. Audit integrity</h2><p>',
  'Unsigned local SQLite hash chain: <strong>',
  recorded?'PASS':'NOT VERIFIED','</strong>. No external attestation.</p></section>',
  '<footer><small>127.0.0.1 only • GET only • no merchant or order IDs',
  ' • no raw prompts, buyer details, payment secrets or Live transactions',
  ' • never expose through a public tunnel</small></footer></body></html>'
 ].join('');
}
export async function startOwnerMvpReview({receipt,port=0}={}){
 if(!receipt||typeof receipt!=='object'||!Number.isInteger(port)||port<0||port>65535)
   throw new TypeError('OWNER_REVIEW_INPUT_REQUIRED');
 const capability=randomBytes(24).toString('hex');
 const html=render(receipt); // snapshot once; no DB reads on GET.
 let server;
 server=createServer({maxHeaderSize:8192},(req,res)=>{
   const host='127.0.0.1:'+server.address().port;
   const headers={'cache-control':'no-store','x-content-type-options':'nosniff',
     'referrer-policy':'no-referrer','x-frame-options':'DENY',
     'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; connect-src 'none'"};
   if(!loopback(req.socket.remoteAddress)||req.headers.host!==host){
     res.writeHead(403,headers);res.end('FORBIDDEN');return;
   }
   if(req.url!=='/review/'+capability){res.writeHead(404,headers);res.end('NOT_FOUND');return;}
   if(req.method!=='GET'){
     res.writeHead(405,{...headers,allow:'GET'});res.end('METHOD_NOT_ALLOWED');return;
   }
   res.writeHead(200,{...headers,'content-type':'text/html; charset=utf-8'});
   res.end(html);
 });
 await new Promise((resolve,reject)=>{
   server.once('error',reject);
   server.listen(port,'127.0.0.1',resolve);
 });
 return Object.freeze({url:'http://127.0.0.1:'+server.address().port+'/review/'+capability,
   mode:'LOCAL_OWNER_READ_ONLY_NO_PROVIDER',async close(){
     await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
   }});
}
