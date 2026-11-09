// Read-only owner-side comparison of EXISTING private Part1/Part2 SQLite data.
// Default = legacy $270 flow; explicitly opt into the quote-bound $1.50 pilot.
// No credentials, no HTTP, no provider GET/POST, no SQLite creation or writes.
import {homedir} from 'node:os';
import {join} from 'node:path';
import {argv,env,stdout} from 'node:process';
import {inspectOwnerTwoPartEvidence}
 from '../src/owner_private_two_part_evidence.mjs';
import {resolveOwnerSandbox150QuoteScope}
 from '../src/owner_private_a2a_quote_binding.mjs';

const args=argv.slice(2);
const sandbox=args.length===1&&args[0]==='--sandbox-pilot-150';
const exact=args.length===0||sandbox;
const output=(status,fields={})=>stdout.write(JSON.stringify({
 status,networkRequests:0,fileWritesPerformed:false,paymentAuthorized:false,
 ...fields
})+'\n');

const base=join(homedir(),'.paypal-ai-pilot-private');
let pilotScope=null;
if(exact&&sandbox){
 try{pilotScope=resolveOwnerSandbox150QuoteScope({
  environment:env,privateDirectory:base
 })}catch{/* Missing or conflicting private identity: never inspect data. */}
}
if(!exact){
 output('READ_ONLY_UNSUPPORTED_ARGUMENTS');
 process.exitCode=2;
}else if(sandbox&&!pilotScope){
 output('PRIVATE_SANDBOX_QUOTE_SCOPE_REQUIRED');
 process.exitCode=2;
}else{
 try{
  const result=inspectOwnerTwoPartEvidence({
   ownerDirectory:join(homedir(),'.paypal-ai-mvp-private'),
   part2Filename:join(base,sandbox
    ?'part2-owner-sandbox150.sqlite':'part2-owner-lab.sqlite'),
   budgetFilename:join(base,sandbox
    ?'part2-owner-sandbox150-quota.sqlite':'part2-owner-quota.sqlite'),
   scope:sandbox
    ?{actor:pilotScope.actorId,
      merchant:pilotScope.merchantId,
      job:'part2_sandbox_150_once'}
    :{actor:'operator_owner',merchant:'fictional_merchant',
      job:'part2_demo_once'},
   sandboxPilotQuoteId:sandbox?pilotScope.quoteId:null
  });
  stdout.write(JSON.stringify(result)+'\n');
  if(['BOTH_PARTS_NEED_REVIEW','PART1_NOT_VERIFIED','PART2_NOT_VERIFIED']
   .includes(result.status))process.exitCode=2;
 }catch{
  output('PRIVATE_TWO_PART_EVIDENCE_REVIEW_REQUIRED');
  process.exitCode=2;
 }
}
