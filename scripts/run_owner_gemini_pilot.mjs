// Runs no provider call unless exact flags, terminal TTY and typed consent.
// Usage: npm run pilot:gemini -- --execute --owner-authorized --free-tier-confirmed
// Use a personally verified no-charge Gemini project and synthetic text only.
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {stdin,stderr,stdout,env,argv} from 'node:process';
import {parseOwnerGeminiPilotArgs,runOwnerGeminiLocalPilot} from '../src/owner_gemini_local_pilot.mjs';

const parsed=parseOwnerGeminiPilotArgs(argv.slice(2));
if(!parsed.valid||!stdin.isTTY||!stderr.isTTY){
  stdout.write(JSON.stringify({status:'LOCAL_TTY_AND_EXPLICIT_FLAGS_REQUIRED',
    networkRequests:0,credentialsEmitted:false})+'\n');
  process.exitCode=2;
}else{
  // The last consent gate is intentionally interactive and distinct from flags.
  const rl=createInterface({input:stdin,output:stderr,terminal:true});
  let approved=false;
  try{
    const typed=await rl.question(
      'PRIVATE local Gemini Free-tier proof, ONE synthetic API request; '+
      'no account-tier guarantee. Type GEMINI ONE CALL: ');
    approved=typed==='GEMINI ONE CALL';
  }finally{rl.close();}
  const result=await runOwnerGeminiLocalPilot({
    execute:true,ownerAuthorized:true,freeTierConfirmed:true,
    operatorConfirmed:approved,apiKey:approved?env.GEMINI_API_KEY:undefined,
    budgetFilename:join(homedir(),'.paypal-ai-pilot-private','gemini-one-shot.sqlite'),
    fetchImpl:approved?globalThis.fetch:undefined
  });
  stdout.write(JSON.stringify(result)+'\n');
  process.exitCode=result.status==='GEMINI_SKILLS_PERSISTED_LOCAL_ONLY'?0:2;
}
