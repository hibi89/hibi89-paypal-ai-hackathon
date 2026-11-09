// Owner-local read-only cross-part candidate. No session, approval or POST.
import {argv,env,stdout} from 'node:process';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {resolveOwnerSandbox150QuoteScope}
 from '../src/owner_private_a2a_quote_binding.mjs';
import {inspectOwnerSandbox150CrossPartReadiness}
 from '../src/owner_private_crosspart_readiness.mjs';

const write=(status,fields={})=>stdout.write(JSON.stringify({
 status,mode:'OWNER_PRIVATE_150_CROSSPART_READ_ONLY',
 networkRequests:0,fileWritesPerformed:false,paymentAuthorized:false,
 crossPartReviewLinked:false,...fields
})+'\n');
if(argv.length!==3||argv[2]!=='--review'){
 write('DRY_RUN_NO_DISK_NO_NETWORK',{requiresExplicitFlag:'--review'});
}else{
 const dir=join(homedir(),'.paypal-ai-pilot-private');
 try{
  const quoteScope=resolveOwnerSandbox150QuoteScope({
   environment:env,privateDirectory:dir
  });
  const result=inspectOwnerSandbox150CrossPartReadiness({
   privateDirectory:dir,quoteScope,
   part2Filename:join(dir,'part2-owner-sandbox150.sqlite'),
   budgetFilename:join(dir,'part2-owner-sandbox150-quota.sqlite')
  });
  stdout.write(JSON.stringify(result)+'\n');
 }catch(e){
  write('OWNER_PRIVATE_150_CROSSPART_NOT_READY',{
   reasonCode:typeof e?.code==='string'&&/^OWNER_[A-Z0-9_]{3,100}$/.test(e.code)
    ?e.code:'PRIVATE_REVIEW_UNVERIFIED'
  });
  process.exitCode=2;
 }
}
