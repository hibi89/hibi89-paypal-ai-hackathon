// Local-only two-part reviewer evidence status. Never equate a skipped browser
// test with a full contest acceptance, real provider proof or production release.
export function classifyLocalVerification(results,{core=false}={}){
 if(!Array.isArray(results)||results.some(r=>!r||typeof r.name!=='string'||
    !['PASS','FAIL','SKIP'].includes(r.status)))
  throw new TypeError('INVALID_LOCAL_VERIFICATION_RESULTS');
 const byName=new Map(results.map(r=>[r.name,r.status]));
 const essentials=['GIT_HEAD','NODE_VERSION','MASTER_PROGRESS','NODE_REGRESSION',
    'SYNTHETIC_MVP_E2E'];
 const criticalFailed=essentials.some(k=>byName.get(k)!=='PASS')||
    results.some(x=>x.status==='FAIL')||
    (!core&&byName.get('REVIEWER_LOOPBACK')!=='PASS'&&
      byName.get('REVIEWER_LOOPBACK')!=='SKIP');
 const browserNames=['CHROMIUM_LOOPBACK','CHROMIUM_PART2'];
 const twoPartBrowserVerified=browserNames.every(k=>byName.get(k)==='PASS')&&
    byName.get('REVIEWER_LOOPBACK')==='PASS';
 const status=criticalFailed?'VERIFY_LOCAL_FAIL':
   core?'VERIFY_LOCAL_CORE_PASS':
   twoPartBrowserVerified?'VERIFY_LOCAL_TWO_PART_PASS':'VERIFY_LOCAL_PARTIAL';
 return Object.freeze({status,twoPartBrowserVerified,
   browserProof:Object.freeze(Object.fromEntries(
    browserNames.map(k=>[k,byName.get(k)??'NOT_RUN']))),
   submissionEligible:false,productionVerified:false,realProviderVerified:false});
}

export function localVerificationExitCode(status){
 switch(status){
  case 'VERIFY_LOCAL_TWO_PART_PASS':
  case 'VERIFY_LOCAL_CORE_PASS': return 0;
  case 'VERIFY_LOCAL_PARTIAL': return 2;
  case 'VERIFY_LOCAL_FAIL': return 1;
  default: throw new TypeError('UNRECOGNIZED_LOCAL_VERIFICATION_STATUS');
 }
}
