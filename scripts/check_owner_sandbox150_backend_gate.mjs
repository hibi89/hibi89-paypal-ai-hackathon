// No-argument invocation is a zero-file, zero-network dry-run.
// Only --inspect opens the fixed owner-local pilot SQLite files read-only.
import {argv,env,stdout} from 'node:process';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {resolveOwnerSandbox150QuoteScope}
 from '../src/owner_private_a2a_quote_binding.mjs';
import {inspectOwnerSandbox150BackendGate}
 from '../src/owner_sandbox150_backend_gate.mjs';

const write=data=>stdout.write(JSON.stringify(data)+'\n');
const common={mode:'WORKNOVA_OWNER_150_READONLY_BACKEND_GATE',
 networkRequests:0,fileWritesPerformed:false,providerPostsPerformed:false,
 paymentAuthorized:false,productionReady:false,autoRetry:false};
if(argv.length!==3||argv[2]!=='--inspect'){
 write({...common,status:'DRY_RUN_NO_FILE_NO_NETWORK',
  requiresExactFlag:'--inspect',quoteAmountMinor:150,currency:'USD'});
}else{
 try{
  const privateDirectory=join(homedir(),'.paypal-ai-pilot-private');
  const quoteScope=resolveOwnerSandbox150QuoteScope({
   environment:env,privateDirectory
  });
  // A caller-provided path must never redirect an inspection to the historical
  // MVP or a foreign workspace, even if otherwise syntactically well formed.
  if(quoteScope.filename!==join(privateDirectory,'owner-sandbox150-part1.sqlite'))
   throw Object.assign(new Error('PRIVATE_SCOPE'),{
    code:'OWNER150_GATE_DEDICATED_QUOTE_REQUIRED'
   });
  const result=inspectOwnerSandbox150BackendGate({
   privateDirectory,quoteScope,
   part2Filename:join(privateDirectory,'part2-owner-sandbox150.sqlite'),
   budgetFilename:join(privateDirectory,'part2-owner-sandbox150-quota.sqlite')
  });
  write(result);
 }catch(e){
  const code=String(e?.code??'');
  write({...common,status:'PRIVATE_OWNER_BACKEND_GATE_BLOCKED',
   reasonCode:/^OWNER(?:150|_A2A)_[A-Z0-9_]{3,90}$/.test(code)
    ?code:'OWNER150_GATE_UNVERIFIED',
   nextAction:'PRIVATE_OPERATOR_CONFIGURATION_OR_EVIDENCE_REVIEW_REQUIRED'
  });
  process.exitCode=2;
 }
}
