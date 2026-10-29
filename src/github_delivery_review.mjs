// Offline-only deliverable review decision. Evidence is caller-supplied and unverified.
// This module never executes GitHub API calls, PayPal captures, payouts or escrow.
export function assessGithubDelivery({repository,commitSha,prNumber,checks=[],reviewApproved=false,requiredChecks=[]}={}){
 if(typeof repository!=='string'||!/^[a-zA-Z0-9_.-]{1,100}\/[a-zA-Z0-9_.-]{1,100}$/.test(repository))throw new TypeError('INVALID_REPOSITORY');
 if(typeof commitSha!=='string'||!/^[a-f0-9]{40}$/.test(commitSha))throw new TypeError('INVALID_COMMIT');
 if(!Number.isSafeInteger(prNumber)||prNumber<1)throw new TypeError('INVALID_PR');
 if(!Array.isArray(checks)||!Array.isArray(requiredChecks)||checks.length>100||requiredChecks.length>30)throw new TypeError('INVALID_CHECKS');
 if(checks.some(x=>!x||typeof x.name!=='string'||!['success','failure','pending','cancelled'].includes(x.conclusion)))throw new TypeError('INVALID_CHECK');
 if(requiredChecks.some(x=>typeof x!=='string'||!x||x.length>100))throw new TypeError('INVALID_REQUIRED_CHECK');
 const found=new Map(checks.map(x=>[x.name,x.conclusion]));
 const missing=requiredChecks.filter(x=>!found.has(x));
 const failed=requiredChecks.filter(x=>found.has(x)&&found.get(x)!=='success');
 const checksPass=requiredChecks.length>0&&missing.length===0&&failed.length===0;
 const eligible=checksPass&&reviewApproved===true;
 return Object.freeze({source:'UNVERIFIED_OFFLINE_INPUT',repository,commitSha,prNumber,checksPass,reviewApproved:reviewApproved===true,missingChecks:missing,nonPassingChecks:failed,decision:eligible?'READY_FOR_HUMAN_SETTLEMENT_REVIEW':'HOLD',paymentAuthorized:false,payoutAuthorized:false,escrowClaimed:false});
}
