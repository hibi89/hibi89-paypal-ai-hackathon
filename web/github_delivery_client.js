// All values here are explicitly fictional; no GitHub network calls.
const deliveryForm=document.getElementById('github-delivery-form');
const deliveryResult=document.getElementById('github-delivery-result');
deliveryForm?.addEventListener('submit',async event=>{
 event.preventDefault();
 const button=deliveryForm.querySelector('button');
 button.disabled=true;
 try{
  const sr=await fetch('/demo/session',{credentials:'same-origin',cache:'no-store'});
  if(!sr.ok)throw Error('SESSION_UNAVAILABLE');
  const session=await sr.json();
  if(session.role!=='owner')throw Error('OWNER_ONLY');
  const body={repository:'fictional/demo-project',commitSha:'a'.repeat(40),prNumber:1,
   checks:[{name:'synthetic-build',conclusion:deliveryForm.elements.checkPassed.checked?'success':'failure'}],
   requiredChecks:['synthetic-build'],reviewApproved:deliveryForm.elements.reviewApproved.checked,
   acknowledgeSynthetic:true};
  const response=await fetch('/api/demo/github-delivery',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','x-csrf-token':session.csrfToken},body:JSON.stringify(body)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'REVIEW_FAILED');
  deliveryResult.textContent='UNVERIFIED SYNTHETIC INPUT · '+data.decision+' · PayPal payout: DISABLED · Required checks: '+(data.checksPass?'PASS':'NOT PASS');
 }catch(e){deliveryResult.textContent='Blocked: '+e.message}finally{button.disabled=false}
});
