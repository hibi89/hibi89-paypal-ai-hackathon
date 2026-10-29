// Process-local issuance registry for synthetic negotiation proposals.
// An issued proposal is not a payment authorization or a durable contract.
export function createNegotiationRegistry(){
 const issued=new Map();
 const key=(owner,merchant,quote,version)=>JSON.stringify([owner,merchant,quote,version]);
 return {
  issue({owner,merchant,proposal}){
   if(proposal.status!=='PROPOSED')return;
   issued.set(key(owner,merchant,proposal.quoteId,proposal.quoteVersion),{
    agreedMinor:proposal.agreedMinor,currency:proposal.currency,status:proposal.status,
    paymentAuthorized:proposal.paymentAuthorized
   });
  },
  verify({owner,merchant,proposal}){
   if(!proposal||typeof proposal!=='object')return false;
   const saved=issued.get(key(owner,merchant,proposal.quoteId,proposal.quoteVersion));
   return !!saved&&saved.agreedMinor===proposal.agreedMinor&&saved.currency===proposal.currency&&
    saved.status===proposal.status&&saved.paymentAuthorized===false&&proposal.paymentAuthorized===false;
  }
 };
}
