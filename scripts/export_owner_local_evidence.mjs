// Opt-in owner PC, PRIVATE LOCAL ONLY, zero provider/network activity.
// Without the explicit exact flag: ZERO private SQLite reads or file writes.
import {argv,stdout} from 'node:process';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {inspectOwnerMvpReceipt} from '../src/owner_mvp_receipt.mjs';
import {summarizePrivateOwnerEvidence} from '../src/private_owner_evidence_disclosure.mjs';

if(argv.length!==3||argv[2]!=='--review-local-only'){
 stdout.write(JSON.stringify({
   status:'OWNER_EXPLICIT_LOCAL_REVIEW_FLAG_REQUIRED',
   privateSqliteRead:false,networkRequests:0,paymentPosts:0,
   artifactWritten:false,publicationAuthorized:false
 })+'\n');
 process.exitCode=2;
}else{
 try{
  // Existing immutable SQLite inspectors reject symlinks, active WAL, bad
  // lineage, invalid amounts and incomplete Gemini audit.
  const original=inspectOwnerMvpReceipt({
   directory:join(homedir(),'.paypal-ai-mvp-private')
  });
  const publicSafe=summarizePrivateOwnerEvidence(original);
  const dir=new URL('../output/submission/',import.meta.url);
  mkdirSync(dir,{recursive:true});
  const target=new URL('owner_local_provider_disclosure_PRIVATE_REVIEW.json',dir);
  writeFileSync(target,JSON.stringify(publicSafe,null,2)+'\n',{
   encoding:'utf8',flag:'w',mode:0o600
  });
  stdout.write(JSON.stringify(publicSafe)+'\n');
  if(publicSafe.localDataConsistencyEstablished!==true)
   process.exitCode=2;
 }catch{
  // Fail closed. Never log the private path, credential, raw data or stack.
  stdout.write(JSON.stringify({
    status:'OWNER_PRIVATE_EVIDENCE_REVIEW_FAILED',
    networkRequests:0,paymentPosts:0,publicationAuthorized:false
  })+'\n');
  process.exitCode=2;
 }
}
