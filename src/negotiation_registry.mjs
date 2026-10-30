// Process-local issuance registry for synthetic negotiation proposals.
// An issued proposal is not a payment authorization or a durable contract.
export function createNegotiationRegistry(){
 const issued=new Map();
 const key=(owner,merchant,quote,version)=>JSON.stringify([owner,merchant,quote,version]);
 const fingerprint=proposal=>JSON.stringify(proposal);
 return {
  issue({owner,merchant,proposal}){
   if(proposal?.status!=='PROPOSED'||proposal.paymentAuthorized!==false)return;
   issued.set(key(owner,merchant,proposal.quoteId,proposal.quoteVersion),fingerprint(proposal));
  },
  verify({owner,merchant,proposal}){
   if(!proposal||typeof proposal!=='object'||proposal.status!=='PROPOSED'||proposal.paymentAuthorized!==false)return false;
   const saved=issued.get(key(owner,merchant,proposal.quoteId,proposal.quoteVersion));
   return saved!==undefined&&saved===fingerprint(proposal);
  }
 };
}
