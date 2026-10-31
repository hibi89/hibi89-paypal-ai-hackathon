// Local-only typed merchant dossier. Inputs are fictional unverified assertions.
// This module NEVER creates PayPal invoices or submits dispute evidence.
const issueKinds=new Set(['NON_DELIVERY','QUALITY','BILLING']);
const deliveryKinds=new Set(['NOT_DELIVERED','DELIVERED','REVIEWED']);
const evidenceKinds=['contract_terms','delivery_record','review_decision'];
const fieldError=()=>{const e=new Error('INVALID_SYNTHETIC_DOSSIER');e.code='INVALID_SYNTHETIC_DOSSIER';throw e;};

export function buildSyntheticMerchantDossier(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).sort().join(',')!==['amountMinor','contractRef','deliveryStatus','evidenceKinds','issueType'].sort().join(','))
  fieldError();
 const {contractRef,amountMinor,issueType,deliveryStatus,evidenceKinds:provided}=input;
 if(typeof contractRef!=='string'||!/^demo-[a-z0-9-]{3,32}$/.test(contractRef)||
    !Number.isSafeInteger(amountMinor)||amountMinor<100||amountMinor>1000000||
    !issueKinds.has(issueType)||!deliveryKinds.has(deliveryStatus)||
    !Array.isArray(provided)||provided.length>3||
    provided.some(x=>!evidenceKinds.includes(x))||
    new Set(provided).size!==provided.length)fieldError();
 const required=['contract_terms'];
 if(deliveryStatus!=='NOT_DELIVERED')required.push('delivery_record');
 if(deliveryStatus==='REVIEWED')required.push('review_decision');
 const evidence=evidenceKinds.map(kind=>({
  kind,reportedPresent:provided.includes(kind),required:required.includes(kind),
  verified:false
 }));
 const missingRequired=evidence.filter(x=>x.required&&!x.reportedPresent).map(x=>x.kind);
 const contradictions=[];
 if(issueType==='NON_DELIVERY'&&deliveryStatus==='REVIEWED')
  contradictions.push('NON_DELIVERY_CONFLICTS_WITH_REVIEWED');
 if(deliveryStatus==='NOT_DELIVERED'&&provided.includes('delivery_record'))
  contradictions.push('DELIVERY_EVIDENCE_CONFLICTS_WITH_NOT_DELIVERED');
 const reviewState=contradictions.length?'CONFLICT_REQUIRES_HUMAN_REVIEW':
  missingRequired.length?'MISSING_EVIDENCE':'READY_FOR_HUMAN_REVIEW';
 return Object.freeze({
  status:'DRAFT_ONLY',
  invoice:{
   reference:contractRef,currency:'USD',amountMinor,
   lineItems:[{label:'Fictional service milestone',quantity:1,unitAmountMinor:amountMinor}],
   totalMinor:amountMinor,sent:false
  },
  dispute:{
   issueType,deliveryStatus,evidenceChecklist:evidence,
   missingRequired,contradictions,reviewState,
   submitted:false,
   verifiedEvidenceCount:0
  },
  approvalRequired:true,
  paypalInvoiceCreated:false,paypalDisputeSubmitted:false,
  source:'USER_ENTERED_FICTIONAL_ASSERTIONS_UNVERIFIED',
  providerProof:false,
  paymentState:'NOT_PAID'
 });
}
