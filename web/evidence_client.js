// Local read-only SQLite integrity and event counts; not a live PayPal connector.
const evidenceRefresh=document.getElementById('evidence-refresh');
const evidenceOutput=document.getElementById('evidence-details');
let evidenceBusy=false;
async function readLocalEvidence(){
  if(evidenceBusy)return;
  evidenceBusy=true;
  evidenceRefresh.disabled=true;
  try {
    const response=await fetch('/api/demo/evidence',{method:'GET',
      credentials:'same-origin',cache:'no-store'});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'EVIDENCE_READ_FAILED');
    const bi=data.businessIntelligence;
    evidenceOutput.textContent=
      'SQLite data integrity: '+data.dbvoraInspired.integrity+
      ' (read-only; backup not verified).\n'+
      'Local transaction history integrity: '+data.soviaStyle.audit.integrity+
      ' ('+data.soviaStyle.audit.ownerEvents+' owner-scoped events, SHA256 not signed).\n'+
      'Local policy checks: '+
      data.soviaStyle.checks.map(c=>c.rule+'='+c.status).join('; ')+'\n'+
      'Synthetic quote/activity counts: quotes '+bi.quotes.total+', approved '+bi.quotes.approved+
      ', approval rate '+(bi.humanApprovalRate.percentage??'N/A')+'%'+
      ', local payment claims '+bi.paymentAttempts.total+
      ', unresolved '+bi.paymentAttempts.unresolved+
      '.\nProvider transactions measured: NO. Market demand measured: NO. '+
      'Local hash chain has no external anchor; no independently deployed services.';
  }catch(e){
    evidenceOutput.textContent='Read-only evidence unavailable: '+
      (e?.message||'EVIDENCE_READ_FAILED');
  }finally{evidenceBusy=false;evidenceRefresh.disabled=false;}
}
evidenceRefresh.addEventListener('click',readLocalEvidence);
readLocalEvidence();
