// Opt-in owner PC, PRIVATE LOCAL ONLY, zero provider/network activity.
// Without the explicit exact flag: ZERO private SQLite reads or file writes.
import {argv,stdout} from 'node:process';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdirSync,lstatSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
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
  // Never overwrite an owner's previously reviewed private evidence. Refuse
  // symlinked output directories, and create each file exclusively.
  const outputRoot=new URL('../output/',import.meta.url);
  const dir=new URL('submission/',outputRoot);
  for(const folder of [outputRoot,dir]){
   try{mkdirSync(folder,{mode:0o700})}
   catch(error){if(error?.code!=='EEXIST')throw error}
   const info=lstatSync(folder);
   if(!info.isDirectory()||info.isSymbolicLink())
    throw Error('OWNER_PRIVATE_OUTPUT_PATH_UNSAFE');
  }
  const privateArtifactFilename='owner_local_provider_disclosure_PRIVATE_REVIEW_'+
   randomUUID().replaceAll('-','')+'.json';
  const savedReport=Object.freeze({...publicSafe,privateArtifactFilename});
  const target=new URL(privateArtifactFilename,dir);
  writeFileSync(target,JSON.stringify(savedReport,null,2)+'\n',{
   encoding:'utf8',flag:'wx',mode:0o600
  });
  stdout.write(JSON.stringify(savedReport)+'\n');
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
