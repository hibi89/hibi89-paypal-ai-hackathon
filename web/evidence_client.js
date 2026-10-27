// Display live read-only SQLite counts; not a live PayPal/DBVORA/SOVIA connector.
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
      'DBVORA-inspired SQLite integrity: '+data.dbvoraInspired.integrity+
      ' (read-only; backup not verified).\n'+
      'SOVIA-style policy snapshot: '+
      data.soviaStyle.checks.map(c=>c.rule+'='+c.status).join('; ')+'\n'+
      'Synthetic BI: quotes '+bi.quotes.total+', approved '+bi.quotes.approved+
      ', approval rate '+(bi.humanApprovalRate.percentage??'N/A')+'%'+
      ', local payment claims '+bi.paymentAttempts.total+
      ', unresolved '+bi.paymentAttempts.unresolved+
      '.\nProvider transactions measured: NO. Market demand measured: NO. '+
      'No signed event-log or independently deployed services.';
  }catch(e){
    evidenceOutput.textContent='Read-only evidence unavailable: '+
      (e?.message||'EVIDENCE_READ_FAILED');
  }finally{evidenceBusy=false;evidenceRefresh.disabled=false;}
}
evidenceRefresh.addEventListener('click',readLocalEvidence);
readLocalEvidence();
